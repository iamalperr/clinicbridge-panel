/**
 * FeelinHealthy UX: on-site membership CTA + Istanbul "Emin Değilim" guided side flow.
 */
import { describe, it, expect } from "vitest";
import {
  decideFeelinHealthyLocationNextStep,
  getSideGuidancePrompt,
  resolveIstanbulSideFromText,
  FEELINHEALTHY_CONFIG,
} from "../lib/agency/feelinhealthyConfig";
import {
  applyStructuredLocationAction,
  resolveNextConversationAction,
  isHardGateAction,
  buildGateResponseFromAction,
} from "../lib/agency/feelinhealthyConversationMachine";
import {
  isMembershipHowToIntent,
  getOnSiteMembershipGuidance,
  getPostQuoteMembershipMessage,
} from "../lib/agency/feelinhealthyClinicCardActions";
import { readFileSync } from "fs";
import { join } from "path";

const completeIntake = {
  patientName: "Ada Yılmaz",
  firstName: "Ada",
  lastName: "Yılmaz",
  patientGender: "Kadın",
  patientAge: 34,
  patientEmail: "ada@example.com",
  patientPhone: "+905551112233",
  patientCountry: "TR",
  travelDate: "2026-09-10",
};

describe("Test A — membership intent on FeelinHealthy site", () => {
  it("detects TR how-to-register intent", () => {
    expect(isMembershipHowToIntent("Üye olmak için ne yapmalıyım?")).toBe(true);
    expect(isMembershipHowToIntent("Nasıl kayıt olurum?")).toBe(true);
  });

  it("detects EN how-to-register intent", () => {
    expect(isMembershipHowToIntent("How do I sign up?")).toBe(true);
    expect(isMembershipHowToIntent("How can I create an account?")).toBe(true);
  });

  it("on-site guidance refers to top-right Sign Up / Kayıt Ol, not website redirect", () => {
    const tr = getOnSiteMembershipGuidance({ locale: "tr" });
    expect(tr).toMatch(/Kayıt Ol/i);
    expect(tr).toMatch(/sağ üst/i);
    expect(tr).not.toMatch(/web sitesine gidip/i);
    expect(tr).not.toMatch(/feelinhealthy\.com/i);

    const en = getOnSiteMembershipGuidance({ locale: "en" });
    expect(en).toMatch(/Sign Up/i);
    expect(en).toMatch(/top-right/i);
    expect(en).not.toMatch(/go to the .*website/i);
    expect(en).not.toMatch(/feelinhealthy\.com/i);
  });

  it("post-quote membership CTA stays aligned and guest max remains 2", () => {
    expect(FEELINHEALTHY_CONFIG.maxGuestClinics).toBe(2);
    const tr = getPostQuoteMembershipMessage({ locale: "tr", maxClinics: 2 });
    expect(tr).toContain("Kayıt Ol");
    expect(tr).toContain("2");
    expect(tr).not.toMatch(/web sitesine/i);
  });

  it("matching-chat route wires membership intercept", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(src).toContain("isMembershipHowToIntent");
    expect(src).toContain("getOnSiteMembershipGuidance");
  });
});

describe("Test B — Emin Değilim / unsure side action", () => {
  it("unsure action keeps Istanbul and enters side_guidance (not ask_side card)", () => {
    const applied = applyStructuredLocationAction(
      {
        quoteConsent: true,
        ...completeIntake,
        lastTreatmentCategory: "hair_transplant",
        selectedCity: "istanbul",
        locationSelectionConfirmed: true,
      },
      { type: "side_selection", side: "unsure", actionId: "act-unsure-1" }
    );

    expect(applied.ctx.selectedCity).toBe("istanbul");
    expect(applied.ctx.istanbul_side).toBe("unsure");
    expect(applied.ctx.pendingSideGuidance).toBe(true);
    expect(applied.ctx.pendingSideClarification).toBeUndefined();
    expect(applied.ctx.sideSelectionConfirmed).toBe(false);

    const location = decideFeelinHealthyLocationNextStep(
      {
        lastTreatmentCategory: "hair_transplant",
        selectedCity: "istanbul",
        istanbul_side: "unsure",
        pendingSideGuidance: true,
      },
      [],
      "tr"
    );
    expect(location.step).toBe("side_guidance");
    expect(location.step).not.toBe("ask_side");

    const next = resolveNextConversationAction(applied.ctx, {
      locale: "tr",
      isStructuredAction: true,
      availableClinics: [],
    });
    expect(next.kind).toBe("side_guidance");
    if (next.kind === "side_guidance") {
      expect(next.prompt).toMatch(/havaliman/i);
      expect(next.prompt).not.toMatch(/Avrupa Yakası'nı tercih/i);
    }
    expect(isHardGateAction(next)).toBe(true);

    const composed = buildGateResponseFromAction(next, applied.ctx as any);
    expect(composed?.sideClarificationCard).toBeUndefined();
    expect(composed?.type).toBe("text");
    expect(composed?.reply).toMatch(/Tabii|havaliman/i);
  });
});

describe("Test C — Sabiha Gökçen → Anadolu", () => {
  it("recommends Anatolian side", () => {
    const cue = resolveIstanbulSideFromText("Sabiha Gökçen'e ineceğim.");
    expect(cue.side).toBe("anatolian");
    const prompt = getSideGuidancePrompt(cue.cueName || "sabiha", "tr");
    expect(prompt).toMatch(/Anadolu/i);
    expect(getSideGuidancePrompt("sabiha", "en")).toMatch(/Anatolian/i);
  });
});

describe("Test D — IST / Şişli → Avrupa", () => {
  it("recommends European side", () => {
    const cue = resolveIstanbulSideFromText(
      "İstanbul Havalimanı’na geleceğim, Şişli’de kalacağım."
    );
    expect(cue.side).toBe("european");
    const prompt = getSideGuidancePrompt(cue.cueName || "İstanbul Havalimanı (IST)", "tr");
    expect(prompt).toMatch(/Avrupa/i);
    expect(getSideGuidancePrompt("sisli", "en")).toMatch(/European/i);
  });
});

describe("Test E — guided flow resumes matching after side resolves", () => {
  it("after guidance cues, location becomes ready and city is not re-asked", () => {
    const after = applyStructuredLocationAction(
      {
        quoteConsent: true,
        ...completeIntake,
        lastTreatmentCategory: "hair_transplant",
        selectedCity: "istanbul",
        istanbul_side: "unsure",
        pendingSideGuidance: true,
        locationSelectionConfirmed: true,
      },
      { type: "side_selection", side: "anatolian", actionId: "act-side-resolve" }
    );
    expect(after.ctx.selectedCity).toBe("istanbul");
    expect(after.ctx.istanbul_side).toBe("anatolian");
    expect(after.ctx.pendingSideGuidance).toBeUndefined();
    expect(after.ctx.sideSelectionConfirmed).toBe(true);

    const location = decideFeelinHealthyLocationNextStep(
      {
        lastTreatmentCategory: "hair_transplant",
        selectedCity: "istanbul",
        istanbul_side: "anatolian",
      },
      [],
      "tr"
    );
    expect(location.step).toBe("ready");
    expect(location.step).not.toBe("ask_city");
    expect(location.step).not.toBe("ask_side");
    expect(location.step).not.toBe("side_guidance");
  });
});

describe("Test F — TR/EN language consistency", () => {
  it("membership and side guidance stay language-aligned", () => {
    expect(getOnSiteMembershipGuidance({ locale: "tr" })).toMatch(/Kayıt Ol/);
    expect(getOnSiteMembershipGuidance({ locale: "en" })).toMatch(/Sign Up/);
    expect(getSideGuidancePrompt(null, "tr")).toMatch(/havaliman/i);
    expect(getSideGuidancePrompt(null, "en")).toMatch(/airport/i);
    expect(getSideGuidancePrompt("saw", "tr")).toMatch(/Anadolu/);
    expect(getSideGuidancePrompt("saw", "en")).toMatch(/Anatolian/);
  });
});
