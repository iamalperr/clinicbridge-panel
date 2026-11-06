import { isMarketingAnalyticsHost } from "@/lib/analytics/marketingHost";

/** Measurement ID from the ClinicBridge Analytics screen. The repo has no second stream ID. */
export const GA_MEASUREMENT_ID = "G-DP3FV4PQWD";

/**
 * Literal GA4 tags for the document head. Render this from the root layout
 * after the host is already known, so the tags are in the first HTML response.
 * One config call sends one page_view.
 */
export default function MarketingGoogleTag({ host }: { host: string | null }) {
  if (!isMarketingAnalyticsHost(host)) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
      <script
        id="google-analytics"
        dangerouslySetInnerHTML={{
          __html: [
            "window.dataLayer = window.dataLayer || [];",
            "function gtag(){dataLayer.push(arguments);}",
            "gtag('js', new Date());",
            `gtag('config', '${GA_MEASUREMENT_ID}');`,
          ].join("\n"),
        }}
      />
    </>
  );
}
