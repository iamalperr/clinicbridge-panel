/**
 * Turkish TTS speech renderer: machine/display formats become natural spoken Turkish on the
 * speech copy only. The canonical Agent Core reply is never modified.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  renderSpeechForLocale,
  renderTurkishSpeech,
  turkishCardinal,
} from "@/lib/voice/telephony/turkishSpeechRenderer";
import { toSpeechText } from "@/lib/voice/telephony/speechText";
import { buildAppointmentReviewMessage } from "@/lib/conversation/formatters";

const REPO = resolve(__dirname, "..");

describe("time", () => {
  it.each([
    ["14:00", "saat on dört"],
    ["14:30", "saat on dört otuz"],
    ["09:00", "saat dokuz"],
    ["12:15", "saat on iki on beş"],
    ["9:05", "saat dokuz sıfır beş"],
    ["00:30", "saat sıfır otuz"],
  ])("%s → %s", (input, spoken) => {
    expect(renderTurkishSpeech(input)).toBe(spoken);
  });

  it("no colon reaches TTS for a clock time inside prose", () => {
    const out = renderTurkishSpeech("Randevunuz 14:00 için not edildi.");
    expect(out).toBe("Randevunuz saat on dört için not edildi.");
    expect(out).not.toMatch(/\d:\d/);
  });

  it("does not double 'saat' after a saat label or word", () => {
    expect(renderTurkishSpeech("Tercih Edilen Saat: 14:00.")).toBe("Tercih Edilen Saat: on dört.");
    expect(renderTurkishSpeech("saat 09:30 uygun mu?")).toBe("saat dokuz otuz uygun mu?");
  });

  it("attaches a Turkish case suffix to the spoken words", () => {
    expect(renderTurkishSpeech("14:00'te görüşelim")).toBe("saat on dörtte görüşelim");
    expect(renderTurkishSpeech("14:30’da")).toBe("saat on dört otuzda");
    expect(renderTurkishSpeech("Randevunuz 09:00'da.")).toBe("Randevunuz saat dokuzda.");
    expect(renderTurkishSpeech("saat 09:00'da gelin")).toBe("saat dokuzda gelin");
  });

  it("renders a time range without a spoken hyphen", () => {
    expect(renderTurkishSpeech("14:00-16:00 arasında")).toBe("saat on dört ile on altı arasında");
  });

  it("leaves invalid or non-clock colon numbers alone", () => {
    expect(renderTurkishSpeech("25:00")).toBe("25:00");
    expect(renderTurkishSpeech("12:75")).toBe("12:75");
    expect(renderTurkishSpeech("oran 16:9")).toBe("oran 16:9");
    expect(renderTurkishSpeech("süre 01:02:03")).toBe("süre 01:02:03");
  });
});

describe("date", () => {
  it("12.10.2026 → natural Turkish spoken date", () => {
    expect(renderTurkishSpeech("12.10.2026")).toBe("on iki Ekim iki bin yirmi altı");
  });

  it("slash and hyphen day-first dates are spoken the same way", () => {
    expect(renderTurkishSpeech("12/10/2026")).toBe("on iki Ekim iki bin yirmi altı");
    expect(renderTurkishSpeech("05-02-2027")).toBe("beş Şubat iki bin yirmi yedi");
  });

  it("canonical ISO appointment date → natural Turkish spoken date", () => {
    expect(renderTurkishSpeech("Tarihi 2026-10-12 olarak not aldım.")).toBe(
      "Tarihi on iki Ekim iki bin yirmi altı olarak not aldım."
    );
  });

  it("date suffix is attached", () => {
    expect(renderTurkishSpeech("12.10.2026'da")).toBe("on iki Ekim iki bin yirmi altıda");
  });

  it("decimal numbers, prices and versions are not dates", () => {
    expect(renderTurkishSpeech("Ortalama 3.5 gün sürer.")).toBe("Ortalama 3.5 gün sürer.");
    expect(renderTurkishSpeech("12.10 oranında")).toBe("12.10 oranında");
    expect(renderTurkishSpeech("Ücret 2.500 TL, paket 1.500.000 TL.")).toBe("Ücret 2.500 TL, paket 1.500.000 TL.");
    expect(renderTurkishSpeech("Sürüm 1.2.3 yayında.")).toBe("Sürüm 1.2.3 yayında.");
    expect(renderTurkishSpeech("IP 192.168.1.10")).toBe("IP 192.168.1.10");
  });

  it("impossible calendar dates are left as written", () => {
    expect(renderTurkishSpeech("31.02.2026")).toBe("31.02.2026");
    expect(renderTurkishSpeech("2026-13-01")).toBe("2026-13-01");
  });
});

describe("email, phone, URL, prose", () => {
  it("email symbols → natural Turkish speech", () => {
    expect(renderTurkishSpeech("E-posta: yusuf.alper_oz-1@gmail.com.")).toBe(
      "E-posta: yusuf nokta alper alt çizgi oz tire 1 et gmail nokta com."
    );
  });

  it("phone numbers are grouped for comprehension, never one giant number", () => {
    expect(renderTurkishSpeech("Telefon: 0532 123 45 67")).toBe(
      "Telefon: sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi"
    );
    expect(renderTurkishSpeech("+90 850 242 88 52")).toBe("artı doksan, sekiz yüz elli, iki yüz kırk iki, seksen sekiz, elli iki");
    expect(renderTurkishSpeech("05321234567")).toBe("sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi");
  });

  it("URLs are not corrupted (dates, times or dots inside them stay)", () => {
    const url = "https://klinik.example.com/randevu/2026-10-12?saat=14:00&v=1.2.3";
    expect(renderTurkishSpeech(`Detaylar: ${url} adresinde.`)).toBe(`Detaylar: ${url} adresinde.`);
    expect(renderTurkishSpeech("www.klinik.com.tr/12.10.2026")).toBe("www.klinik.com.tr/12.10.2026");
  });

  it("normal prose is unchanged", () => {
    const prose = "Merhaba, implant tedavisi hakkında bilgi verebilirim. Kliniğimiz Kadıköy'de, 3 doktorumuz var.";
    expect(renderTurkishSpeech(prose)).toBe(prose);
    expect(renderTurkishSpeech("")).toBe("");
  });

  it("is idempotent on already-rendered speech", () => {
    const once = renderTurkishSpeech("12.10.2026 saat 14:30, telefon 0532 123 45 67");
    expect(renderTurkishSpeech(once)).toBe(once);
  });
});

describe("appointment review summary as spoken", () => {
  it("canonical summary keeps machine values; only the speech copy is rendered", () => {
    const canonical = buildAppointmentReviewMessage({
      locale: "tr",
      appointmentData: {
        patientName: "Ayşe Yılmaz",
        patientPhone: "05321234567",
        emailDisposition: "DECLINED",
        requestedService: "implant",
        requestedDate: "2026-10-12",
        requestedTime: "14:00",
      },
    });
    const before = canonical;
    const speech = renderSpeechForLocale(toSpeechText(canonical), "tr");

    expect(canonical).toBe(before);
    expect(canonical).toContain("Tercih Edilen Saat: 14:00");
    expect(speech).toContain("Tercih Edilen Saat: on dört");
    expect(speech).toContain("12 Ekim 2026");
    expect(speech).toContain("Telefon: artı doksan, beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi.");
    expect(speech).not.toMatch(/\d:\d|E-posta/);
  });
});

describe("locale gating and purity", () => {
  it("renders Turkish and unlabelled voice replies; other locales pass through", () => {
    expect(renderSpeechForLocale("14:00", "tr")).toBe("saat on dört");
    expect(renderSpeechForLocale("14:00", "tr-TR")).toBe("saat on dört");
    expect(renderSpeechForLocale("14:00", undefined)).toBe("saat on dört");
    expect(renderSpeechForLocale("14:00", "en")).toBe("14:00");
    expect(renderSpeechForLocale("14:00", "de-DE")).toBe("14:00");
  });

  it("cardinals", () => {
    expect(turkishCardinal(0)).toBe("sıfır");
    expect(turkishCardinal(100)).toBe("yüz");
    expect(turkishCardinal(1000)).toBe("bin");
    expect(turkishCardinal(2026)).toBe("iki bin yirmi altı");
    expect(turkishCardinal(1987)).toBe("bin dokuz yüz seksen yedi");
  });

  it("renderer is pure: no imports, no Firestore, no LLM, no network, no tenant data", () => {
    const src = readFileSync(resolve(REPO, "lib/voice/telephony/turkishSpeechRenderer.ts"), "utf8");
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/firebase|firestore|openai|fetch\(|process\.env|clinicId|console\./i);
  });
});
