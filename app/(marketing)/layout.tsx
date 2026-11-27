import MarketingChrome from "./MarketingChrome";

/** Marketing pages must be CDN-static (no serverless per request). */
export const dynamic = "force-static";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingChrome>{children}</MarketingChrome>;
}
