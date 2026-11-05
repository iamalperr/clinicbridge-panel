import { describe, expect, it } from "vitest";
import { buildWidgetEmbedCode } from "../lib/widget/embedCode";
import { draftsFromSetup, parseFaq, parseTreatment, shouldShowSetupBanner, treatmentContent } from "../lib/setup/materials";
import { normalizeInstallDomain, planInstallPing } from "../lib/setup/installPing";
import { buildAgencyInstallEmail, buildLiveBotEmail } from "../lib/setup/emails";

describe("setup wizard", () => {
  it("builds the same embed snippet the clinic page copies", () => {
    expect(buildWidgetEmbedCode("clinic123", "tr", "https://widget.clinicbridge-ai.com/widget.js")).toBe(
      `<script\n  src="https://widget.clinicbridge-ai.com/widget.js"\n  data-clinic-id="clinic123" data-language="tr"\n  async>\n</script>`
    );
  });

  it("keeps only entered facts and a price line when a range exists", () => {
    const drafts = draftsFromSetup({
      treatments: [{ name: "İmplant", priceRange: "15.000-25.000 TL" }, { name: "  " }, { name: "Beyazlatma", priceRange: "" }],
      hours: "09:00-18:00",
      faq: [{ question: "Açık mısınız?", answer: "Hafta içi açığız." }, { question: "", answer: "yok" }],
      doNotSay: "Fiyat uydurma.",
      language: "TR",
    });
    expect(drafts.map((item) => item.category)).toEqual([
      "Tedaviler",
      "Tedaviler",
      "Çalışma Saatleri",
      "Sık Sorulan Sorular",
      "Söylenmemesi Gerekenler",
    ]);
    expect(treatmentContent("İmplant", "15.000 TL")).toContain("Fiyat aralığı: 15.000 TL");
    expect(parseTreatment("İmplant", treatmentContent("İmplant", "15.000 TL")).priceRange).toBe("15.000 TL");
    expect(parseFaq("Açık mısınız?", "Açık mısınız?\nHafta içi açığız.").answer).toBe("Hafta içi açığız.");
  });

  it("shows the clinic home banner only for an unfinished direct clinic", () => {
    expect(shouldShowSetupBanner({ acquisition: "direct", setupCompleted: false })).toBe(true);
    expect(shouldShowSetupBanner({ acquisition: "direct" })).toBe(true);
    expect(shouldShowSetupBanner({ acquisition: "direct", setupCompleted: true })).toBe(false);
    expect(shouldShowSetupBanner({ setupCompleted: false })).toBe(false);
    expect(shouldShowSetupBanner(null)).toBe(false);
  });

  it("sends the live email once and updates a later domain without another email", () => {
    expect(normalizeInstallDomain("Ada.Example.com:443")).toBe("ada.example.com");
    expect(normalizeInstallDomain("bad host")).toBeNull();
    const first = planInstallPing({ exists: true, widgetInstalledAt: null, installedDomain: null, widgetLiveEmailSent: false }, "ada.example.com", "2026-11-05T00:00:00.000Z");
    expect(first).toMatchObject({ status: "first", sendEmail: true, installedDomain: "ada.example.com" });
    const retry = planInstallPing({ exists: true, widgetInstalledAt: "2026-11-05T00:00:00.000Z", installedDomain: "ada.example.com", widgetLiveEmailSent: false }, "ada.example.com", "2026-11-05T00:01:00.000Z");
    expect(retry.status).toBe("retry-email");
    const same = planInstallPing({ exists: true, widgetInstalledAt: "set", installedDomain: "ada.example.com", widgetLiveEmailSent: true }, "ada.example.com", "2026-11-05T00:02:00.000Z");
    expect(same.status).toBe("unchanged");
    const moved = planInstallPing({ exists: true, widgetInstalledAt: "set", installedDomain: "ada.example.com", widgetLiveEmailSent: true }, "yeni.example.com", "2026-11-05T00:03:00.000Z");
    expect(moved).toEqual({ status: "update-domain", installedDomain: "yeni.example.com" });
    expect(planInstallPing({ exists: false, widgetInstalledAt: null, installedDomain: null, widgetLiveEmailSent: false }, "ada.example.com", "now").status).toBe("missing");
  });

  it("writes the live and agency emails in the clinic language without patient text", () => {
    expect(buildLiveBotEmail({ language: "tr", clinicName: "Ada <Klinik>", domain: "ada.example.com" }).subject).toBe("Botunuz yayında");
    expect(buildLiveBotEmail({ language: "tr", clinicName: "Ada <Klinik>", domain: "ada.example.com" }).html).toContain("Ada &lt;Klinik&gt;");
    expect(buildAgencyInstallEmail({ language: "en", clinicName: "Ada", clinicId: "clinic123" }).html).toContain("data-clinic-id=&quot;clinic123&quot;");
  });
});
