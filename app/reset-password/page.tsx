"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";
import Link from "next/link";
import { Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react";
import { verifyPasswordResetCode, confirmPasswordReset, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || searchParams.get("oobCode");

  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function verifyCode() {
      if (!token) {
        // Allow authenticated users to reset their password without a token
        if (auth.currentUser) {
          setEmail(auth.currentUser.email);
          setVerifying(false);
          return;
        }
        setError("Şifre sıfırlama bağlantısı eksik veya geçersiz.");
        setVerifying(false);
        return;
      }

      try {
        if (searchParams.has("oobCode")) {
          const email = await verifyPasswordResetCode(auth, token as string);
          setEmail(email);
        } else {
          const res = await fetch("/api/auth/verify-reset-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "Bağlantı geçersiz veya süresi dolmuş.");
          }

          setEmail(data.email);
        }
      } catch (err: any) {
        console.error("Token verification failed:", err);
        setError(err.message || "Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı isteyin.");
      } finally {
        setVerifying(false);
      }
    }

    // Give auth state a moment to initialize before checking currentUser
    const unsubscribe = auth.onAuthStateChanged(() => {
      verifyCode();
      unsubscribe();
    });
  }, [token, searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token && !auth.currentUser) return;

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[Auth] Starting password reset process...");

      if (auth.currentUser && !token) {
        console.log("[Auth] User is authenticated. Using updatePassword flow.");
        await updatePassword(auth.currentUser, password);
      } else if (searchParams.has("oobCode")) {
        console.log("[Auth] Using Firebase confirmPasswordReset flow.");
        await confirmPasswordReset(auth, token as string, password);
      } else {
        console.log("[Auth] Using custom API reset flow.");
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword: password })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Şifre sıfırlanırken bir hata oluştu.");
        }
      }

      console.log("[Auth] Password reset successful. Firebase Auth updated.");
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch (err: any) {
      console.error("[Auth] Password reset failed:", err);
      setError(err.message || "Şifre sıfırlanırken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <div style={{ display: "inline-block", width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
        <p style={{ color: UI_COLORS.textMuted, fontSize: 15 }}>Bağlantı doğrulanıyor...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ 
          width: 56, height: 56, borderRadius: "50%", 
          background: "rgba(239, 68, 68, 0.1)", color: UI_COLORS.danger,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px"
        }}>
          <ShieldAlert size={28} />
        </div>
        <h3 style={{ color: UI_COLORS.textPrimary, marginBottom: 8, fontSize: 18 }}>Geçersiz Bağlantı</h3>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          {error}
        </p>
        <Link href="/login" style={{ textDecoration: "none" }}>
          <Button fullWidth>Giriş Ekranına Dön</Button>
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ 
          width: 56, height: 56, borderRadius: "50%", 
          background: "rgba(16, 185, 129, 0.1)", color: "#10b981",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px"
        }}>
          <CheckCircle2 size={28} />
        </div>
        <h3 style={{ color: UI_COLORS.textPrimary, marginBottom: 8, fontSize: 18 }}>Şifre Sıfırlandı</h3>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Şifreniz başarıyla güncellendi. Giriş ekranına yönlendiriliyorsunuz...
        </p>
        <Link href="/login" style={{ textDecoration: "none" }}>
          <Button fullWidth variant="ghost">Hemen Giriş Yap</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginBottom: 8 }}>
        <strong>{email}</strong> hesabı için yeni bir şifre belirleyin.
      </p>

      <div style={{ position: "relative" }}>
        <Input 
          type={showPassword ? "text" : "password"} 
          label="Yeni Şifre"
          placeholder="••••••••" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
          required 
          disabled={loading}
        />
        <button 
          type="button" 
          onClick={() => setShowPassword(!showPassword)}
          style={{ 
            position: "absolute", right: 12, top: 38, background: "none", border: "none", 
            color: UI_COLORS.textMuted, cursor: "pointer", padding: 4 
          }}
          tabIndex={-1}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <Input 
        type={showPassword ? "text" : "password"} 
        label="Yeni Şifre (Tekrar)"
        placeholder="••••••••" 
        value={confirmPassword} 
        onChange={e => setConfirmPassword(e.target.value)} 
        required 
        disabled={loading}
      />

      {error && (
        <div style={{ 
          background: "rgba(239, 68, 68, 0.08)", 
          border: `1px solid ${UI_COLORS.danger}20`, 
          borderRadius: 8, 
          padding: "10px 12px", 
          fontSize: 13, 
          color: UI_COLORS.danger,
          fontWeight: 500
        }}>
          {error}
        </div>
      )}

      <Button 
        type="submit" 
        fullWidth 
        disabled={loading || !password || !confirmPassword}
        style={{ marginTop: 8 }}
      >
        {loading ? "Sıfırlanıyor..." : "Şifreyi Güncelle"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main style={{ 
      minHeight: "100dvh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "var(--bg-app)", 
      padding: "0 24px" 
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        
        {/* Logo & Branding */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <Logo size="lg" />
          </div>
          <h1 style={{ 
            fontSize: 26, 
            fontWeight: 800, 
            color: UI_COLORS.textPrimary, 
            letterSpacing: "-0.8px" 
          }}>
            Şifre Sıfırlama
          </h1>
        </div>

        {/* Form Card */}
        <div style={{ 
          background: UI_COLORS.bgCard, 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: 20, 
          padding: "32px",
          boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)"
        }}>
          <Suspense fallback={
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <p style={{ color: UI_COLORS.textMuted, fontSize: 15 }}>Yükleniyor...</p>
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: "center", marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, fontWeight: 500 }}>
            © {new Date().getFullYear()} ClinicBridge — Powerful AI for Modern Clinics
          </p>
        </div>
      </div>
    </main>
  );
}
