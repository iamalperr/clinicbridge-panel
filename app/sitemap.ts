import type { MetadataRoute } from "next";
import { publicSitemapUrls } from "@/lib/seo/publicSitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapUrls().map((url) => ({ url }));
}
