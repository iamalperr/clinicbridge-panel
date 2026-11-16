import {
  sanitizeMetaPixelId,
  shouldLoadMarketingPixels,
} from "@/lib/analytics/marketingHost";

/**
 * Direct Meta Pixel (consent-aware). Renders nothing when NEXT_PUBLIC_META_PIXEL_ID
 * is empty/invalid. Loads on marketing hosts and app /kayit so CompleteRegistration
 * does not depend on GTM being present on the app domain.
 */
export default function MarketingMetaPixel({
  host,
  pathname = "",
  pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID,
}: {
  host: string | null;
  pathname?: string | null;
  pixelId?: string | null;
}) {
  const id = sanitizeMetaPixelId(pixelId);
  if (!id || !shouldLoadMarketingPixels(host, pathname)) return null;

  const bootstrap = [
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?",
    "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;",
    "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;",
    "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',",
    "'https://connect.facebook.net/en_US/fbevents.js');",
    // Pause fires until cookie banner accept (or restore prior accept below).
    "fbq('consent','revoke');",
    `fbq('init','${id}');`,
    "fbq('track','PageView');",
    "(function(){try{if(localStorage.getItem('cb-cookie-consent')==='accepted'){fbq('consent','grant');}}catch(e){}})();",
  ].join("");

  return (
    <>
      <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height={1}
          width={1}
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
