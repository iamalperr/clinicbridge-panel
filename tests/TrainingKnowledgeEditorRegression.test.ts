import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Eğitim tab KnowledgeEditor regression", () => {
  it("still uses the shared KnowledgeEditor for add/edit with the same Firestore fields", () => {
    const page = readFileSync("app/clinics/[clinicId]/training/page.tsx", "utf8");
    expect(page).toContain('from "@/components/clinic/training/KnowledgeEditor"');
    expect(page).toContain('mode="knowledge"');
    expect(page).toContain("addDoc(collection(db, \"trainingMaterials\")");
    expect(page).toContain("updateDoc(doc(db, \"trainingMaterials\", editTarget.id)");
    expect(page).toContain("deleteDoc(doc(db, \"trainingMaterials\", deleteTarget.id)");
    expect(page).toContain("entity_type");
    expect(page).toContain("embedding_status");
    expect(page).toContain("/api/admin/embeddings/generate");
    // Desktop Modal path remains available via KnowledgeEditor presentation=auto
    expect(page).toContain('presentation="auto"');
  });
});
