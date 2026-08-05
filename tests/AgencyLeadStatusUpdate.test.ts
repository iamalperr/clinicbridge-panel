import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  LEAD_STATUS_ACTIONS,
  appendLeadStatusHistory,
  isCanonicalLeadStatus,
  isManualLeadStatusUpdate,
  normalizeLeadStatusHistory,
} from "../lib/agency/leadStatusActions";

describe("Agency lead status update mapping", () => {
  it("maps portal actions to canonical backend statuses", () => {
    expect(LEAD_STATUS_ACTIONS.contacted.status).toBe("clinic_contacted");
    expect(LEAD_STATUS_ACTIONS.converted.status).toBe("converted");
    expect(LEAD_STATUS_ACTIONS.lost.status).toBe("lost");
  });

  it("uses localized history notes separate from machine status", () => {
    expect(LEAD_STATUS_ACTIONS.contacted.historyNote.tr).toBe("İletişime geçildi");
    expect(LEAD_STATUS_ACTIONS.converted.historyNote.tr).toBe("Onaylandı / Dönüştürüldü");
    expect(LEAD_STATUS_ACTIONS.lost.historyNote.tr).toBe("Kayıp / İptal");
    expect(LEAD_STATUS_ACTIONS.contacted.status).not.toBe("contacted");
  });

  it("accepts only manual portal statuses", () => {
    expect(isManualLeadStatusUpdate("clinic_contacted")).toBe(true);
    expect(isManualLeadStatusUpdate("converted")).toBe(true);
    expect(isManualLeadStatusUpdate("lost")).toBe(true);
    expect(isManualLeadStatusUpdate("contacted")).toBe(false);
    expect(isManualLeadStatusUpdate("patient_notified")).toBe(false);
    expect(isManualLeadStatusUpdate("quote_requested")).toBe(false);
    expect(isManualLeadStatusUpdate("")).toBe(false);
  });

  it("recognizes canonical lead statuses", () => {
    expect(isCanonicalLeadStatus("quote_requested")).toBe(true);
    expect(isCanonicalLeadStatus("invalid")).toBe(false);
  });

  it("normalizes malformed statusHistory before append", () => {
    expect(normalizeLeadStatusHistory(null)).toEqual([]);
    expect(normalizeLeadStatusHistory({ status: "new" })).toEqual([]);

    const next = appendLeadStatusHistory(
      [{ status: "new", changedAt: "2026-08-05T08:00:00.000Z" }],
      { status: "clinic_contacted", changedAt: "2026-08-05T09:00:00.000Z", note: "İletişime geçildi" }
    );

    expect(next).toHaveLength(2);
    expect(next?.[1].status).toBe("clinic_contacted");
    expect(next?.[1].note).toBe("İletişime geçildi");
  });

  it("skips duplicate history when status is unchanged", () => {
    const skipped = appendLeadStatusHistory(
      [{ status: "converted", changedAt: "2026-08-05T08:00:00.000Z" }],
      { status: "converted", changedAt: "2026-08-05T09:00:00.000Z" },
      { currentStatus: "converted", skipIfSameStatus: true }
    );
    expect(skipped).toBeNull();
  });
});

describe("Agency lead status API wiring", () => {
  const routePath = join(
    process.cwd(),
    "app/api/agency/[agencyId]/leads/[leadId]/status/route.ts"
  );
  const leadDetailPath = join(
    process.cwd(),
    "app/agency/agencies/[agencyId]/leads/[leadId]/page.tsx"
  );
  const leadServicePath = join(process.cwd(), "lib/services/leadService.ts");

  it("uses authenticated PATCH route with agency access check", () => {
    const source = readFileSync(routePath, "utf8");
    expect(source).toContain("requireAgencyAccess");
    expect(source).toContain("export async function PATCH");
    expect(source).toContain("isManualLeadStatusUpdate");
    expect(source).toContain("updateAgencyLeadStatus");
  });

  it("lead detail page calls API-backed updateLeadStatus with auth token", () => {
    const detailSource = readFileSync(leadDetailPath, "utf8");
    const serviceSource = readFileSync(leadServicePath, "utf8");

    expect(detailSource).toContain("LEAD_STATUS_ACTIONS");
    expect(detailSource).toContain("handleStatusAction");
    expect(detailSource).toContain("getToken");
    expect(detailSource).not.toContain('handleStatusChange("clinic_contacted")');

    expect(serviceSource).toContain("/api/agency/${agencyId}/leads/${leadId}/status");
    expect(serviceSource).toContain("Authorization: `Bearer ${authToken}`");
  });

  it("does not modify patient email route", () => {
    const emailRoute = readFileSync(
      join(process.cwd(), "app/api/public/agency/send-patient-email/route.ts"),
      "utf8"
    );
    expect(emailRoute).toContain("sendPatientLeadApprovalEmail");
    expect(emailRoute).not.toContain("updateAgencyLeadStatus");
  });
});
