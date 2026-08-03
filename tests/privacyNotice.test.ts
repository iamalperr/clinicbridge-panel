import { describe, it, expect } from "vitest";
import {
  validatePrivacyNoticeUrl,
  getStructuredConsentData
} from "../lib/utils/privacyNotice";
import { FEELINHEALTHY_CONFIG } from "../lib/agency/feelinhealthyConfig";

describe("Privacy Notice URL Validation & Security", () => {
  it("allows valid https and http URLs", () => {
    expect(validatePrivacyNoticeUrl("https://feelinhealthy.com/kvkk")).toBe("https://feelinhealthy.com/kvkk");
    expect(validatePrivacyNoticeUrl("http://example.com/privacy")).toBe("http://example.com/privacy");
    expect(validatePrivacyNoticeUrl("  https://feelinhealthy.com/kvkk  ")).toBe("https://feelinhealthy.com/kvkk");
  });

  it("blocks dangerous and invalid protocols", () => {
    expect(validatePrivacyNoticeUrl("javascript:alert(1)")).toBeNull();
    expect(validatePrivacyNoticeUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
    expect(validatePrivacyNoticeUrl("file:///etc/passwd")).toBeNull();
    expect(validatePrivacyNoticeUrl("ftp://example.com")).toBeNull();
  });

  it("handles null, undefined, empty, and malformed inputs gracefully", () => {
    expect(validatePrivacyNoticeUrl(null)).toBeNull();
    expect(validatePrivacyNoticeUrl(undefined)).toBeNull();
    expect(validatePrivacyNoticeUrl("")).toBeNull();
    expect(validatePrivacyNoticeUrl("not a url")).toBeNull();
  });
});

describe("Structured Consent Data Generation", () => {
  it("generates exact Turkish structured sentence without raw markdown brackets", () => {
    const data = getStructuredConsentData({
      privacySettings: {
        noticeUrlTr: "https://feelinhealthy.com/kvkk",
        privacyNoticeLabelTr: "Aydınlatma metnini"
      }
    }, "tr");

    expect(data.consentTextBeforeLink).toBe(
      "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. "
    );
    expect(data.privacyNoticeLabel).toBe("Aydınlatma metnini");
    expect(data.privacyNoticeUrl).toBe("https://feelinhealthy.com/kvkk");
    expect(data.consentTextAfterLink).toBe(" inceleyerek devam edebilirsiniz.");
    expect(data.isValidUrl).toBe(true);

    // Concatenated sentence test
    const reconstructed = `${data.consentTextBeforeLink}${data.privacyNoticeLabel}${data.consentTextAfterLink}`;
    expect(reconstructed).toBe(
      "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. Aydınlatma metnini inceleyerek devam edebilirsiniz."
    );

    // Ensure no raw markdown brackets exist in text parts
    expect(data.consentTextBeforeLink).not.toContain("[");
    expect(data.consentTextBeforeLink).not.toContain("]");
    expect(data.consentTextBeforeLink).not.toContain("(");
    expect(data.consentTextBeforeLink).not.toContain(")");
    expect(data.consentTextAfterLink).not.toContain("[");
    expect(data.consentTextAfterLink).not.toContain("]");
  });

  it("generates exact English structured sentence with clickable privacy notice", () => {
    const data = getStructuredConsentData({
      privacySettings: {
        noticeUrlEn: "https://feelinhealthy.com/kvkk",
        privacyNoticeLabelEn: "privacy notice"
      }
    }, "en");

    expect(data.consentTextBeforeLink).toBe(
      "To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the "
    );
    expect(data.privacyNoticeLabel).toBe("privacy notice");
    expect(data.privacyNoticeUrl).toBe("https://feelinhealthy.com/kvkk");
    expect(data.consentTextAfterLink).toBe(" before continuing.");
    expect(data.isValidUrl).toBe(true);

    const reconstructed = `${data.consentTextBeforeLink}${data.privacyNoticeLabel}${data.consentTextAfterLink}`;
    expect(reconstructed).toBe(
      "To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the privacy notice before continuing."
    );
  });
});

describe("FeelinHealthy Configuration & Placeholders", () => {
  it("has updated placeholders without budget mentions", () => {
    expect(FEELINHEALTHY_CONFIG.placeholderTr).toBe(
      "İstanbul’da implant tedavisi yaptırmak istiyorum. Avrupa Yakası ve İngilizce destek benim için önemli."
    );
    expect(FEELINHEALTHY_CONFIG.placeholderEn).toBe(
      "I want dental implants in Istanbul. European Side and English support are important to me."
    );
    expect(FEELINHEALTHY_CONFIG.placeholderTr).not.toContain("bütçe");
    expect(FEELINHEALTHY_CONFIG.placeholderTr).not.toContain("EUR");
    expect(FEELINHEALTHY_CONFIG.placeholderEn).not.toContain("budget");
    expect(FEELINHEALTHY_CONFIG.placeholderEn).not.toContain("EUR");
    expect(FEELINHEALTHY_CONFIG.privacyNoticeUrl).toBe("https://feelinhealthy.com/kvkk");
  });
});
