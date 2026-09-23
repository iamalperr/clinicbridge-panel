"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Input } from "@/components/ui/Input";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";
import Modal from "@/components/ui/Modal";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot Password States
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const cleanEmail = email.trim();
    
    try {
      console.log(`[Auth] Attempting login for email: ${cleanEmail}`);
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      console.log(`[Auth] Firebase response success. UID:`, userCredential.user.uid);
      // Let AuthGuard handle the role-based redirect
      router.replace("/");
    } catch (err: any) {
      console.error(`[Auth] Firebase login error for ${cleanEmail}:`, err.code, err.message);
      
      const errorCode = err.code;
      if (errorCode === "auth/invalid-credential" || errorCode === "auth/wrong-password") {
        setError("Hatalı e-posta veya şifre girdiniz.");
      } else if (errorCode === "auth/user-not-found") {
        setError("Bu e-posta adresiyle kayıtlı bir kullanıcı bulunamadı.");
      } else if (errorCode === "auth/invalid-email") {
        setError("Geçersiz bir e-posta adresi girdiniz.");
      } else if (errorCode === "auth/too-many-requests") {
        setError("Çok fazla başarısız deneme yapıldı. Lütfen daha sonra tekrar deneyin veya şifrenizi sıfırlayın.");
      } else {
        setError(err.message || "Giriş yapılamadı. Lütfen bilgilerinizi kontrol edip tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || forgotLoading) return;

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setForgotError(
          data.error || "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin."
        );
        return;
      }

      if (res.status === 400) {
        setForgotError(data.error || "Geçerli bir e-posta adresi giriniz.");
        return;
      }

      // Success and non-rate-limit failures use the same generic success UX
      // so account existence / provider issues are not distinguishable.
      if (res.ok && data.success) {
        setForgotSuccess(true);
        return;
      }

      // Unexpected non-OK without enumeration-safe body — still show generic success
      // for 5xx-style responses that might leak existence in older deployments.
      if (res.ok) {
        setForgotSuccess(true);
        return;
      }

      setForgotSuccess(true);
    } catch {
      // Network errors: do not claim delivery; show soft retry without leaking state
      setForgotError("İstek tamamlanamadı. Lütfen bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgotModal = () => {
    setForgotEmail(email); // Pre-fill if they typed it
    setForgotError(null);
    setForgotSuccess(false);
    setIsForgotModalOpen(true);
  };

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
            Welcome Back
          </h1>
          <p style={{ 
            color: UI_COLORS.textSecondary, 
            marginTop: 8, 
            fontSize: 15,
            fontWeight: 500
          }}>
            Sign in to your ClinicBridge account
          </p>
        </div>

        {/* Login Card */}
        <div style={{ 
          background: UI_COLORS.bgCard, 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: 20, 
          padding: "32px",
          boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)"
        }}>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input 
              type="email" 
              label="Email address"
              placeholder="you@clinic.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
            <div>
              <Input 
                type="password" 
                label="Password"
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button 
                  type="button" 
                  onClick={openForgotModal}
                  style={{ 
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: UI_COLORS.brand, fontSize: 13, fontWeight: 600,
                  }}
                >
                  Şifremi Unuttum
                </button>
              </div>
            </div>

            {error && (
              <div style={{ 
                background: "rgba(239, 68, 68, 0.08)", 
                border: "1px solid rgba(239, 68, 68, 0.2)", 
                borderRadius: 12, 
                padding: "12px 16px", 
                fontSize: 13.5, 
                color: UI_COLORS.danger,
                fontWeight: 500
              }}>
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              fullWidth 
              variant="primary"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? "Signing in…" : "Sign in to Dashboard"}
            </Button>
          </form>

          <p style={{ 
            textAlign: "center", 
            fontSize: 13, 
            color: UI_COLORS.textMuted, 
            marginTop: 24,
            fontWeight: 400
          }}>
            Trouble signing in? Contact your administrator.
          </p>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: "center", marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, fontWeight: 500 }}>
            © 2026 ClinicBridge — Powerful AI for Modern Clinics
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Link href="/privacy" style={{ fontSize: 12, color: UI_COLORS.textMuted, textDecoration: "none" }}>Gizlilik Politikası</Link>
            <Link href="/kvkk" style={{ fontSize: 12, color: UI_COLORS.textMuted, textDecoration: "none" }}>KVKK</Link>
            <Link href="/terms" style={{ fontSize: 12, color: UI_COLORS.textMuted, textDecoration: "none" }}>Kullanım Şartları</Link>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal 
        isOpen={isForgotModalOpen} 
        onClose={() => !forgotLoading && setIsForgotModalOpen(false)} 
        title="Şifremi Unuttum" 
        width={400}
      >
        <div style={{ padding: "10px 0" }}>
          {forgotSuccess ? (
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div style={{ 
                width: 56, height: 56, borderRadius: "50%", 
                background: "rgba(16, 185, 129, 0.1)", color: "#10b981",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px"
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h3 style={{ color: UI_COLORS.textPrimary, marginBottom: 8, fontSize: 18 }}>Talebiniz Alındı</h3>
              <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
                Eğer bu e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı gönderilecektir.
                Gelen kutunuzu ve spam klasörünü kontrol edin.
              </p>
              <Button 
                onClick={() => setIsForgotModalOpen(false)} 
                fullWidth 
                style={{ marginTop: 24 }}
              >
                Giriş Ekranına Dön
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, lineHeight: 1.5, marginBottom: 8, marginTop: -4 }}>
                E-posta adresinizi girin. Eğer hesap sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı gönderilecektir.
              </p>
              
              <Input 
                type="email" 
                label="E-posta Adresi"
                placeholder="ornek@klinik.com" 
                value={forgotEmail} 
                onChange={e => setForgotEmail(e.target.value)} 
                required 
                disabled={forgotLoading}
              />

              {forgotError && (
                <div style={{ 
                  background: "rgba(239, 68, 68, 0.08)", 
                  border: `1px solid ${UI_COLORS.danger}20`, 
                  borderRadius: 8, 
                  padding: "10px 12px", 
                  fontSize: 13, 
                  color: UI_COLORS.danger,
                  fontWeight: 500
                }}>
                  {forgotError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsForgotModalOpen(false)} 
                  disabled={forgotLoading}
                >
                  İptal
                </Button>
                <Button 
                  type="submit" 
                  disabled={forgotLoading || !forgotEmail}
                >
                  {forgotLoading ? "Gönderiliyor..." : "Sıfırlama Linki Gönder"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </main>
  );
}