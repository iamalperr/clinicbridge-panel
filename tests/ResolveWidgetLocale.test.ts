import { describe, it, expect } from "vitest";
import {
  normalizeWidgetLocale,
  resolveWidgetLocale,
  readHostDocumentLocale,
} from "../lib/widget/resolveWidgetLocale";

describe("normalizeWidgetLocale", () => {
  it("maps en / en-US / en-GB to en", () => {
    expect(normalizeWidgetLocale("en")).toBe("en");
    expect(normalizeWidgetLocale("en-US")).toBe("en");
    expect(normalizeWidgetLocale("en-GB")).toBe("en");
  });

  it("maps tr / tr-TR to tr", () => {
    expect(normalizeWidgetLocale("tr")).toBe("tr");
    expect(normalizeWidgetLocale("tr-TR")).toBe("tr");
  });

  it("returns null for unsupported locales", () => {
    expect(normalizeWidgetLocale("fr-FR")).toBeNull();
    expect(normalizeWidgetLocale("de")).toBeNull();
    expect(normalizeWidgetLocale("")).toBeNull();
    expect(normalizeWidgetLocale(null)).toBeNull();
  });
});

describe("resolveWidgetLocale precedence", () => {
  it("user selection beats host and browser", () => {
    const r = resolveWidgetLocale({
      userSelectedLocale: "tr",
      explicitLocale: "en",
      hostDocumentLocale: "en",
      browserLocales: ["en-US"],
      clinicDefaultLocale: "en",
    });
    expect(r).toEqual({ locale: "tr", source: "user-selected", normalizedInput: "tr" });
  });

  it("explicit embed locale beats host document and browser", () => {
    const r = resolveWidgetLocale({
      explicitLocale: "en",
      hostDocumentLocale: "tr",
      browserLocales: ["tr-TR"],
      clinicDefaultLocale: "auto",
    });
    expect(r.locale).toBe("en");
    expect(r.source).toBe("embed-attr");
  });

  it("host document locale beats browser (EN site + TR browser)", () => {
    const r = resolveWidgetLocale({
      hostDocumentLocale: "en",
      browserLocales: ["tr-TR"],
      clinicDefaultLocale: "auto",
    });
    expect(r).toMatchObject({ locale: "en", source: "host-document" });
  });

  it("host document locale beats browser (TR site + EN browser)", () => {
    const r = resolveWidgetLocale({
      hostDocumentLocale: "tr-TR",
      browserLocales: ["en-US"],
      clinicDefaultLocale: "auto",
    });
    expect(r).toMatchObject({ locale: "tr", source: "host-document" });
  });

  it("browser locale used when host locale missing", () => {
    const r = resolveWidgetLocale({
      browserLocales: ["tr-TR", "en-US"],
      clinicDefaultLocale: "auto",
    });
    expect(r).toMatchObject({ locale: "tr", source: "browser" });
  });

  it("clinic default used when host and browser unsupported", () => {
    const r = resolveWidgetLocale({
      hostDocumentLocale: "fr-FR",
      browserLocales: ["de-DE"],
      clinicDefaultLocale: "tr",
    });
    expect(r).toMatchObject({ locale: "tr", source: "clinic-default" });
  });

  it("product default when nothing else resolves", () => {
    const r = resolveWidgetLocale({
      hostDocumentLocale: "fr",
      browserLocales: ["de"],
      clinicDefaultLocale: "auto",
    });
    expect(r).toMatchObject({ locale: "en", source: "product-default" });
  });

  it("legacy embed without locale still works via browser", () => {
    const r = resolveWidgetLocale({
      explicitLocale: null,
      hostDocumentLocale: null,
      browserLocales: ["en-US"],
      clinicDefaultLocale: "auto",
    });
    expect(r.locale).toBe("en");
    expect(r.source).toBe("browser");
  });
});

describe("readHostDocumentLocale", () => {
  it("reads html lang", () => {
    expect(readHostDocumentLocale({ documentElement: { lang: "en" } })).toBe("en");
    expect(readHostDocumentLocale({ documentElement: { lang: "  tr-TR " } })).toBe("tr-TR");
    expect(readHostDocumentLocale({ documentElement: { lang: "" } })).toBeNull();
  });
});
