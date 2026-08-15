import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyFeelinHealthyConversationIntent,
  discoverFeelinHealthyNetwork,
  formatFeelinHealthyDiscoveryReply,
  applyDiscoveryContextToSession,
  beginTransactionalFromDiscovery,
  getTransactionalIntakePreamble,
  isFeelinHealthyDiscoveryIntent,
} from "../lib/agency/feelinhealthyDiscovery";
import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
} from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");
const routeSource = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

const connectedClinics = [
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter,
    clinicName: "Orion Surgery Center",
    clinicSlug: "orion-surgery-center",
    status: "active",
    treatmentCategories: ["aesthetic_surgery", "plastic_surgery"],
    location: { city: "İstanbul", side: "anatolian" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    clinicName: "BHT Clinic İstanbul Tema Hastanesi",
    clinicSlug: "bht-clinic-istanbul-tema-hastanesi",
    status: "active",
    treatmentCategories: ["aesthetic_surgery", "dental"],
    location: { city: "İstanbul", side: "european" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi,
    clinicName: "Intermed Health Group Nişantaşı",
    clinicSlug: "intermed-health-group-nisantasi",
    status: "active",
    treatmentCategories: ["multi_specialty_medical_center", "aesthetic_surgery"],
    location: { city: "İstanbul", side: "european" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.memorialAntalya,
    clinicName: "Memorial Hospital",
    clinicSlug: "memorial-hospital",
    status: "active",
    treatmentCategories: ["aesthetic_plastic_reconstructive_surgery"],
    location: { city: "Antalya" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimAnkara,
    clinicName: "Lokman Hekim University Ankara Hospital",
    clinicSlug: "lokman-hekim-university-ankara-hospital",
    status: "active",
    treatmentCategories: ["aesthetic_surgery", "hospital"],
    location: { city: "Ankara" },
  },
  {
    id: "inactive-aesthetic",
    clinicName: "Ghost Aesthetic",
    clinicSlug: "ghost-aesthetic",
    status: "inactive",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul" },
  },
];

describe("FeelinHealthy information discovery vs transactional intake", () => {
  it("classifies existence questions as network discovery (no transactional)", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Estetik yapan klinikler var mı?",
    });
    expect(c.intent).toBe("network_discovery");
    expect(c.isDiscovery).toBe(true);
    expect(c.isTransactional).toBe(false);
    expect(c.treatmentBranch).toBe("aesthetic_surgery");
    expect(isFeelinHealthyDiscoveryIntent(c)).toBe(true);
  });

  it("answers aesthetic discovery with city groups and more than 2 clinic names", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Estetik yapan klinikler var mı?",
    });
    const discovery = discoverFeelinHealthyNetwork({
      treatmentBranch: c.treatmentBranch,
      availableClinics: connectedClinics,
      locale: "tr",
    });
    expect(discovery.totalClinics).toBeGreaterThan(2);
    expect(discovery.cities.map((x) => x.city)).toEqual(
      expect.arrayContaining(["istanbul", "antalya", "ankara"])
    );
    const reply = formatFeelinHealthyDiscoveryReply(discovery, "tr");
    expect(reply).toMatch(/Estetik|estetik|Plastik/i);
    expect(reply).not.toMatch(/KVKK|adınızı|Aydınlatma/i);
    expect(reply).not.toMatch(/Hangi tedavi için destek/i);
  });

  it("filters İstanbul aesthetic clinics for city-specific discovery", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "İstanbul'da estetik yapan klinikler?",
      sessionContext: { discoveryActive: true, lastTreatmentCategory: "aesthetic_surgery" },
    });
    expect(c.isDiscovery).toBe(true);
    expect(c.city).toBe("istanbul");
    const discovery = discoverFeelinHealthyNetwork({
      treatmentBranch: "aesthetic_surgery",
      city: "istanbul",
      availableClinics: connectedClinics,
      locale: "tr",
    });
    expect(discovery.cities.every((g) => g.city === "istanbul")).toBe(true);
    expect(discovery.totalClinics).toBeGreaterThan(0);
    expect(discovery.cities.flatMap((g) => g.clinics).map((x) => x.name)).not.toContain(
      "Ghost Aesthetic"
    );
  });

  it("narrows to European side after İstanbul context", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Avrupa yakasında olanlar?",
      sessionContext: {
        discoveryActive: true,
        conversationMode: "information",
        lastTreatmentCategory: "aesthetic_surgery",
        selectedCity: "istanbul",
      },
    });
    expect(c.isDiscovery).toBe(true);
    expect(c.side).toBe("european");
    const discovery = discoverFeelinHealthyNetwork({
      treatmentBranch: "aesthetic_surgery",
      city: "istanbul",
      side: "european",
      availableClinics: connectedClinics,
      locale: "tr",
    });
    expect(discovery.totalClinics).toBeGreaterThan(0);
    expect(
      discovery.cities.flatMap((g) => g.clinics).every((x) => x.side !== "anatolian")
    ).toBe(true);
  });

  it("city summary question returns grouped city inventory", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Hangi şehirlerde var?",
      sessionContext: {
        discoveryActive: true,
        lastTreatmentCategory: "aesthetic_surgery",
      },
    });
    expect(c.intent).toBe("information");
    expect(c.citySummaryOnly).toBe(true);
    const discovery = discoverFeelinHealthyNetwork({
      treatmentBranch: "aesthetic_surgery",
      availableClinics: connectedClinics,
      locale: "tr",
      citySummaryOnly: true,
    });
    const reply = formatFeelinHealthyDiscoveryReply(discovery, "tr");
    expect(reply).toMatch(/İstanbul|Antalya|Ankara/i);
  });

  it("quote request is transactional and explains guest max-2", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Fiyat almak istiyorum",
      sessionContext: {
        discoveryActive: true,
        lastTreatmentCategory: "aesthetic_surgery",
        selectedCity: "istanbul",
      },
    });
    expect(c.intent).toBe("quote_request");
    expect(c.isTransactional).toBe(true);
    expect(c.isDiscovery).toBe(false);
    const preamble = getTransactionalIntakePreamble("tr");
    expect(preamble).toContain(String(FEELINHEALTHY_CONFIG.maxGuestClinics));
    expect(preamble).toMatch(/üyelik|teklif/i);
  });

  it("appointment request is transactional", () => {
    const c = classifyFeelinHealthyConversationIntent({
      message: "Randevu almak istiyorum",
    });
    expect(c.intent).toBe("appointment_request");
    expect(c.isTransactional).toBe(true);
  });

  it("discovery → quote preserves treatment/city/side", () => {
    let session = applyDiscoveryContextToSession(
      {},
      classifyFeelinHealthyConversationIntent({
        message: "Estetik yapan klinikler var mı?",
      })
    );
    expect(session.discoveryActive).toBe(true);
    expect(session.lastTreatmentCategory).toBe("aesthetic_surgery");

    session = applyDiscoveryContextToSession(
      session,
      classifyFeelinHealthyConversationIntent({
        message: "İstanbul'dakileri göster",
        sessionContext: session,
      })
    );
    expect(session.selectedCity).toBe("istanbul");
    expect(session.lastTreatmentCategory).toBe("aesthetic_surgery");

    session = applyDiscoveryContextToSession(
      session,
      classifyFeelinHealthyConversationIntent({
        message: "Avrupa yakasında olanlar?",
        sessionContext: session,
      })
    );
    expect(session.istanbul_side).toBe("european");
    expect(session.selectedCity).toBe("istanbul");
    expect(session.lastTreatmentCategory).toBe("aesthetic_surgery");

    const tx = beginTransactionalFromDiscovery(session);
    expect(tx.discoveryActive).toBeUndefined();
    expect(tx.lastTreatmentCategory).toBe("aesthetic_surgery");
    expect(tx.selectedCity).toBe("istanbul");
    expect(tx.istanbul_side).toBe("european");
  });

  it("guest max-2 remains the personalized recommendation limit", () => {
    expect(FEELINHEALTHY_CONFIG.maxGuestClinics).toBe(2);
  });

  it("route wires discovery before consent and transactional preamble", () => {
    expect(routeSource).toContain("isFeelinHealthyDiscoveryIntent");
    expect(routeSource).toContain('type: "network_discovery"');
    expect(routeSource).toContain("getTransactionalIntakePreamble");
    expect(routeSource).toContain("fhIntent?.isTransactional === true");
    expect(routeSource).not.toMatch(
      /agencyIntentResult\.intent === "quote_request" \|\|\s*isFeelinHealthy\s*\)/
    );
  });

  it("does not create lead/quote artifacts in discovery helpers", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "lib/agency/feelinhealthyDiscovery.ts"),
      "utf8"
    );
    expect(src).not.toContain("persistAgencyQuoteRequest");
    expect(src).not.toContain('collection("leads")');
    expect(src).not.toContain('collection("quotes")');
  });
});
