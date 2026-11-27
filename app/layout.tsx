import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import MarketingGoogleTag from "@/components/analytics/MarketingGoogleTag";
import MarketingMetaPixel from "@/components/analytics/MarketingMetaPixel";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import AuthGuard from "@/components/auth/AuthGuard";
import CookieBanner from "@/components/ui/CookieBanner";
import ActivityTracker from "@/components/analytics/ActivityTracker";
import LeadAttributionTracker from "@/components/landing/LeadAttributionTracker";
import { isMarketingDocumentPath } from "@/lib/auth/publicRoutes";
import { consentModeBootstrapScript } from "@/lib/analytics/consentMode";

const inter = Inter({ subsets: ["latin"] });

/**
 * Root fallback for pages without their own metadata (e.g. /hakkimizda).
 * Turkish homepage (/) and /en set absolute titles via homeMetadata — do not change those.
 */
export const metadata: Metadata = {
  title: "Multilingual AI Assistant for Medical Tourism Clinics | ClinicBridge AI",
  description:
    "AI chat and phone assistant that answers international patients 24/7 in their language. Set it up yourself. 14-day free trial. No credit card required.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const host = headerList.get("host");
  const pathname = headerList.get("x-pathname") ?? "";
  const marketingDocument = isMarketingDocumentPath(pathname);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Consent Mode v2 defaults before GTM/GA so page_view is modeled when storage is denied. */}
        <script
          id="google-consent-default"
          dangerouslySetInnerHTML={{ __html: consentModeBootstrapScript() }}
        />
        {/* Direct GA4 + Meta — authoritative. GTM must not also fire that GA4 stream or a duplicate Meta Pixel. */}
        <MarketingGoogleTag host={host} pathname={pathname} />
        <MarketingMetaPixel host={host} pathname={pathname} />
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID || "GTM-M8KJQNP8"}');
          `}
        </Script>
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID || "GTM-M8KJQNP8"}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
          }}
        />
        {marketingDocument ? (
          <>
            {children}
            <LeadAttributionTracker />
            <CookieBanner />
          </>
        ) : (
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
          >
            <I18nProvider>
              <AuthProvider>
                <ActivityTracker />
                <LeadAttributionTracker />
                <AuthGuard>
                  {children}
                </AuthGuard>
              </AuthProvider>
            </I18nProvider>
            <CookieBanner />
          </ThemeProvider>
        )}
      </body>
    </html>
  );
}
