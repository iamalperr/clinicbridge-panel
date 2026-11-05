"use client";

import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";

function SignupForm() {
  const { t, language, setLanguage } = useI18n();
  const router = useRouter();
  const previewId = useSearchParams().get("preview");
  const [name, setName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedDistanceSales, setAcceptedDistanceSales] = useState(false);
  const [acceptedKvkk, setAcceptedKvkk] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [clinicId, setClinicId] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!previewId) return;
    let cancelled = false;
    fetch(`/api/public/preview/${encodeURIComponent(previewId)}`)
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.clinicName) {
          setClinicName((current) => current || data.clinicName);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/public/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          clinicName,
          email,
          password,
          phone,
          acceptedTerms,
          acceptedDistanceSales,
          acceptedKvkk,
          previewId,
          language: language === "en" ? "en" : "tr",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = payload.error;
        setError(code === "email_taken" ? t("signup.emailTaken") : code === "rate_limited" ? t("signup.limited") : code === "invalid" || code === "consent_required" ? t("signup.invalid") : t("signup.failed"));
        return;
      }
      setPassword("");
      setEmailSent(payload.emailSent === true);
      setClinicId(typeof payload.clinicId === "string" ? payload.clinicId : "");
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password).catch(() => undefined);
    } catch {
      setError(t("signup.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-app)", padding: "32px 24px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Logo size="lg" />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setLanguage("tr")} style={langButton(language === "tr")}>TR</button>
            <button type="button" onClick={() => setLanguage("en")} style={langButton(language === "en")}>EN</button>
          </div>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px", marginBottom: 8 }}>{t("signup.title")}</h1>
        <p style={{ color: UI_COLORS.textSecondary, marginBottom: 24 }}>{t("signup.subtitle")}</p>
        <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, padding: 32 }}>
          {clinicId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ color: UI_COLORS.textPrimary, fontWeight: 600 }}>{emailSent ? t("signup.success") : t("signup.successNoEmail")}</p>
              <Button type="button" fullWidth onClick={() => router.replace(`/clinics/${clinicId}`)}>{t("signup.continue")}</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label={t("signup.name")} value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
              <Input label={t("signup.clinicName")} value={clinicName} onChange={(event) => setClinicName(event.target.value)} required />
              <Input label={t("signup.email")} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
              <Input label={t("signup.password")} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
              <Input label={t("signup.phone")} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" />
              <Consent checked={acceptedTerms} onChange={setAcceptedTerms} href="/terms" label={t("signup.terms")} />
              <Consent checked={acceptedDistanceSales} onChange={setAcceptedDistanceSales} href="/mesafeli-satis-sozlesmesi" label={t("signup.distance")} />
              <Consent checked={acceptedKvkk} onChange={setAcceptedKvkk} href="/kvkk" label={t("signup.kvkk")} />
              {error ? <p style={{ color: UI_COLORS.danger, fontSize: 13.5, margin: 0 }}>{error}</p> : null}
              <Button type="submit" fullWidth disabled={loading}>{loading ? t("signup.submitting") : t("signup.submit")}</Button>
            </form>
          )}
        </div>
        <p style={{ marginTop: 16, color: UI_COLORS.textSecondary, fontSize: 14 }}>
          {t("signup.haveAccount")} <Link href="/login" style={{ color: UI_COLORS.brand, fontWeight: 600 }}>{t("signup.signIn")}</Link>
        </p>
      </div>
    </main>
  );
}

function Consent({ checked, onChange, href, label }: { checked: boolean; onChange: (value: boolean) => void; href: string; label: string }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", color: UI_COLORS.textPrimary, fontSize: 14 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} required style={{ marginTop: 3 }} />
      <span>
        <Link href={href} target="_blank" style={{ color: UI_COLORS.brand, fontWeight: 600 }}>{label}</Link>
      </span>
    </label>
  );
}

function langButton(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? UI_COLORS.brand : UI_COLORS.border}`,
    background: "transparent",
    color: UI_COLORS.textPrimary,
    borderRadius: 8,
    padding: "6px 10px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
