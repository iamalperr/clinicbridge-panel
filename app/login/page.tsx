"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/clinics");
    } catch {
      setError("Login failed. Please check your credentials and try again.");
    } finally {
      setLoading(false);
    }
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
            <img src="/logo-dark.svg" alt="ClinicBridge" style={{ height: 42 }} className="hidden dark:block" />
            <img src="/logo.svg" alt="ClinicBridge" style={{ height: 42 }} className="block dark:hidden" />
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
            <Input 
              type="password" 
              label="Password"
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />

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
        <p style={{ 
          textAlign: "center", 
          fontSize: 12.5, 
          color: UI_COLORS.textMuted, 
          marginTop: 32,
          fontWeight: 500
        }}>
          © 2026 ClinicBridge — Powerful AI for Modern Clinics
        </p>
      </div>
    </main>
  );
}