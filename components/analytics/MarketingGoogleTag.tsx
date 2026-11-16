import { shouldLoadMarketingPixels } from "@/lib/analytics/marketingHost";

/** Measurement ID from the ClinicBridge Analytics screen. The repo has no second stream ID. */
export const GA_MEASUREMENT_ID = "G-DP3FV4PQWD";

/**
 * Direct GA4 gtag (authoritative). Consent Mode defaults are set earlier in the root
 * layout so this config still emits one (modeled) page_view when storage is denied.
 *
 * Do NOT also enable a GA4 Configuration tag for this measurement ID inside GTM —
 * that would double page_view. Prefer this direct tag; remove the GTM GA4 config.
 */
export default function MarketingGoogleTag({
  host,
  pathname = "",
}: {
  host: string | null;
  pathname?: string | null;
}) {
  if (!shouldLoadMarketingPixels(host, pathname)) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
      <script
        id="google-analytics"
        dangerouslySetInnerHTML={{
          __html: [
            "window.dataLayer = window.dataLayer || [];",
            "function gtag(){dataLayer.push(arguments);}",
            "window.gtag = window.gtag || gtag;",
            "gtag('js', new Date());",
            // Single page_view per load — do not set send_page_view:false.
            `gtag('config', '${GA_MEASUREMENT_ID}');`,
          ].join("\n"),
        }}
      />
    </>
  );
}
