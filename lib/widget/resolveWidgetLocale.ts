/**
 * Canonical widget UI locale resolver for single-clinic embeds.
 *
 * Precedence (highest → lowest):
 * 1. Explicit user selection inside the chatbot (session lock)
 * 2. Explicit embed/host config (data-language / data-locale / init payload)
 * 3. Host document locale (<html lang>, optional hostLocale)
 * 4. Browser preferred language(s)
 * 5. Clinic default language (when not "auto")
 * 6. Product default ("en")
 *
 * UI locale follows the host site when available.
 * Conversation language may still adapt to the patient later in chat.
 */

export type SupportedWidgetLocale = "tr" | "en";

export type WidgetLocaleSource =
  | "user-selected"
  | "embed-attr"
  | "host-document"
  | "browser"
  | "clinic-default"
  | "product-default";

export interface ResolveWidgetLocaleInput {
  /** Explicit in-widget language choice for this session */
  userSelectedLocale?: string | null;
  /** data-language / data-locale / embed init locale */
  explicitLocale?: string | null;
  /** Host page locale, e.g. document.documentElement.lang */
  hostDocumentLocale?: string | null;
  /** navigator.language / navigator.languages */
  browserLocales?: string[] | null;
  /** Clinic widget settings defaultLanguage */
  clinicDefaultLocale?: string | null;
  /** Final fallback */
  productDefaultLocale?: string | null;
  /** Locales the product can render UI for */
  supportedLocales?: SupportedWidgetLocale[];
}

export interface ResolveWidgetLocaleResult {
  locale: SupportedWidgetLocale;
  source: WidgetLocaleSource;
  normalizedInput?: string | null;
}

const DEFAULT_SUPPORTED: SupportedWidgetLocale[] = ["tr", "en"];

/**
 * Normalize BCP-47 / loose tags to a supported widget locale, or null if unsupported.
 */
export function normalizeWidgetLocale(
  raw: string | null | undefined,
  supported: SupportedWidgetLocale[] = DEFAULT_SUPPORTED
): SupportedWidgetLocale | null {
  if (!raw || typeof raw !== "string") return null;
  const primary = raw.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  if (!primary) return null;
  if ((supported as string[]).includes(primary)) {
    return primary as SupportedWidgetLocale;
  }
  return null;
}

function firstBrowserMatch(
  browserLocales: string[] | null | undefined,
  supported: SupportedWidgetLocale[]
): { locale: SupportedWidgetLocale; tag: string } | null {
  if (!browserLocales || !browserLocales.length) return null;
  for (const tag of browserLocales) {
    const n = normalizeWidgetLocale(tag, supported);
    if (n) return { locale: n, tag };
  }
  return null;
}

export function resolveWidgetLocale(input: ResolveWidgetLocaleInput): ResolveWidgetLocaleResult {
  const supported = input.supportedLocales?.length ? input.supportedLocales : DEFAULT_SUPPORTED;
  const productDefault =
    normalizeWidgetLocale(input.productDefaultLocale, supported) ||
    (supported.includes("en") ? "en" : supported[0]);

  const user = normalizeWidgetLocale(input.userSelectedLocale, supported);
  if (user) {
    return { locale: user, source: "user-selected", normalizedInput: input.userSelectedLocale };
  }

  const explicit = normalizeWidgetLocale(input.explicitLocale, supported);
  if (explicit) {
    return { locale: explicit, source: "embed-attr", normalizedInput: input.explicitLocale };
  }

  const host = normalizeWidgetLocale(input.hostDocumentLocale, supported);
  if (host) {
    return { locale: host, source: "host-document", normalizedInput: input.hostDocumentLocale };
  }

  const browser = firstBrowserMatch(input.browserLocales, supported);
  if (browser) {
    return { locale: browser.locale, source: "browser", normalizedInput: browser.tag };
  }

  const clinicRaw = input.clinicDefaultLocale;
  if (clinicRaw && String(clinicRaw).toLowerCase() !== "auto") {
    const clinic = normalizeWidgetLocale(clinicRaw, supported);
    if (clinic) {
      return { locale: clinic, source: "clinic-default", normalizedInput: clinicRaw };
    }
  }

  return { locale: productDefault, source: "product-default", normalizedInput: input.productDefaultLocale || null };
}

/** Read <html lang> (or equivalent) safely. */
export function readHostDocumentLocale(doc?: { documentElement?: { lang?: string } | null } | null): string | null {
  const lang = doc?.documentElement?.lang;
  return typeof lang === "string" && lang.trim() ? lang.trim() : null;
}
