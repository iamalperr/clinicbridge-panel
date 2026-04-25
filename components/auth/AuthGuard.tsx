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
      const PUBLIC_ROUTES = ["/login", "/privacy", "/terms", "/kvkk", "/landing"];
      const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
      
      if (!user && !isPublicRoute) {
        router.replace("/login");
      } else if (user && profile && pathname === "/login") {
        router.replace("/clinics");
      }
    }
  }, [user, profile, loading, pathname, router]);

  if (loading) {
    return (
      <div style={{ 
        height: "100dvh", 
        width: "100%", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center", 
        background: "var(--bg-app)",
        gap: 16
      }}>
        <div style={{ 
          width: 32, 
          height: 32, 
          borderRadius: "50%", 
          border: "3px solid rgba(99, 102, 241, 0.2)", 
          borderTopColor: "#6366f1", 
          animation: "spin 1s linear infinite" 
        }} />
        <p style={{ color: "var(--text-muted, #64748b)", fontSize: 14, fontWeight: 500 }}>
          Hesabınız kontrol ediliyor...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Prevent flashing of protected content if redirecting to login
  const PUBLIC_ROUTES = ["/login", "/privacy", "/terms", "/kvkk", "/landing"];
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (!user && !isPublicRoute) {
    return null;
  }

  // Authorization Logic
  const isAuthorized = profile && (
    profile.role === "admin" || 
    profile.status === "active"
  );

  if (user && !isAuthorized && !isPublicRoute) {
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
