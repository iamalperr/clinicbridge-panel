import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("agency leads list navigation", () => {
  it("row click navigates to lead detail via agencyLeadDetailPath", () => {
    const page = readFileSync(
      join(process.cwd(), "app/agency/agencies/[agencyId]/leads/page.tsx"),
      "utf8"
    );
    expect(page).toContain("agencyLeadDetailPath");
    expect(page).toContain("router.push(detailHref)");
    expect(page).toContain("onClick={openLead}");
    // Avoid pointer-only UX without a real handler.
    expect(page).not.toMatch(/cursor:\s*"pointer"[\s\S]{0,120}onMouseEnter/);
  });

  it("subscribeToLeads keeps Firestore doc id after data spread", () => {
    const service = readFileSync(join(process.cwd(), "lib/services/leadService.ts"), "utf8");
    expect(service).toMatch(/\.map\(\(d\) => \(\{[\s\S]*?\.\.\.d\.data\(\),[\s\S]*?id: d\.id/);
  });
});
