import type { MetadataRoute } from "next";
import { absolutePublicUrl, PUBLIC_INDEXABLE_ENTRIES } from "@/lib/seo/publicSitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_INDEXABLE_ENTRIES.map((entry) => ({
    url: absolutePublicUrl(entry.path),
    lastModified: entry.lastmod,
    alternates: entry.languages
      ? {
          languages: {
            tr: absolutePublicUrl(entry.languages.tr),
            en: absolutePublicUrl(entry.languages.en),
          },
        }
      : undefined,
  }));
}
