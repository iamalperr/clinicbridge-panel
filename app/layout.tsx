import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import AuthGuard from "@/components/auth/AuthGuard";
import CookieBanner from "@/components/ui/CookieBanner";
import ActivityTracker from "@/components/analytics/ActivityTracker";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClinicBridge — AI Clinic Management Platform",
  description: "Multi-tenant AI assistant management platform for clinics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <I18nProvider>
            <AuthProvider>
              <ActivityTracker />
              <AuthGuard>
                {children}
              </AuthGuard>
            </AuthProvider>
          </I18nProvider>
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
