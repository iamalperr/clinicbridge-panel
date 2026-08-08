import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("knowledge document indexing", () => {
  it("generate route captures docPath before work and uses shared indexer", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/embeddings/generate/route.ts"),
      "utf8"
    );
    expect(route).toContain("indexKnowledgeDocument");
    expect(route).toContain('let docPath = ""');
    expect(route).not.toContain("req.clone().json()");
  });

  it("agency clinic KB UI awaits index API and marks failures", () => {
    const page = readFileSync(
      join(
        process.cwd(),
        "app/agency/agencies/[agencyId]/clinics/[clinicDocId]/page.tsx"
      ),
      "utf8"
    );
    expect(page).toContain("failCount");
    expect(page).toContain('embedding_status: "failed"');
    expect(page).toContain("await fetch(\"/api/admin/embeddings/generate\"");
    // no fire-and-forget indexing on save
    expect(page).not.toMatch(/fetch\("\/api\/admin\/embeddings\/generate"[\s\S]*?\)\.catch\(console\.error\)/);
  });

  it("feelinhealthy sync indexes KB after upsert (does not leave pending)", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/sync-feelinhealthy-prices-services.ts"),
      "utf8"
    );
    expect(script).toContain("indexKnowledgeDocument");
    expect(script).toContain('embedding_status: "indexing"');
    expect(script).not.toContain('embedding_status: "pending"');
  });
});
