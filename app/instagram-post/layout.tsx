import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClinicBridge AI Tech — Instagram Post Preview",
  description: "1080×1350 Instagram post design preview for ClinicBridge AI Tech.",
};

/**
 * Route-segment layout for /instagram-post.
 *
 * In Next.js App Router, only the root layout.tsx may contain <html> and <body>.
 * Nested layouts must NOT re-declare them — they simply wrap the page children.
 *
 * This layout intentionally omits AuthGuard, ThemeProvider, and I18nProvider so
 * the preview page is always publicly accessible and unaffected by dark-mode or
 * auth-state logic.
 */
export default function InstagramPostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A plain fragment is enough — the dark background is set on the page itself.
  return <>{children}</>;
}
