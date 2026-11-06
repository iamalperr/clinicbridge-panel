/** Canonical origin of the public marketing site. */
export const PUBLIC_SITE_ORIGIN = "https://clinicbridge-ai.com";

/**
 * Pages that are published on the marketing host, linked for visitors,
 * and not marked noindex. Previews, demos, signup redirects, and the panel stay out.
 */
export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/hakkimizda",
  "/fiyatlandirma",
  "/privacy",
  "/terms",
  "/kvkk",
  "/teslimat-ve-iade",
  "/mesafeli-satis-sozlesmesi",
] as const;

export function publicSitemapUrls(): string[] {
  return PUBLIC_INDEXABLE_PATHS.map((path) =>
    path === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${path}`
  );
}
