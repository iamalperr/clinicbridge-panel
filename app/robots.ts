import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";

/** There is no prior robots.txt. Allow keeps the default crawl behavior and adds the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
