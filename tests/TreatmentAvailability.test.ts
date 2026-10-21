import { describe, expect, it } from "vitest";
import { classifyIdleAssistantStatus } from "../lib/agent/replyDisposition";
import {
  collectClinicCatalogSnippets,
  resolveTreatmentAvailability,
} from "../lib/agent/treatmentAvailability";

const WHITENING_KB = {
  title: "Teeth Whitening and Cleaning",
  content: "Offers Laser Teeth Whitening (average 150 EUR) and Teeth Cleaning (average 70 EUR).",
};

describe("treatment availability from clinic records", () => {
  it("answers teeth whitening from a recorded offer instead of the unverified fallback", () => {
    const decision = resolveTreatmentAvailability({
      message: "Diş beyazlatma yapılıyor mu",
      locale: "tr",
      documents: [WHITENING_KB],
    });
    expect(decision?.status).toBe("offered");
    expect(decision?.treatmentCode).toBe("teeth_whitening");
    expect(decision?.laser).toBe(true);
    expect(decision?.reply).toContain("lazer diş beyazlatma");
    expect(decision?.reply.toLowerCase()).not.toContain("doğrulayamiyorum");
  });

  it("reads whitening from the clinic profile when it is listed as an offered treatment", () => {
    const snippets = collectClinicCatalogSnippets({
      overview: {
        longDescription:
          "The clinic offers a wide range of verified dental treatments including dental implants, veneers, crowns, and teeth whitening.",
      },
      subTreatments: ["Dental Implant", "Teeth Whitening"],
    });
    const decision = resolveTreatmentAvailability({
      message: "Diş beyazlatma yapılıyor mu",
      locale: "tr",
      documents: snippets,
    });
    expect(decision?.status).toBe("offered");
    expect(decision?.reply.startsWith("Evet")).toBe(true);
  });

  it("treats the clinic training note titled Diş Beyazlatma as an offered service", () => {
    const decision = resolveTreatmentAvailability({
      message: "Diş beyazlatma yapılıyor mu",
      locale: "tr",
      documents: [
        {
          title: "Diş Beyazlatma: Sağlıklı ve Parlak Gülüşler İçin",
          content:
            "Baştan söylemek gerekirse, diş beyazlatma hizmeti son yılların en popüler kozmetik diş uygulamalarından biridir.",
        },
      ],
    });
    expect(decision?.status).toBe("offered");
    expect(decision?.treatmentCode).toBe("teeth_whitening");
    expect(decision?.reply.startsWith("Evet, kliniğimizde")).toBe(true);
    expect(decision?.reply.toLowerCase()).not.toContain("doğrulayamiyorum");
    expect(decision?.laser).toBe(false);
  });

  it("does not claim the treatment is offered from a general explanation", () => {
    const decision = resolveTreatmentAvailability({
      message: "Diş beyazlatma yapılıyor mu",
      locale: "tr",
      documents: [
        {
          title: "Hassasiyet",
          content: "Diş beyazlatma sonrası bazı hastalarda geçici hassasiyet görülebilir.",
        },
      ],
    });
    expect(decision?.status).toBe("unknown");
    expect(decision?.reply).toContain("mevcut kayıtlarımızdan doğrulayamıyorum");
    expect(decision?.reply).not.toContain("uygulanmıyor");
  });

  it("says the treatment is not offered only when the record denies it", () => {
    const decision = resolveTreatmentAvailability({
      message: "Do you offer teeth whitening?",
      locale: "en",
      documents: [
        {
          title: "Teeth Whitening",
          content: "We do not offer teeth whitening at this clinic.",
        },
      ],
    });
    expect(decision?.status).toBe("not_offered");
    expect(decision?.reply.toLowerCase()).toContain("not offered");
  });

  it("leaves price, doctor, and booking questions on their existing paths", () => {
    expect(
      resolveTreatmentAvailability({
        message: "Diş beyazlatma fiyatı nedir?",
        locale: "tr",
        documents: [WHITENING_KB],
      })
    ).toBeNull();
    expect(
      resolveTreatmentAvailability({
        message: "Diş beyazlatmayı kim yapıyor?",
        locale: "tr",
        documents: [WHITENING_KB],
      })
    ).toBeNull();
    expect(
      resolveTreatmentAvailability({
        message: "Diş beyazlatma için randevu var mı?",
        locale: "tr",
        documents: [WHITENING_KB],
      })
    ).toBeNull();
  });
});

describe("knowledge-gap replies are not live support", () => {
  const gap =
    "Bu bilgiyi mevcut kayıtlarımızdan güvenilir şekilde doğrulayamıyorum. Yanlış yönlendirmemek için klinik ekibimizden teyit edilmesi gerekir.";

  it("marks the whitening verification fallback as unanswered training, not live support", () => {
    const status = classifyIdleAssistantStatus(gap, "Diş beyazlatma yapılıyor mu");
    expect(status.status).toBe("unanswered");
    expect(status.needsTraining).toBe(true);
    expect(status.trainingTopic).toContain("Diş beyazlatma");
  });

  it("still marks an explicit live-support handoff as live support", () => {
    const status = classifyIdleAssistantStatus(
      "Sizi canlı destek ekibimize yönlendiriyorum. WhatsApp üzerinden yazabilirsiniz.",
      "canlı destek"
    );
    expect(status.status).toBe("liveSupport");
    expect(status.needsTraining).toBe(false);
  });

  it("keeps a verified whitening answer as successfully answered", () => {
    const status = classifyIdleAssistantStatus(
      "Evet, kliniğimizde lazer diş beyazlatma uygulanmaktadır. Kesin uygunluk muayene ve hekim değerlendirmesinden sonra belirlenir.",
      "Diş beyazlatma yapılıyor mu"
    );
    expect(status.status).toBe("answered");
    expect(status.needsTraining).toBe(false);
  });
});
