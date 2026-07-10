"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import {
  Building2, ArrowRight, Lock, Sparkles, Shield, BarChart3,
  Users2, Settings, Bot, FileText, Loader2,
} from "lucide-react";

// Find FeelinHealthy agency ID
const FEELINHEALTHY_SLUG = "feelinhealthy";

export default function FeelinHealthyAdminDemo() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      // If logged in, try to redirect to FeelinHealthy workspace
      const agencyId = profile.agencyId;
      if (isSuperAdmin(profile.role)) {
        // SuperAdmin → go to agencies list (they can pick FeelinHealthy)
        setRedirecting(true);
        router.push("/agency/agencies");
      } else if (agencyId) {
        // Agency user → go to their workspace
        setRedirecting(true);
        router.push(`/agency/agencies/${agencyId}`);
      }
    }
  }, [user, profile, loading, router]);

  if (loading || redirecting) {
    return (
      <div style={{
        height: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        background: "#0F172A", color: "#fff", fontFamily: "'Inter', sans-serif",
      }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <p style={{ fontSize: 14, color: "#94A3B8" }}>
          {redirecting ? "Agency Workspace'e yönlendiriliyor..." : "Kontrol ediliyor..."}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Not logged in → show demo landing
  const C = {
    navy: "#0F172A", navyLight: "#1E293B", teal: "#10b981",
    border: "rgba(255,255,255,0.08)", textMuted: "#94A3B8",
  };

  const features = [
    { icon: <BarChart3 size={22} />, title: "Dashboard & Analytics", desc: "Lead metrics, conversion rates, clinic performance" },
    { icon: <Users2 size={22} />, title: "Lead Management", desc: "AI-generated leads with conversation summaries" },
    { icon: <Building2 size={22} />, title: "Clinic Network", desc: "Manage 60+ partner clinics and pricing" },
    { icon: <Bot size={22} />, title: "AI Configuration", desc: "Intake flows, matching rules, widget settings" },
    { icon: <FileText size={22} />, title: "Quote Management", desc: "Multi-clinic quote requests and offers" },
    { icon: <Settings size={22} />, title: "Agency Settings", desc: "Branding, languages, treatment categories" },
  ];

  return (
    <div style={{
      minHeight: "100dvh", background: `linear-gradient(180deg, ${C.navy} 0%, #0B1120 100%)`,
      fontFamily: "'Inter', -apple-system, sans-serif", color: "#fff",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.6s ease-out forwards; }
        .feature-card { transition: all 0.3s; border: 1px solid rgba(255,255,255,0.06); }
        .feature-card:hover { border-color: rgba(16, 185, 129, 0.3); transform: translateY(-2px); }
      `}</style>

      {/* Demo Banner */}
      <div style={{ background: "rgba(16, 185, 129, 0.1)", borderBottom: "1px solid rgba(16, 185, 129, 0.2)", padding: "10px 20px", textAlign: "center", fontSize: 13, color: "#10b981", fontWeight: 600 }}>
        🔧 ClinicBridge AI — Agency Admin Demo
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px" }}>
        {/* Header */}
        <div className="fade-up" style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 24, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 24 }}>
            <Shield size={14} color="#10b981" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>Agency Workspace Demo</span>
          </div>

          <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 16 }}>
            FeelinHealthy<br />
            <span style={{ background: "linear-gradient(135deg, #10b981, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Agency Workspace
            </span>
          </h1>
          <p style={{ fontSize: 16, color: C.textMuted, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 36px" }}>
            ClinicBridge AI Agency Workspace — sağlık turizmi acentanızın tüm operasyonlarını tek panelden yönetin.
          </p>

          <button
            onClick={() => router.push("/login")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 32px", borderRadius: 12,
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 15, fontWeight: 700,
              border: "none", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s",
            }}
          >
            <Lock size={16} /> Giriş Yap — Workspace'e Eriş
          </button>
          <p style={{ fontSize: 12, color: C.textMuted, marginTop: 12 }}>
            Demo erişimi için admin hesabınızla giriş yapın
          </p>
        </div>

        {/* Features Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} className="feature-card fade-up" style={{
              padding: 24, borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              animationDelay: `${i * 0.1}s`,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(16, 185, 129, 0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#10b981", marginBottom: 16,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Workspace Preview */}
        <div className="fade-up" style={{
          marginTop: 48, padding: 32, borderRadius: 20,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
        }}>
          <Sparkles size={24} color="#10b981" style={{ marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Workspace URL'leri</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <code style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, background: "rgba(16, 185, 129, 0.08)", color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
              app.clinicbridge-ai.com/demo/feelinhealthy
            </code>
            <span style={{ fontSize: 12, color: C.textMuted }}>Public hasta deneyimi demosu</span>
            <code style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, background: "rgba(16, 185, 129, 0.08)", color: "#10b981", fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>
              app.clinicbridge-ai.com/demo/feelinhealthy-admin
            </code>
            <span style={{ fontSize: 12, color: C.textMuted }}>Agency admin workspace demosu</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 64, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          <p>© 2026 ClinicBridge AI — All rights reserved</p>
        </div>
      </div>
    </div>
  );
}
