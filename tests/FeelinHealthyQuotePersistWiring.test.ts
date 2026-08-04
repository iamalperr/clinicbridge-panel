import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("FeelinHealthy quote request persistence wiring", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
    "utf8"
  );
  const serviceSource = readFileSync(
    join(process.cwd(), "lib/services/agencyQuoteRequestService.ts"),
    "utf8"
  );
  const demoSource = readFileSync(
    join(process.cwd(), "app/demo/feelinhealthy/page.tsx"),
    "utf8"
  );

  it("matching-chat persists lead+quote server-side before claiming success", () => {
    expect(routeSource).toContain("persistAgencyQuoteRequest");
    expect(routeSource).toContain("Teklif talebiniz başarıyla oluşturuldu");
    expect(routeSource).toContain("shouldCreateNewLead: false, // already persisted server-side");
    expect(routeSource).toContain("quotePersistError");
  });

  it("blocks LLM fake quote-sent claims without backend confirmation", () => {
    expect(routeSource).toContain("teklif talebinizi ilettim");
    expect(routeSource).toContain("Never let the model claim a quote was sent");
  });

  it("quote request service writes both leads path and quotes collection", () => {
    expect(serviceSource).toContain("submitAgencyLead");
    expect(serviceSource).toContain('.collection("quotes")');
    expect(serviceSource).toContain("selectedClinicNames");
    expect(serviceSource).toContain("travelDate");
  });

  it("demo also creates quote document when client-side persist runs", () => {
    expect(demoSource).toContain(`/api/public/agency/${"${SLUG}"}/quote`);
  });
});
