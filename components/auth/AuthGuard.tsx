"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import UnauthorizedScreen from "./UnauthorizedScreen";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== "/login") {
        router.replace("/login");
      } else if (user && profile && pathname === "/login") {
        router.replace("/clinics");
      }
    }
  }, [user, profile, loading, pathname, router]);

  if (loading) {
    return (
      <div style={{ height: "100dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-app)" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading session...</p>
      </div>
    );
  }

  // Prevent flashing of protected content if redirecting to login
  if (!user && pathname !== "/login") {
    return null;
  }

  // Authorization Logic
  const isAuthorized = profile && (
    profile.role === "admin" || 
    profile.status === "active"
  );

  if (user && !isAuthorized && pathname !== "/login") {
    console.warn("[AuthGuard] Blocking access. State:", {
      uid: user.uid,
      hasProfile: !!profile,
      role: profile?.role,
      status: profile?.status
    });
    return <UnauthorizedScreen />;
  }

  return <>{children}</>;
}
