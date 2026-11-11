/** Canonical origin of the public marketing site. */
export const PUBLIC_SITE_ORIGIN = "https://clinicbridge-ai.com";

export type PublicIndexablePath = {
  path: string;
  /** ISO date used as sitemap lastmod */
  lastmod: string;
  languages?: { tr: string; en: string };
};

/**
 * Pages that are published on the marketing host, linked for visitors,
 * and not marked noindex. Previews, demos, signup redirects, and the panel stay out.
 */
export const PUBLIC_INDEXABLE_ENTRIES: PublicIndexablePath[] = [
  { path: "/", lastmod: "2026-11-11", languages: { tr: "/", en: "/en" } },
  { path: "/en", lastmod: "2026-11-11", languages: { tr: "/", en: "/en" } },
  { path: "/sss", lastmod: "2026-11-11", languages: { tr: "/sss", en: "/en/sss" } },
  { path: "/en/sss", lastmod: "2026-11-11", languages: { tr: "/sss", en: "/en/sss" } },
  { path: "/klinikler-icin-yapay-zeka-asistani", lastmod: "2026-11-11" },
  { path: "/hakkimizda", lastmod: "2026-11-11" },
  { path: "/fiyatlandirma", lastmod: "2026-11-11" },
  { path: "/kurulum-rehberi", lastmod: "2026-11-11" },
  { path: "/privacy", lastmod: "2026-11-01" },
  { path: "/terms", lastmod: "2026-11-01" },
  { path: "/kvkk", lastmod: "2026-11-01" },
  { path: "/teslimat-ve-iade", lastmod: "2026-11-01" },
  { path: "/mesafeli-satis-sozlesmesi", lastmod: "2026-11-01" },
];

/** @deprecated Prefer PUBLIC_INDEXABLE_ENTRIES — kept for existing path-only callers/tests. */
export const PUBLIC_INDEXABLE_PATHS = PUBLIC_INDEXABLE_ENTRIES.map((entry) => entry.path);

export function publicSitemapUrls(): string[] {
  return PUBLIC_INDEXABLE_ENTRIES.map((entry) =>
    entry.path === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${entry.path}`
  );
}

export function absolutePublicUrl(path: string): string {
  return path === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${path}`;
}
