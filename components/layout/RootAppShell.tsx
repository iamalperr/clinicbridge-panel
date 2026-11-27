"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import AuthGuard from "@/components/auth/AuthGuard";
import ActivityTracker from "@/components/analytics/ActivityTracker";
import LeadAttributionTracker from "@/components/landing/LeadAttributionTracker";
import { isMarketingDocumentPath } from "@/lib/auth/publicRoutes";

/**
 * Client shell: marketing/legal document paths skip AuthProvider entirely so
 * public HTML stays free of session work. Panel routes keep AuthGuard.
 *
 * Hosted under the static root layout (no cookies()/headers() there).
 */
export default function RootAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";

  if (isMarketingDocumentPath(pathname)) {
    return (
      <>
        {children}
        <LeadAttributionTracker />
      </>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <I18nProvider>
        <AuthProvider>
          <ActivityTracker />
          <LeadAttributionTracker />
          <AuthGuard>{children}</AuthGuard>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
