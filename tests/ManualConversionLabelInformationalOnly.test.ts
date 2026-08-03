import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MANUAL_CONVERSION_VALUE,
  buildManualLabelPayload,
  isConvertedLabelId,
  wasManuallyConverted,
} from "../lib/services/conversations/manualLabelPayload";

import {
  isConversationConverted,
  isConversationManuallyConverted,
  isConversationSystemConverted,
  normalizeConversationStatus,
} from "../lib/services/conversations/conversationStatusResolver";

import {
  logInfrastructureFailure,
  mapInfrastructureError,
} from "../lib/services/infrastructureErrors";

const REPO_ROOT = resolve(__dirname, "..");
const readSource = (relPath: string) => readFileSync(resolve(REPO_ROOT, relPath), "utf8");

/**
 * Source without comments. Assertions about what the route *does* must not be
 * satisfied or broken by prose in a docblock.
 */
const readCode = (relPath: string) =>
  readSource(relPath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LABEL_ROUTE =
  "app/api/clinics/[clinicId]/conversations/[conversationId]/custom-label/route.ts";

const NOW = "2026-08-03T21:00:00.000Z";
const ACTOR = "user-42";

/** Marks a conversation converted with the manual label. */
const mark = (previouslyConverted = false) =>
  buildManualLabelPayload({
    labelId: MANUAL_CONVERSION_VALUE,
    labelName: "Randevuya Dönüştü",
    actorUid: ACTOR,
    now: NOW,
    previouslyConverted,
  });

/** Clears the manual label. */
const clear = (previouslyConverted = true) =>
  buildManualLabelPayload({
    labelId: null,
    labelName: null,
    actorUid: ACTOR,
    now: NOW,
    previouslyConverted,
  });

/** Applies a merge payload to a document the way Firestore merge writes do. */
const applyMerge = (doc: Record<string, any>, payload: Record<string, any>) => ({
  ...doc,
  ...payload,
});

describe("Manual conversion label is informational only", () => {
  describe("1. Conversation with no phone or email", () => {
    it("builds a complete converted payload from a contact-less document", () => {
      const conversation = {
        id: "conv-1",
        status: "answered",
        patientName: null,
        patientPhone: null,
        patientEmail: null,
      };

      const payload = mark(wasManuallyConverted(conversation));
      const updated = applyMerge(conversation, payload);

      expect(payload.manualConversionStatus).toBe(MANUAL_CONVERSION_VALUE);
      expect(isConversationManuallyConverted(updated)).toBe(true);
      expect(updated.patientPhone).toBeNull();
      expect(updated.patientEmail).toBeNull();
    });

    it("never reads a contact field while deciding what to write", () => {
      const route = readCode(LABEL_ROUTE);
      expect(route).not.toContain("patientPhone");
      expect(route).not.toContain("patientEmail");
      expect(route).not.toContain("patientName");
    });
  });

  describe("2. Conversation with no appointmentId", () => {
    it("saves the label without an appointment reference", () => {
      const conversation = { id: "conv-2", status: "answered", appointmentId: null };
      const updated = applyMerge(conversation, mark(wasManuallyConverted(conversation)));

      expect(isConversationConverted(updated)).toBe(true);
      expect(updated.appointmentId).toBeNull();
    });

    it("emits no appointment field, so no appointment can be created", () => {
      const payload = mark();
      expect(payload).not.toHaveProperty("appointmentId");
      expect(payload).not.toHaveProperty("convertedToAppointment");

      const route = readCode(LABEL_ROUTE);
      expect(route).not.toContain('collection("appointments")');
      expect(route).not.toMatch(/\.add\(/);
    });
  });

  describe("3. Conversation with incomplete intake", () => {
    it("ignores intake completeness entirely", () => {
      const conversation = {
        id: "conv-3",
        status: "collecting_appointment_information",
        intakeCompleted: false,
        collectedFields: {},
      };

      const updated = applyMerge(conversation, mark(wasManuallyConverted(conversation)));

      expect(isConversationManuallyConverted(updated)).toBe(true);
      expect(updated.intakeCompleted).toBe(false);
    });

    it("does not inspect or reprocess conversation messages", () => {
      const route = readCode(LABEL_ROUTE);
      expect(route).not.toContain('collection("messages")');
      expect(route).not.toContain("lastMessagePreview");
      expect(route).not.toContain("transcript");
    });
  });

  describe("4. Automatic system status remains unchanged", () => {
    it("omits every system status field from the payload", () => {
      for (const payload of [mark(), clear()]) {
        expect(payload).not.toHaveProperty("status");
        expect(payload).not.toHaveProperty("systemStatus");
        expect(payload).not.toHaveProperty("conversationStatus");
        expect(payload).not.toHaveProperty("convertedToAppointment");
      }
    });

    it("resolves the same system status before and after the manual write", () => {
      const conversation = {
        id: "conv-4",
        status: "answered",
        convertedToAppointment: false,
        appointmentId: null,
      };
      const updated = applyMerge(conversation, mark());

      const before = normalizeConversationStatus(conversation.status, {
        convertedToAppointment: conversation.convertedToAppointment,
        appointmentId: conversation.appointmentId,
      });
      const after = normalizeConversationStatus(updated.status, {
        convertedToAppointment: updated.convertedToAppointment,
        appointmentId: updated.appointmentId,
      });

      expect(after).toBe(before);
      expect(isConversationSystemConverted(updated)).toBe(false);
    });
  });

  describe("5. No email or notification is triggered", () => {
    it("imports no mail, notification or chatbot workflow module", () => {
      const route = readCode(LABEL_ROUTE).toLowerCase();
      for (const forbidden of [
        "resend",
        "nodemailer",
        "sendmail",
        "sendemail",
        "notification",
        "appointmentservice",
        "createappointment",
        "createlead",
        "quote",
      ]) {
        expect(route).not.toContain(forbidden);
      }
    });

    it("imports only auth, db, error mapping and payload helpers", () => {
      const imports = readSource(LABEL_ROUTE).match(/from\s+"([^"]+)"/g) || [];
      expect(imports.sort()).toEqual([
        'from "@/lib/firebase-admin"',
        'from "@/lib/services/apiAuth"',
        'from "@/lib/services/conversations/customLabelClient"',
        'from "@/lib/services/conversations/manualLabelPayload"',
        'from "@/lib/services/infrastructureErrors"',
        'from "next/server"',
      ]);
    });
  });

  describe("6. Existing appointment is left alone", () => {
    it("keeps the automatic conversion intact when marking manually", () => {
      const conversation = {
        id: "conv-6",
        status: "converted_to_appointment",
        convertedToAppointment: true,
        appointmentId: "appt-99",
      };
      const updated = applyMerge(conversation, mark(wasManuallyConverted(conversation)));

      expect(updated.appointmentId).toBe("appt-99");
      expect(updated.convertedToAppointment).toBe(true);
      expect(isConversationSystemConverted(updated)).toBe(true);
    });

    it("keeps the appointment when the manual label is removed again", () => {
      const conversation = {
        id: "conv-6b",
        convertedToAppointment: true,
        appointmentId: "appt-99",
        manualConversionStatus: MANUAL_CONVERSION_VALUE,
      };
      const updated = applyMerge(conversation, clear(wasManuallyConverted(conversation)));

      expect(updated.appointmentId).toBe("appt-99");
      expect(isConversationSystemConverted(updated)).toBe(true);
      expect(isConversationConverted(updated)).toBe(true);
    });
  });

  describe("7. Removing the label clears only the manual marker", () => {
    it("nulls every manual field and records who removed it", () => {
      const payload = clear(true);

      expect(payload.manualConversionStatus).toBeNull();
      expect(payload.customLabelId).toBeNull();
      expect(payload.customLabelName).toBeNull();
      expect(payload.customLabel).toBeNull();
      expect(payload.manualConversionMarkedAt).toBeNull();
      expect(payload.manualConversionMarkedBy).toBeNull();
      expect(payload.manualConversionRemovedAt).toBe(NOW);
      expect(payload.manualConversionRemovedBy).toBe(ACTOR);
    });

    it("writes no removal audit when there was nothing to remove", () => {
      const payload = clear(false);
      expect(payload).not.toHaveProperty("manualConversionRemovedAt");
      expect(payload).not.toHaveProperty("manualConversionRemovedBy");
    });

    it("recognises the legacy label id as a previous manual marking", () => {
      expect(wasManuallyConverted({ customLabelId: "appointment_converted" })).toBe(true);
      expect(wasManuallyConverted({ customLabel: MANUAL_CONVERSION_VALUE })).toBe(true);
      expect(wasManuallyConverted({ customLabelId: "vip" })).toBe(false);
      expect(wasManuallyConverted(null)).toBe(false);
    });
  });

  describe("8. Analytics counts each conversation once", () => {
    it("counts a manual-only conversion once", () => {
      const updated = applyMerge({ id: "c", status: "answered" }, mark());
      expect(isConversationConverted(updated)).toBe(true);
      expect(isConversationSystemConverted(updated)).toBe(false);
    });

    it("still counts automatic plus manual as a single conversion", () => {
      const conversation = { id: "c", convertedToAppointment: true, appointmentId: "a-1" };
      const updated = applyMerge(conversation, mark());

      expect(isConversationSystemConverted(updated)).toBe(true);
      expect(isConversationManuallyConverted(updated)).toBe(true);
      // The KPI reads a single boolean, so both signals collapse into one count.
      expect(isConversationConverted(updated)).toBe(true);

      const converted = [updated].filter(isConversationConverted).length;
      expect(converted).toBe(1);
    });

    it("counts a mixed set once per conversation", () => {
      const logs = [
        applyMerge({ id: "1", status: "answered" }, mark()),
        { id: "2", convertedToAppointment: true },
        applyMerge({ id: "3", appointmentId: "a-3" }, mark()),
        { id: "4", status: "answered" },
      ];
      expect(logs.filter(isConversationConverted)).toHaveLength(3);
    });
  });

  describe("9. One action means one write and no collection scan", () => {
    it("performs exactly one document write", () => {
      const route = readCode(LABEL_ROUTE);
      const writes = route.match(/await\s+\w+\.(set|update|delete|create)\(/g) || [];
      expect(writes).toHaveLength(1);
      expect(route).toContain("await convRef.set(sanitizedPayload, { merge: true })");
    });

    it("runs no query, aggregation or analytics rebuild during the PATCH", () => {
      const route = readCode(LABEL_ROUTE);
      expect(route).not.toMatch(/\.where\(/);
      expect(route).not.toMatch(/\.orderBy\(/);
      expect(route).not.toMatch(/\.listDocuments\(/);
      expect(route).not.toMatch(/getDocs|onSnapshot/);
      expect(route).not.toContain("Metrics");
    });

    it("resolves the preset label without an extra read", () => {
      // isConvertedLabelId short-circuits the customLabels lookup, so marking a
      // conversation converted costs one read and one write.
      expect(isConvertedLabelId(MANUAL_CONVERSION_VALUE)).toBe(true);
      expect(isConvertedLabelId("appointment_converted")).toBe(true);
      expect(isConvertedLabelId("vip")).toBe(false);
      expect(isConvertedLabelId(null)).toBe(false);

      const route = readCode(LABEL_ROUTE);
      const marking = route.indexOf("if (isMarkingConverted)");
      const labelRead = route.indexOf("await labelRef.get()");
      expect(marking).toBeGreaterThan(-1);
      expect(labelRead).toBeGreaterThan(marking);
    });
  });

  describe("10. Permissions are unchanged", () => {
    it("still authorizes tenant scope before touching any document", () => {
      const route = readCode(LABEL_ROUTE);
      const authorize = route.indexOf("await requireClinicAccess(req, clinicId)");
      const firstRead = route.indexOf("await convRef.get()");
      expect(authorize).toBeGreaterThan(-1);
      expect(firstRead).toBeGreaterThan(authorize);
      expect(route).toContain("canEditConversationLabel");
      expect(route).toContain('code: "FORBIDDEN"');
    });

    it("addresses the conversation only through the clinic-scoped path", () => {
      const route = readCode(LABEL_ROUTE);
      expect(route).toContain('.collection("clinics")');
      expect(route).toContain(".doc(clinicId)");
      expect(route).toContain('.collection("conversationLogs")');
      expect(route).not.toMatch(/collectionGroup\(/);
    });
  });

  describe("Diagnostics for a failing manual-label update", () => {
    it("logs route, ids, role, operation and provider code without patient data", () => {
      const lines: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => lines.push(args.join(" "));

      try {
        const err: any = new Error("8 RESOURCE_EXHAUSTED: Quota exceeded");
        err.code = 8;
        const mapped = mapInfrastructureError(err);

        logInfrastructureFailure({
          route: "PATCH /custom-label",
          operation: "write_label",
          clinicId: "clinic-1",
          conversationId: "conv-1",
          role: "clinicAdmin",
          mapped,
          err,
        });
      } finally {
        console.error = original;
      }

      expect(lines).toHaveLength(1);
      const payload = JSON.parse(lines[0].replace("[infra-failure] ", ""));
      expect(payload).toMatchObject({
        route: "PATCH /custom-label",
        operation: "write_label",
        clinicId: "clinic-1",
        conversationId: "conv-1",
        role: "clinicAdmin",
        errorCode: "QUOTA_EXCEEDED",
        httpStatus: 429,
        providerCode: 8,
      });
    });

    it("still maps a quota rejection to 429 and never leaks provider text", () => {
      const err: any = new Error("8 RESOURCE_EXHAUSTED: Quota exceeded");
      err.code = 8;
      const mapped = mapInfrastructureError(err);

      expect(mapped.status).toBe(429);
      expect(mapped.code).toBe("QUOTA_EXCEEDED");
      expect(mapped.error).not.toContain("RESOURCE_EXHAUSTED");
    });
  });
});
