"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import UnauthorizedScreen from "./UnauthorizedScreen";
import { isSuperAdmin, DEFAULT_PERMISSIONS } from "@/lib/types";
import type { PermissionTab } from "@/lib/types";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      const PUBLIC_ROUTES = ["/", "/login", "/privacy", "/terms", "/kvkk", "/landing", "/reset-password", "/showcase-demo", "/showcase-patient-questions", "/linkedin-assets", "/social-posts", "/widget-guide", "/agency-demo"];
      const isPublicRoute = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/demo/") || pathname.startsWith("/agency-demo");
      
      if (!user && !isPublicRoute) {
        router.replace("/login");
      } else if (user && profile && (pathname === "/login" || pathname === "/")) {
        const isAgencyRole = profile.role === "agencyAdmin" || profile.role === "agencyUser";
        const isClinicUser = profile.role === "clinicUser" || profile.role === "clinicAdmin" || profile.role === "viewer";
        
        if (isAgencyRole) {
          router.replace("/agency");
        } else if (isClinicUser && profile.clinicId) {
          router.replace(`/clinics/${profile.clinicId}`);
        } else {
          router.replace("/clinics");
        }
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
  const PUBLIC_ROUTES = ["/", "/login", "/privacy", "/terms", "/kvkk", "/landing", "/reset-password", "/showcase-demo", "/showcase-patient-questions", "/linkedin-assets", "/social-posts", "/widget-guide", "/agency-demo"];
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/demo/") || pathname.startsWith("/agency-demo");

  if (!user && !isPublicRoute) {
    return null;
  }

  // Authorization Logic
  const roleStr = profile?.role as string;
  const isAdmin = roleStr === "admin" || roleStr === "platform_admin" || roleStr === "Yönetici" || roleStr === "yonetici";
  const isClinicUser = roleStr === "clinicUser" || roleStr === "Klinik Kullanıcısı";
  const isAgencyUser = roleStr === "agencyAdmin" || roleStr === "agencyUser";

  const isAuthorized = profile && (isAdmin || profile.status === "active");

  if (user && !isAuthorized && !isPublicRoute) {
    console.warn("[AuthGuard] Blocking access. State:", {
      uid: user.uid,
      hasProfile: !!profile,
      role: profile?.role,
      status: profile?.status
    });
    return <UnauthorizedScreen />;
  }

  const hasPermission = (tab: PermissionTab) => {
    if (!profile) return false;
    if (profile.permissions && profile.permissions.length > 0) {
      return profile.permissions.includes(tab);
    }
    return DEFAULT_PERMISSIONS[profile.role]?.includes(tab) || isSuperAdmin(profile.role);
  };

  // Global Route Checks
  if (user && profile && !isPublicRoute) {
    if (pathname.startsWith("/users") && !hasPermission("users")) {
      return <UnauthorizedScreen />;
    }
    if (pathname === "/settings" && !hasPermission("system_settings")) {
      return <UnauthorizedScreen />;
    }
    if (pathname.startsWith("/analytics") && !hasPermission("analytics")) {
      // /analytics/ai-usage handled below or separately, but generally handled by analytics
      if (pathname === "/analytics/ai-usage" && !hasPermission("ai_usage")) {
        return <UnauthorizedScreen />;
      }
      if (pathname === "/analytics" && !hasPermission("analytics")) {
        return <UnauthorizedScreen />;
      }
    }
    if (pathname.startsWith("/demo-requests") && !hasPermission("demo_requests")) {
      return <UnauthorizedScreen />;
    }
  }

  // Clinic Level Route Guards
  if (user && profile && !isPublicRoute && (isClinicUser || roleStr === "viewer" || roleStr === "clinicAdmin")) {
    const clinicMatch = pathname.match(/^\/clinics\/([^/]+)(\/.*)?$/);
    if (clinicMatch) {
      const accessedClinicId = clinicMatch[1];
      const subRoute = clinicMatch[2] || ""; // e.g., "/ai-settings", or empty string for overview

      // Block cross-clinic access for non-super-admins
      if (profile.clinicId && accessedClinicId !== profile.clinicId && !isAdmin) {
        return <UnauthorizedScreen />;
      }

      // Check subroute permissions
      const routePermissionMap: Record<string, PermissionTab> = {
        "": "clinic_overview",
        "/ai-settings": "clinic_prompt",
        "/voice": "clinic_voice",
        "/widget": "clinic_widget",
        "/training": "clinic_training",
        "/notes": "clinic_notes",
        "/usage": "clinic_usage",
        "/logs": "clinic_logs",
        "/appointments": "clinic_appointments",
        "/settings": "clinic_settings"
      };

      const requiredPermission = routePermissionMap[subRoute];
      if (requiredPermission && !hasPermission(requiredPermission)) {
        return <UnauthorizedScreen />;
      }
    } else if (pathname === "/clinics" && !hasPermission("dashboard")) {
      if (profile.clinicId) {
        router.replace(`/clinics/${profile.clinicId}`);
        return null;
      }
      if (isAgencyUser) {
        router.replace("/agency");
        return null;
      }
      return <UnauthorizedScreen />;
    }
  }

  // Route-Level Role Guards for Agency Users
  if (user && profile && !isPublicRoute && isAgencyUser) {
    // Agency users can only access /agency/* routes
    if (!pathname.startsWith("/agency")) {
      return <UnauthorizedScreen />;
    }
    // Block access to other agencies
    // (agency routes don't have agencyId in URL — they read from profile.agencyId)
  }

  // Block clinic/admin users from accessing /agency/* routes
  if (user && profile && !isPublicRoute && !isAdmin && !isAgencyUser && pathname.startsWith("/agency")) {
    return <UnauthorizedScreen />;
  }

  return <>{children}</>;
}
