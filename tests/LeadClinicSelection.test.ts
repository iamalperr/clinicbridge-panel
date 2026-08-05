import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildClinicSelectionHistoryNote,
  clinicSelectionEquals,
  diffClinicSelection,
  normalizeClinicIdList,
  resolveAgencyClinicSelectionLimit,
} from "../lib/agency/leadClinicSelection";

describe("lead clinic selection helpers", () => {
  it("normalizes and dedupes clinic ids", () => {
    expect(normalizeClinicIdList([" a ", "a", "", "b", null])).toEqual(["a", "b"]);
  });

  it("detects equal selections regardless of order", () => {
    expect(clinicSelectionEquals(["1", "2"], ["2", "1"])).toBe(true);
    expect(clinicSelectionEquals(["1"], ["1", "2"])).toBe(false);
  });

  it("diffs added/removed/kept clinics", () => {
    expect(diffClinicSelection(["a", "b"], ["b", "c"])).toEqual({
      added: ["c"],
      removed: ["a"],
      kept: ["b"],
    });
  });

  it("enforces FeelinHealthy guest max of 2", () => {
    expect(
      resolveAgencyClinicSelectionLimit({
        agencySlug: "feelinhealthy",
        settingsMaxClinics: 3,
        guestQuoteLimit: 2,
      })
    ).toBe(2);
  });

  it("builds audit note without changing status semantics", () => {
    const note = buildClinicSelectionHistoryNote({
      previousNames: ["Clinic A"],
      nextNames: ["Clinic B"],
      locale: "tr",
    });
    expect(note).toContain("Clinic A");
    expect(note).toContain("Clinic B");
    expect(note).toMatch(/güncellendi/i);
  });
});

describe("lead clinic selection wiring", () => {
  it("exposes authenticated PATCH route and does not change funnel status in service", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/agency/[agencyId]/leads/[leadId]/clinic-selection/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/services/leadClinicSelectionService.ts"),
      "utf8"
    );
    const page = readFileSync(
      join(process.cwd(), "app/agency/agencies/[agencyId]/leads/[leadId]/page.tsx"),
      "utf8"
    );

    expect(route).toContain("requireAgencyAccess");
    expect(route).toContain("updateAgencyLeadClinicSelection");
    expect(service).toContain("do NOT change funnel status");
    expect(service).toContain("selectedClinicIds");
    expect(service).toContain("clinic_requests");
    expect(page).toContain("updateLeadClinicSelection");
    expect(page).toContain("Seçilen Klinikleri Düzenle");
  });
});
