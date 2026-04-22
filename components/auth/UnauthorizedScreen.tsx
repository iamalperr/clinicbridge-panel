import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { ShieldAlert, LogOut, RefreshCw, Mail } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";

export default function UnauthorizedScreen() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t } = useI18n();

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simple window reload will trigger AuthGuard to re-fetch profile
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  return (
    <main style={{ 
      height: "100dvh", 
      width: "100%", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "var(--bg-app)",
      position: "relative",
      overflow: "hidden",
      padding: "24px"
    }}>
      {/* Premium Mesh Background Effect */}
      <div style={{
        position: "absolute",
        top: "-10%",
        right: "-10%",
        width: "60%",
        height: "60%",
        background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)",
        filter: "blur(80px)",
        zIndex: 0,
        pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute",
        bottom: "-10%",
        left: "-10%",
        width: "50%",
        height: "50%",
        background: "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
        filter: "blur(80px)",
        zIndex: 0,
        pointerEvents: "none"
      }} />

      <div style={{ width: "100%", maxWidth: 460, textAlign: "center", zIndex: 1, position: "relative" }}>
        
        {/* Logo */}
        <div style={{ 
          width: 56, 
          height: 56, 
          borderRadius: 16, 
          background: UI_COMMON_STYLES.brandGradient, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          fontSize: 24, 
          fontWeight: 800, 
          color: "white", 
          margin: "0 auto 32px",
          boxShadow: UI_COMMON_STYLES.logoShadow,
          transform: "rotate(-2deg)"
        }}>
          CB
        </div>

        {/* Glassmorphic Card */}
        <div style={{ 
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid rgba(255, 255, 255, 0.08)`, 
          borderRadius: 28, 
          padding: "48px 40px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* Subtle Inner Glow */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)"
          }} />

          <div style={{ 
            width: 52, 
            height: 52, 
            borderRadius: 16, 
            background: "rgba(239, 68, 68, 0.12)", 
            color: UI_COLORS.danger, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            margin: "0 auto 24px" 
          }}>
            <ShieldAlert size={28} />
          </div>

          <h1 style={{ 
            fontSize: 24, 
            fontWeight: 800, 
            color: UI_COLORS.textPrimary, 
            letterSpacing: "-0.6px",
            marginBottom: 12
          }}>
            {t("auth.pendingTitle")}
          </h1>
          
          <p style={{ 
            fontSize: 15.5, 
            lineHeight: 1.6, 
            color: UI_COLORS.textSecondary,
            fontWeight: 500,
            marginBottom: 40
          }}>
            {t("auth.pendingMessage")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Button 
              fullWidth 
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{ 
                height: 48,
                fontSize: 14.5,
                fontWeight: 700,
                display: "flex", 
                gap: 10, 
                alignItems: "center",
                justifyContent: "center",
                background: UI_COMMON_STYLES.brandGradient,
                boxShadow: "0 10px 20px -5px rgba(99, 102, 241, 0.3)"
              }}
            >
              <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? t("common.loading") : t("nav.clinics") /* Using generic check logic */}
            </Button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Button 
                variant="ghost" 
                fullWidth 
                onClick={() => window.open("mailto:admin@clinicbridge.com?subject=ClinicBridge Account Activation Request", "_blank")}
                style={{ 
                  height: 44,
                  fontSize: 13.5,
                  display: "flex", 
                  gap: 8, 
                  alignItems: "center" 
                }}
              >
                <Mail size={16} />
                {t("header.help")}
              </Button>
              <Button 
                variant="ghost" 
                fullWidth 
                onClick={() => signOut(auth)}
                style={{ 
                  height: 44,
                  fontSize: 13.5,
                  display: "flex", 
                  gap: 8, 
                  alignItems: "center",
                  color: UI_COLORS.textMuted
                }}
              >
                <LogOut size={16} />
                {t("common.signOut")}
              </Button>
            </div>
          </div>
        </div>

        <div style={{ 
          marginTop: 40, 
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 12.5, 
          color: UI_COLORS.textMuted,
          fontWeight: 600,
          letterSpacing: "0.02em"
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: UI_COLORS.brand, opacity: 0.5 }} />
          CLINICBRIDGE SECURITY PROTOCOL
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </main>
  );
}
