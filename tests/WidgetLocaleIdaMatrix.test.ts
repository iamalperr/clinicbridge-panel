import { describe, it, expect } from "vitest";
import { resolveWidgetLocale } from "../lib/widget/resolveWidgetLocale";

/**
 * İstanbul Diş Akademisi matrix (host sets <html lang>, no data-language on embed).
 * Mirrors production: TR → lang=tr-TR, EN → lang=en-GB.
 */
describe("IDA locale matrix (host html lang)", () => {
  const idaCases = [
    { name: "EN site + TR browser", host: "en-GB", browser: ["tr-TR"], expect: "en" },
    { name: "TR site + EN browser", host: "tr-TR", browser: ["en-US"], expect: "tr" },
    { name: "EN site + EN browser", host: "en-GB", browser: ["en-US"], expect: "en" },
    { name: "TR site + TR browser", host: "tr-TR", browser: ["tr-TR"], expect: "tr" },
  ] as const;

  for (const c of idaCases) {
    it(c.name, () => {
      const r = resolveWidgetLocale({
        explicitLocale: null,
        hostDocumentLocale: c.host,
        browserLocales: [...c.browser],
        clinicDefaultLocale: "auto",
      });
      expect(r.locale).toBe(c.expect);
      expect(r.source).toBe("host-document");
    });
  }

  it("language switch TR→EN follows new host lang (no user lock)", () => {
    const before = resolveWidgetLocale({
      hostDocumentLocale: "tr-TR",
      browserLocales: ["en-US"],
    });
    expect(before.locale).toBe("tr");

    const after = resolveWidgetLocale({
      hostDocumentLocale: "en-GB",
      browserLocales: ["en-US"],
    });
    expect(after.locale).toBe("en");
  });

  it("language switch EN→TR follows new host lang (no user lock)", () => {
    const before = resolveWidgetLocale({
      hostDocumentLocale: "en-GB",
      browserLocales: ["tr-TR"],
    });
    expect(before.locale).toBe("en");

    const after = resolveWidgetLocale({
      hostDocumentLocale: "tr-TR",
      browserLocales: ["tr-TR"],
    });
    expect(after.locale).toBe("tr");
  });

  it("user lock survives host language switch", () => {
    const r = resolveWidgetLocale({
      userSelectedLocale: "tr",
      hostDocumentLocale: "en-GB",
      browserLocales: ["en-US"],
    });
    expect(r.locale).toBe("tr");
    expect(r.source).toBe("user-selected");
  });
});
