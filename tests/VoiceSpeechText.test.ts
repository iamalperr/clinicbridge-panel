/**
 * Phase 3 Step 3 — speech-safe reply shaping (pure, presentation only).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { toSpeechText } from "@/lib/voice/telephony/speechText";
import { buildAppointmentReviewMessage } from "@/lib/conversation/formatters";

describe("toSpeechText — markdown", () => {
  it.each([
    ["**İmplant** tedavisi sunuyoruz.", "İmplant tedavisi sunuyoruz."],
    ["__İmplant__ tedavisi sunuyoruz.", "İmplant tedavisi sunuyoruz."],
    ["Bu *önemli* bir bilgi.", "Bu önemli bir bilgi."],
    ["Bu _önemli_ bir bilgi.", "Bu önemli bir bilgi."],
    ["Kod: `ABC123` geçerli.", "Kod: ABC123 geçerli."],
    ["~~eski~~ yeni fiyat", "eski yeni fiyat"],
    ["***Çok önemli***", "Çok önemli"],
  ])("%j → %j", (input, expected) => {
    expect(toSpeechText(input)).toBe(expected);
  });

  it("headings keep their text", () => {
    expect(toSpeechText("## Randevu Bilgileri")).toBe("Randevu Bilgileri");
    expect(toSpeechText("# Başlık #\nİçerik burada.")).toBe("Başlık. İçerik burada.");
  });

  it("bullets become comma-separated items, not joined words", () => {
    expect(toSpeechText("- İmplant\n- Zirkonyum\n- Kanal tedavisi")).toBe("İmplant, Zirkonyum, Kanal tedavisi");
    expect(toSpeechText("* İmplant\n* Zirkonyum")).toBe("İmplant, Zirkonyum");
    expect(toSpeechText("• İmplant\n• Zirkonyum")).toBe("İmplant, Zirkonyum");
    expect(toSpeechText("1. İmplant\n2. Zirkonyum\n3) Kanal tedavisi")).toBe("İmplant, Zirkonyum, Kanal tedavisi");
  });

  it("list after an intro line and before a closing sentence", () => {
    expect(
      toSpeechText("Sunduğumuz tedaviler:\n\n- **İmplant**\n- Zirkonyum kaplama\n\nHangisiyle ilgileniyorsunuz?")
    ).toBe("Sunduğumuz tedaviler: İmplant, Zirkonyum kaplama. Hangisiyle ilgileniyorsunuz?");
  });

  it("list items that are full sentences keep their own punctuation", () => {
    expect(toSpeechText("- Muayene ücretsizdir.\n- Randevu gereklidir.")).toBe(
      "Muayene ücretsizdir. Randevu gereklidir."
    );
  });

  it("blockquotes and horizontal rules are removed", () => {
    expect(toSpeechText("> Not: kliniğimiz pazar kapalıdır.\n---\nTeşekkürler.")).toBe(
      "Not: kliniğimiz pazar kapalıdır. Teşekkürler."
    );
  });
});

describe("toSpeechText — links and URLs", () => {
  it("markdown links speak their label", () => {
    expect(toSpeechText("Detaylar için [web sitemiz](https://example.com) adresine bakın.")).toBe(
      "Detaylar için web sitemiz adresine bakın."
    );
  });

  it("bare URLs become a neutral spoken phrase, keeping trailing punctuation", () => {
    expect(toSpeechText("Bilgi: https://example.com/a?b=1.")).toBe("Bilgi: bağlantı.");
    expect(toSpeechText("Adres www.example.com, teşekkürler")).toBe("Adres bağlantı, teşekkürler");
    expect(toSpeechText("Link <https://example.com/x>")).toBe("Link bağlantı");
    expect(toSpeechText("See https://example.com", { urlPlaceholder: "the link" })).toBe("See the link");
  });

  it("email addresses are kept intact", () => {
    expect(toSpeechText("E-posta: info@example.com adresine yazabilirsiniz.")).toBe(
      "E-posta: info@example.com adresine yazabilirsiniz."
    );
    expect(toSpeechText("ali_veli@www.example.com")).toBe("ali_veli@www.example.com");
    expect(toSpeechText("**hasta_iletisim@klinik.com.tr**")).toBe("hasta_iletisim@klinik.com.tr");
  });
});

describe("toSpeechText — emoji, whitespace, HTML", () => {
  it.each([
    ["Tabii 😊 Size yardımcı olabilirim.", "Tabii. Size yardımcı olabilirim."],
    ["Merhaba! 👋 Size nasıl yardımcı olabilirim?", "Merhaba! Size nasıl yardımcı olabilirim?"],
    ["Randevunuz alındı ✅", "Randevunuz alındı"],
    ["📅 Tarih: 5 Şubat", "Tarih: 5 Şubat"],
    ["Harika👍🏽 teşekkürler", "Harika teşekkürler"],
    ["👨‍⚕️ Doktorumuz sizi bekliyor.", "Doktorumuz sizi bekliyor."],
    ["Teşekkürler 🇹🇷", "Teşekkürler"],
    ["Hazır. 🎉 Görüşmek üzere.", "Hazır. Görüşmek üzere."],
    ["Size yardımcı olduk 🙂 Başka sorunuz var mı?", "Size yardımcı olduk. Başka sorunuz var mı?"],
    ["Fiyat 2.500 TL 💰 KDV dahil.", "Fiyat 2.500 TL. KDV dahil."],
  ])("%j → %j", (input, expected) => {
    expect(toSpeechText(input)).toBe(expected);
  });

  it("collapses repeated spaces and blank lines", () => {
    expect(toSpeechText("Merhaba   dünya\n\n\n\nNasılsınız?")).toBe("Merhaba dünya. Nasılsınız?");
    expect(toSpeechText("  \t Merhaba \u00A0 \u200Bdünya  ")).toBe("Merhaba dünya");
  });

  it("strips basic HTML tags but keeps text, with block tags as boundaries", () => {
    expect(toSpeechText("<p>Merhaba</p><p>Nasıl yardımcı olabilirim?</p>")).toBe(
      "Merhaba. Nasıl yardımcı olabilirim?"
    );
    expect(toSpeechText("Satır bir<br>Satır iki<br/>Satır üç")).toBe("Satır bir. Satır iki. Satır üç");
    expect(toSpeechText("<ul><li>İmplant</li><li>Zirkonyum</li></ul>")).toBe("İmplant, Zirkonyum");
    expect(toSpeechText('<b>Önemli</b>: <a href="https://x.com">tıklayın</a>')).toBe("Önemli: tıklayın");
    expect(toSpeechText("Diş &amp; çene cerrahisi")).toBe("Diş & çene cerrahisi");
  });

  it("does not treat comparison signs as HTML", () => {
    expect(toSpeechText("Fiyat < 5.000 TL ve > 2.000 TL")).toBe("Fiyat < 5.000 TL ve > 2.000 TL");
  });
});

describe("toSpeechText — business values are never altered", () => {
  const PRESERVED = ["5 Şubat", "14:00", "2.500 TL", "+90 850 242 88 52", "%20", "Dr. Ahmet"];

  it.each(PRESERVED)("%j is unchanged on its own", (value) => {
    expect(toSpeechText(value)).toBe(value);
  });

  it.each(PRESERVED)("%j survives surrounding formatting", (value) => {
    expect(toSpeechText(`**${value}**`)).toBe(value);
    expect(toSpeechText(`- ${value}`)).toBe(value);
    expect(toSpeechText(`<b>${value}</b> 😊`)).toBe(value);
    expect(toSpeechText(`Bilgi: _${value}_ geçerlidir.`)).toBe(`Bilgi: ${value} geçerlidir.`);
  });

  it("dates, times, ranges, prices, percentages and phones inside sentences are untouched", () => {
    const text =
      "Randevunuz 5 Şubat 2027 Cuma, 14:00-15:30 arası. Ücret 2.500 TL (%20 indirimli 2.000,00 TL). Bize 0532 111 22 33 veya +90 850 242 88 52 numarasından ulaşın. Dr. Ahmet Yılmaz sizi bekliyor.";
    expect(toSpeechText(text)).toBe(text);
  });

  it("Turkish characters are preserved", () => {
    const text = "Çağrı, şüphe, ığdır, İstanbul, ÖĞÜŞÇİ ğüşıöç.";
    expect(toSpeechText(text)).toBe(text);
  });

  it("the real Turkish appointment confirmation summary keeps every fact with sentence boundaries", () => {
    const summary = buildAppointmentReviewMessage({
      locale: "tr",
      appointmentData: {
        patientName: "Ayşe Yılmaz",
        patientPhone: "+905321112233",
        patientEmail: "ayse@example.com",
        requestedService: "Zirkonyum kaplama",
        requestedDate: "2027-02-05",
        requestedTime: "14:00",
      },
    });
    const spoken = toSpeechText(summary);
    expect(spoken).not.toContain("\n");
    for (const fact of ["Ayşe Yılmaz", "+90 532 111 22 33", "ayse@example.com", "5 Şubat 2027 Cuma", "14:00"]) {
      expect(summary).toContain(fact);
      expect(spoken).toContain(fact);
    }
    expect(spoken).toMatch(/Ad Soyad: Ayşe Yılmaz\. Telefon: \+90 532 111 22 33\. E-posta: ayse@example\.com\. /);
    expect(spoken).toContain("Tercih Edilen Saat: 14:00. Bu bilgilerle");
    expect(spoken.endsWith("onaylıyor musunuz?")).toBe(true);
  });
});

describe("toSpeechText — edge cases", () => {
  it("empty and non-string input", () => {
    expect(toSpeechText("")).toBe("");
    expect(toSpeechText("   \n\n ")).toBe("");
    expect(toSpeechText(undefined as unknown as string)).toBe("");
    expect(toSpeechText("😊")).toBe("");
  });

  it("already-clean text is unchanged", () => {
    const clean = "Evet, implant tedavisi sunuyoruz. Hangi gün sizin için uygundur?";
    expect(toSpeechText(clean)).toBe(clean);
    expect(toSpeechText("Merhaba! Size nasıl yardımcı olabilirim?")).toBe("Merhaba! Size nasıl yardımcı olabilirim?");
  });

  it("is idempotent", () => {
    const once = toSpeechText("## Bilgi\n- **İmplant** 😊\n- Zirkonyum\nDetay: https://x.com");
    expect(toSpeechText(once)).toBe(once);
  });

  it("does not strip underscores or asterisk-free identifiers inside words", () => {
    expect(toSpeechText("Referans kodu snake_case_id kullanılır.")).toBe("Referans kodu snake_case_id kullanılır.");
  });
});

describe("speechText module boundary", () => {
  const src = readFileSync(resolve(__dirname, "..", "lib/voice/telephony/speechText.ts"), "utf8");

  it("has no provider, network, persistence or framework references", () => {
    expect(src).not.toMatch(
      /livekit|verimor|openai|anthropic|elevenlabs|deepgram|azure|websocket|firestore|firebase|from ["']next|NextRequest|NextResponse|fetch\(|process\.env/i
    );
  });

  it("imports nothing", () => {
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });
});
