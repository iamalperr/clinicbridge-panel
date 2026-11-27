"use client";

/**
 * Admin segment: auth is provided by RootAppShell for non-marketing paths.
 * This layout exists so /admin is an explicit authenticated panel boundary
 * (and a place for future admin-only chrome).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
