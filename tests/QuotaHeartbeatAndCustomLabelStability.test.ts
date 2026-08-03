import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
  HIDDEN_TAB_MIN_INTERVAL_MS,
  MIN_ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_STORAGE_KEY,
  acquireHeartbeatLock,
  computeBackoffDelayMs,
  isHeartbeatLockHeld,
  nextRetryTimestamp,
  releaseHeartbeatLock,
  resetHeartbeatLock,
  shouldPersistActivity,
  shouldSendHeartbeat,
} from "../lib/services/analytics/heartbeatScheduler";

import {
  mapInfrastructureError,
  isQuotaError,
  isUnavailableError,
} from "../lib/services/infrastructureErrors";

import {
  canEditConversationLabel,
  isRawInfrastructureMessage,
  resolveLabelErrorMessage,
  shouldSendLabelUpdate,
} from "../lib/services/conversations/customLabelClient";

import {
  isConversationConverted,
  isConversationManuallyConverted,
  isConversationSystemConverted,
  normalizeConversationStatus,
} from "../lib/services/conversations/conversationStatusResolver";

const REPO_ROOT = resolve(__dirname, "..");
const readSource = (relPath: string) => readFileSync(resolve(REPO_ROOT, relPath), "utf8");

const LABEL_ROUTE = "app/api/clinics/[clinicId]/conversations/[conversationId]/custom-label/route.ts";
const LABELS_LIST_ROUTE = "app/api/clinics/[clinicId]/custom-labels/route.ts";
const LOGS_TAB = "components/clinic/logs/ConversationLogsTab.tsx";
const DROPDOWN = "components/clinic/logs/ConversationStatusDropdown.tsx";
const TRACKER = "components/analytics/ActivityTracker.tsx";

const NOW = 1_770_000_000_000;

describe("Quota Incident: Heartbeat & Custom Label Stability", () => {
  describe("1. One heartbeat timer after repeated renders", () => {
    beforeEach(() => resetHeartbeatLock());

    it("grants the loop to a single owner even when the tracker mounts repeatedly", () => {
      expect(acquireHeartbeatLock("instance-a")).toBe(true);
      expect(acquireHeartbeatLock("instance-b")).toBe(false);
      expect(acquireHeartbeatLock("instance-c")).toBe(false);
      expect(isHeartbeatLockHeld()).toBe(true);
    });

    it("is re-entrant for the same owner so a re-render never opens a second loop", () => {
      expect(acquireHeartbeatLock("instance-a")).toBe(true);
      expect(acquireHeartbeatLock("instance-a")).toBe(true);
      expect(acquireHeartbeatLock("instance-a")).toBe(true);
    });

    it("suppresses a concurrent send while one is already in flight", () => {
      const decision = shouldSendHeartbeat({
        now: NOW,
        lastSentAt: NOW - HEARTBEAT_INTERVAL_MS * 2,
        visibility: "visible",
        inFlight: true,
        retryNotBefore: null,
      });
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("in_flight");
    });
  });

  describe("2. Interval cleanup on unmount / logout", () => {
    beforeEach(() => resetHeartbeatLock());

    it("releases the loop on unmount so a later mount can take it over", () => {
      expect(acquireHeartbeatLock("instance-a")).toBe(true);
      releaseHeartbeatLock("instance-a");
      expect(isHeartbeatLockHeld()).toBe(false);
      expect(acquireHeartbeatLock("instance-b")).toBe(true);
    });

    it("ignores a release from a non-owner", () => {
      acquireHeartbeatLock("instance-a");
      releaseHeartbeatLock("instance-b");
      expect(isHeartbeatLockHeld()).toBe(true);
      expect(acquireHeartbeatLock("instance-b")).toBe(false);
    });

    it("clears the interval and listeners in the tracker cleanup", () => {
      const src = readSource(TRACKER);
      expect(src).toContain("clearInterval(interval)");
      expect(src).toContain("releaseHeartbeatLock(instanceId)");
      expect(src).toContain('window.removeEventListener("beforeunload", handleUnload)');
      expect(src).toContain('document.removeEventListener("visibilitychange", handleVisibilityChange)');
    });

    it("drops the stored session id on logout", () => {
      const src = readSource(TRACKER);
      expect(src).toContain("writeStoredSessionId(null)");
      expect(SESSION_STORAGE_KEY).toBe("cb_analytics_session_id");
    });
  });

  describe("3. Hidden-tab heartbeat throttling", () => {
    it("throttles a hidden tab to a much longer interval", () => {
      const decision = shouldSendHeartbeat({
        now: NOW,
        lastSentAt: NOW - HEARTBEAT_INTERVAL_MS,
        visibility: "hidden",
        inFlight: false,
        retryNotBefore: null,
      });
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("hidden_throttled");
    });

    it("still reports eventually from a hidden tab", () => {
      const decision = shouldSendHeartbeat({
        now: NOW,
        lastSentAt: NOW - HIDDEN_TAB_MIN_INTERVAL_MS,
        visibility: "hidden",
        inFlight: false,
        retryNotBefore: null,
      });
      expect(decision.send).toBe(true);
    });

    it("sends on the normal cadence when visible", () => {
      expect(
        shouldSendHeartbeat({
          now: NOW,
          lastSentAt: NOW - HEARTBEAT_INTERVAL_MS,
          visibility: "visible",
          inFlight: false,
          retryNotBefore: null,
        }).send
      ).toBe(true);

      expect(
        shouldSendHeartbeat({
          now: NOW,
          lastSentAt: NOW - 60_000,
          visibility: "visible",
          inFlight: false,
          retryNotBefore: null,
        }).reason
      ).toBe("too_soon");
    });

    it("uses an interval of at least five minutes", () => {
      expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
      expect(HIDDEN_TAB_MIN_INTERVAL_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS);
    });

    it("skips the server write when the stored activity timestamp is already recent", () => {
      expect(shouldPersistActivity(NOW, NOW - 30_000)).toBe(false);
      expect(shouldPersistActivity(NOW, NOW - MIN_ACTIVITY_WRITE_INTERVAL_MS)).toBe(true);
      expect(shouldPersistActivity(NOW, null)).toBe(true);
    });
  });

  describe("4. No immediate retry after RESOURCE_EXHAUSTED", () => {
    it("recognises the Firestore quota rejection in both SDK shapes", () => {
      expect(isQuotaError({ code: 8, message: "8 RESOURCE_EXHAUSTED: Quota exceeded" })).toBe(true);
      expect(isQuotaError({ code: "resource-exhausted" })).toBe(true);
      expect(isQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."))).toBe(true);
      expect(isQuotaError(new Error("Conversation not found"))).toBe(false);
      expect(isUnavailableError({ code: 14 })).toBe(true);
    });

    it("never retries on the following tick", () => {
      expect(computeBackoffDelayMs(1)).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
      const retryAt = nextRetryTimestamp(NOW, 1);
      const decisionAtNextTick = shouldSendHeartbeat({
        now: NOW + 60_000,
        lastSentAt: NOW,
        visibility: "visible",
        inFlight: false,
        retryNotBefore: retryAt,
      });
      expect(decisionAtNextTick.send).toBe(false);
      expect(decisionAtNextTick.reason).toBe("backoff");
    });

    it("backs off exponentially and stays capped", () => {
      expect(computeBackoffDelayMs(0)).toBe(0);
      expect(computeBackoffDelayMs(1)).toBe(BACKOFF_BASE_MS);
      expect(computeBackoffDelayMs(2)).toBe(BACKOFF_BASE_MS * 2);
      expect(computeBackoffDelayMs(3)).toBe(BACKOFF_BASE_MS * 4);
      expect(computeBackoffDelayMs(50)).toBe(BACKOFF_MAX_MS);
    });

    it("resumes once the backoff window has elapsed", () => {
      const retryAt = nextRetryTimestamp(NOW, 1);
      expect(
        shouldSendHeartbeat({
          now: retryAt,
          lastSentAt: NOW,
          visibility: "visible",
          inFlight: false,
          retryNotBefore: retryAt,
        }).send
      ).toBe(true);
    });

    it("clears the failure counter after a success", () => {
      const src = readSource(TRACKER);
      expect(src).toContain("consecutiveFailuresRef.current = 0");
      expect(src).toContain("retryNotBeforeRef.current = null");
    });

    it("honours the backoff even on the forced mount/visibility send", () => {
      const src = readSource(TRACKER);
      expect(src).toContain(
        "if (retryNotBeforeRef.current !== null && now < retryNotBeforeRef.current) return;"
      );
      // The guard must sit ahead of the `force` branch so it cannot be skipped.
      const guardIndex = src.indexOf("now < retryNotBeforeRef.current");
      const forceBranchIndex = src.indexOf("if (!force) {");
      expect(guardIndex).toBeGreaterThan(-1);
      expect(forceBranchIndex).toBeGreaterThan(guardIndex);
    });

    it("counts one failure per rejection for both HTTP errors and network faults", () => {
      const src = readSource(TRACKER);
      expect((src.match(/consecutiveFailuresRef\.current \+= 1/g) || []).length).toBe(2);
    });
  });

  describe("5. One custom-label GET per clinic page, not per row", () => {
    it("fetches labels only in the parent tab, never in the per-row dropdown", () => {
      const dropdown = readSource(DROPDOWN);
      expect(dropdown).not.toContain("/custom-labels");

      const tab = readSource(LOGS_TAB);
      const occurrences = tab.split("/custom-labels").length - 1;
      expect(occurrences).toBe(1);
    });

    it("passes one shared label array down to every row", () => {
      const tab = readSource(LOGS_TAB);
      expect(tab).toContain("customLabels={customLabels}");
    });

    it("does not re-run the label fetch on unstable auth-context identities", () => {
      const tab = readSource(LOGS_TAB);
      expect(tab).toContain("getTokenRef.current()");
      expect(tab).not.toContain("}, [clinicId, getToken]);");
    });

    it("reads the label subcollection once per request", () => {
      const route = readSource(LABELS_LIST_ROUTE);
      expect(route).not.toContain("await labelsRef.get()");
      expect(route).toContain('labelsRef.where("isActive", "==", true).get()');
    });
  });

  describe("6. One PATCH request per deliberate selection", () => {
    it("sends exactly one request when marking a conversation converted", () => {
      expect(
        shouldSendLabelUpdate({
          selectedLabelId: "converted_to_appointment",
          currentlyManuallyConverted: false,
          currentCustomLabelId: null,
          inFlight: false,
        })
      ).toBe(true);
    });

    it("sends nothing when re-selecting the state already persisted", () => {
      expect(
        shouldSendLabelUpdate({
          selectedLabelId: "converted_to_appointment",
          currentlyManuallyConverted: true,
          currentCustomLabelId: "converted_to_appointment",
          inFlight: false,
        })
      ).toBe(false);

      expect(
        shouldSendLabelUpdate({
          selectedLabelId: null,
          currentlyManuallyConverted: false,
          currentCustomLabelId: null,
          inFlight: false,
        })
      ).toBe(false);
    });

    it("sends one request when clearing an existing label", () => {
      expect(
        shouldSendLabelUpdate({
          selectedLabelId: null,
          currentlyManuallyConverted: true,
          currentCustomLabelId: "converted_to_appointment",
          inFlight: false,
        })
      ).toBe(true);
    });

    it("never auto-retries a failed update", () => {
      const dropdown = readSource(DROPDOWN);
      expect(dropdown).not.toMatch(/setTimeout\s*\([^)]*handleSelectLabel/);
      expect(dropdown).not.toMatch(/setInterval/);
      expect(dropdown).not.toMatch(/while\s*\(/);
      // A single fetch call site: the deliberate user selection.
      expect((dropdown.match(/await fetch\(/g) || []).length).toBe(1);
    });
  });

  describe("7. Double-click protection", () => {
    it("drops a second click while the first request is outstanding", () => {
      expect(
        shouldSendLabelUpdate({
          selectedLabelId: "converted_to_appointment",
          currentlyManuallyConverted: false,
          currentCustomLabelId: null,
          inFlight: true,
        })
      ).toBe(false);
    });

    it("guards with a ref rather than relying on the disabled attribute alone", () => {
      const dropdown = readSource(DROPDOWN);
      expect(dropdown).toContain("inFlightRef");
      expect(dropdown).toContain("inFlight: inFlightRef.current");
      expect(dropdown).toContain("disabled={loading}");
    });
  });

  describe("8. Manual conversion persists after refresh", () => {
    it("reads the persisted manual conversion field back from the document", () => {
      const persisted = {
        id: "conv-1",
        status: "answered",
        manualConversionStatus: "converted_to_appointment",
        manualConversionMarkedAt: "2026-08-03T17:00:00.000Z",
        manualConversionMarkedBy: "user-1",
      };
      expect(isConversationManuallyConverted(persisted)).toBe(true);
      expect(isConversationConverted(persisted)).toBe(true);
    });

    it("writes the dedicated manual conversion fields", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).toContain("manualConversionStatus");
      expect(route).toContain("manualConversionMarkedAt");
      expect(route).toContain("manualConversionMarkedBy");
      expect(route).toContain("updatedAt");
    });
  });

  describe("9. System conversation status remains unchanged", () => {
    it("never writes the automatic status fields", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).not.toMatch(/updatePayload\.status\s*=/);
      expect(route).not.toMatch(/updatePayload\.conversationStatus\s*=/);
      expect(route).not.toMatch(/updatePayload\.systemStatus\s*=/);
      expect(route).not.toMatch(/\bstatus:\s*["'`]/);
    });

    it("leaves the resolved system status untouched when a manual label is added", () => {
      const base = { status: "answered", convertedToAppointment: false, appointmentId: null };
      const withManual = { ...base, manualConversionStatus: "converted_to_appointment" };

      const before = normalizeConversationStatus(base.status, {
        convertedToAppointment: base.convertedToAppointment,
        appointmentId: base.appointmentId,
      });
      const after = normalizeConversationStatus(withManual.status, {
        convertedToAppointment: withManual.convertedToAppointment,
        appointmentId: withManual.appointmentId,
      });

      expect(before).toBe("successfully_answered");
      expect(after).toBe(before);
      expect(isConversationSystemConverted(withManual)).toBe(false);
    });
  });

  describe("10. No appointment is created", () => {
    it("does not touch the appointments collection", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).not.toContain('collection("appointments")');
      expect(route).not.toMatch(/\.add\(/);
      expect(route).not.toContain("appointmentId:");
    });

    it("writes only to the target conversation document", () => {
      const route = readSource(LABEL_ROUTE);
      const writes = route.match(/await\s+\w+\.(set|update)\(/g) || [];
      expect(writes).toHaveLength(1);
      expect(route).toContain("await convRef.set(sanitizedPayload, { merge: true })");
    });
  });

  describe("11. No appointment email is sent", () => {
    it("imports no mail or notification transport", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route.toLowerCase()).not.toContain("resend");
      expect(route.toLowerCase()).not.toContain("sendmail");
      expect(route.toLowerCase()).not.toContain("sendemail");
      expect(route.toLowerCase()).not.toContain("nodemailer");
      expect(route).not.toContain("notify");
    });
  });

  describe("12. Manual conversion updates the KPI", () => {
    it("counts a manually marked conversation as converted", () => {
      const log = { status: "answered", manualConversionStatus: "converted_to_appointment" };
      expect(isConversationConverted(log)).toBe(true);
    });

    it("does not count an unlabelled, unconverted conversation", () => {
      const log = { status: "answered", manualConversionStatus: null, appointmentId: null };
      expect(isConversationConverted(log)).toBe(false);
    });
  });

  describe("13. Automatic plus manual conversion is counted once", () => {
    const countConverted = (logs: any[]) => logs.filter(isConversationConverted).length;

    it("counts a doubly-marked conversation a single time", () => {
      const both = {
        id: "conv-1",
        status: "appointment",
        appointmentId: "appt-1",
        manualConversionStatus: "converted_to_appointment",
      };
      expect(isConversationSystemConverted(both)).toBe(true);
      expect(isConversationManuallyConverted(both)).toBe(true);
      expect(countConverted([both])).toBe(1);
    });

    it("counts a mixed set once per conversation", () => {
      const logs = [
        { id: "a", status: "appointment", appointmentId: "appt-1" },
        { id: "b", status: "answered", manualConversionStatus: "converted_to_appointment" },
        {
          id: "c",
          status: "appointment",
          appointmentId: "appt-2",
          manualConversionStatus: "converted_to_appointment",
        },
        { id: "d", status: "answered" },
      ];
      expect(countConverted(logs)).toBe(3);
    });
  });

  describe("14. Removing the label recalculates correctly", () => {
    it("drops out of the KPI when there is no automatic conversion", () => {
      const before = { id: "a", status: "answered", manualConversionStatus: "converted_to_appointment" };
      const after = {
        id: "a",
        status: "answered",
        manualConversionStatus: null,
        customLabel: null,
        customLabelId: null,
        customLabelName: null,
      };
      expect(isConversationConverted(before)).toBe(true);
      expect(isConversationConverted(after)).toBe(false);
    });

    it("stays in the KPI when a real appointment exists", () => {
      const after = {
        id: "a",
        status: "appointment",
        appointmentId: "appt-1",
        manualConversionStatus: null,
        customLabel: null,
        customLabelId: null,
        customLabelName: null,
      };
      expect(isConversationConverted(after)).toBe(true);
    });

    it("clears every manual marker so no stale signal keeps it converted", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).toContain("manualConversionRemovedAt");
      expect(route).toContain("updatePayload.manualConversionMarkedAt = null");
      expect(route).toContain("updatePayload.manualConversionMarkedBy = null");
    });
  });

  describe("15. Unauthorized cross-clinic update returns 403", () => {
    it("permits only the label-editing roles", () => {
      expect(canEditConversationLabel("superAdmin")).toBe(true);
      expect(canEditConversationLabel("admin")).toBe(true);
      expect(canEditConversationLabel("clinicAdmin")).toBe(true);
      expect(canEditConversationLabel("clinic_admin")).toBe(true);
      expect(canEditConversationLabel("clinicUser")).toBe(false);
      expect(canEditConversationLabel("agencyUser")).toBe(false);
      expect(canEditConversationLabel("viewer")).toBe(false);
      expect(canEditConversationLabel(undefined)).toBe(false);
      expect(canEditConversationLabel("")).toBe(false);
    });

    it("enforces tenant scope before doing any work", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).toContain("await requireClinicAccess(req, clinicId)");

      const authIndex = route.indexOf("requireClinicAccess");
      const writeIndex = route.indexOf("convRef.set(");
      expect(authIndex).toBeGreaterThan(-1);
      expect(writeIndex).toBeGreaterThan(authIndex);
    });

    it("returns 403 for a rejected role", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).toContain("canEditConversationLabel(auth.profile?.role)");
      expect(route).toContain('code: "FORBIDDEN"');
      expect(route).toContain("status: 403");
    });

    it("scopes the conversation document to the clinic in the path", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).toContain('.collection("clinics")');
      expect(route).toContain(".doc(clinicId)");
      expect(route).toContain('.collection("conversationLogs")');
    });
  });

  describe("16. Raw infrastructure error is not shown", () => {
    it("maps a quota rejection to 429 with a structured code", () => {
      const mapped = mapInfrastructureError({
        code: 8,
        message: "8 RESOURCE_EXHAUSTED: Quota exceeded",
      });
      expect(mapped.status).toBe(429);
      expect(mapped.code).toBe("QUOTA_EXCEEDED");
      expect(mapped.retryable).toBe(true);
      expect(isRawInfrastructureMessage(mapped.error)).toBe(false);
    });

    it("maps unavailability and timeouts to 503", () => {
      expect(mapInfrastructureError({ code: 14 }).status).toBe(503);
      expect(mapInfrastructureError({ code: 14 }).code).toBe("SERVICE_UNAVAILABLE");
      expect(mapInfrastructureError({ code: 4 }).status).toBe(503);
      expect(mapInfrastructureError({ code: 4 }).code).toBe("TIMEOUT");
    });

    it("falls back to a generic 500 for unknown failures", () => {
      const mapped = mapInfrastructureError(new Error("something odd"));
      expect(mapped.status).toBe(500);
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.error).toBe("Internal error");
    });

    it("never echoes the provider message back to the caller", () => {
      const raw = "8 RESOURCE_EXHAUSTED: Quota exceeded on project clinicbridge";
      const mapped = mapInfrastructureError({ code: 8, message: raw });
      expect(mapped.error).not.toContain("RESOURCE_EXHAUSTED");
      expect(mapped.error).not.toContain("clinicbridge");
      expect(mapped.error).not.toContain(raw);
    });

    it("shows the approved Turkish and English copy for transient failures", () => {
      expect(resolveLabelErrorMessage("QUOTA_EXCEEDED", "tr")).toBe(
        "Etiket şu anda kaydedilemedi. Lütfen kısa süre sonra tekrar deneyin."
      );
      expect(resolveLabelErrorMessage("QUOTA_EXCEEDED", "en")).toBe(
        "The label could not be saved right now. Please try again shortly."
      );
      expect(resolveLabelErrorMessage("SERVICE_UNAVAILABLE", "tr")).toBe(
        "Etiket şu anda kaydedilemedi. Lütfen kısa süre sonra tekrar deneyin."
      );
      expect(resolveLabelErrorMessage("TIMEOUT", "en")).toBe(
        "The label could not be saved right now. Please try again shortly."
      );
    });

    it("produces user-safe copy for every code", () => {
      const codes = [
        "QUOTA_EXCEEDED",
        "SERVICE_UNAVAILABLE",
        "TIMEOUT",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "NOT_FOUND",
        "INVALID_REQUEST",
        "INTERNAL_ERROR",
        null,
      ];
      for (const code of codes) {
        for (const lang of ["tr", "en"]) {
          const msg = resolveLabelErrorMessage(code, lang);
          expect(msg.length).toBeGreaterThan(0);
          expect(isRawInfrastructureMessage(msg)).toBe(false);
        }
      }
    });

    it("recognises raw provider text so it can never be rendered", () => {
      expect(isRawInfrastructureMessage("8 RESOURCE_EXHAUSTED: Quota exceeded")).toBe(true);
      expect(isRawInfrastructureMessage("Quota exceeded")).toBe(true);
      expect(isRawInfrastructureMessage("Etiket güncellenemedi")).toBe(false);
    });

    it("renders the mapped code instead of the server message in the dropdown", () => {
      const dropdown = readSource(DROPDOWN);
      expect(dropdown).toContain("resolveLabelErrorMessage(data?.code, language)");
      expect(dropdown).not.toContain("setError(err.message");
      expect(dropdown).not.toContain("err?.message && !err.message.startsWith");
    });

    it("stops the API from returning the raw exception message", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).not.toContain('error: err?.message || "Internal error"');
      expect(route).toContain("mapInfrastructureError(err)");
    });

    it("reverts the optimistic selection on failure and does not report success", () => {
      const dropdown = readSource(DROPDOWN);
      expect(dropdown).toContain(
        "onLabelUpdated(log.id, previousLabelId || null, previousLabelName || null)"
      );
    });
  });

  describe("17. Existing conversation filters continue working", () => {
    it("keeps normalizing every legacy status form", () => {
      expect(normalizeConversationStatus("answered")).toBe("successfully_answered");
      expect(normalizeConversationStatus("logs.status.collecting")).toBe(
        "collecting_appointment_information"
      );
      expect(normalizeConversationStatus("liveSupport")).toBe("live_support_required");
      expect(normalizeConversationStatus("unanswered")).toBe("unanswered");
      expect(normalizeConversationStatus("appointment")).toBe("converted_to_appointment");
    });

    it("still resolves conversion from context when no manual label exists", () => {
      expect(
        normalizeConversationStatus("answered", { appointmentId: "appt-1" })
      ).toBe("converted_to_appointment");
      expect(
        normalizeConversationStatus("answered", { convertedToAppointment: true })
      ).toBe("converted_to_appointment");
    });

    it("keeps the custom-label filter branches in the tab", () => {
      const tab = readSource(LOGS_TAB);
      expect(tab).toContain('statusFilter === "custom_labeled"');
      expect(tab).toContain('statusFilter.startsWith("label:")');
      expect(tab).toContain('statusFilter === "appointment"');
    });

    it("still recognises the legacy label id", () => {
      expect(isConversationManuallyConverted({ customLabelId: "appointment_converted" })).toBe(true);
      expect(isConversationManuallyConverted({ customLabelId: "converted_to_appointment" })).toBe(true);
      expect(isConversationManuallyConverted({ customLabel: "converted_to_appointment" })).toBe(true);
    });
  });

  describe("18. Existing appointment creation remains unchanged", () => {
    it("keeps recognising a real appointment as an automatic conversion", () => {
      expect(isConversationSystemConverted({ appointmentId: "appt-1" })).toBe(true);
      expect(isConversationSystemConverted({ convertedToAppointment: true })).toBe(true);
      expect(isConversationSystemConverted({ appointmentStatus: "created" })).toBe(true);
      expect(isConversationSystemConverted({ status: "answered" })).toBe(false);
    });

    it("never lets a manual label fabricate an automatic conversion", () => {
      const manualOnly = { status: "answered", manualConversionStatus: "converted_to_appointment" };
      expect(isConversationSystemConverted(manualOnly)).toBe(false);
      expect(manualOnly).not.toHaveProperty("appointmentId");
    });

    it("leaves appointment fields out of the label payload", () => {
      const route = readSource(LABEL_ROUTE);
      expect(route).not.toContain("appointmentStatus");
      expect(route).not.toContain("convertedToAppointment:");
    });
  });
});
