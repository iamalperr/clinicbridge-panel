"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";

interface TreatmentRow { id?: string; name: string; priceRange: string }
interface FaqRow { id?: string; question: string; answer: string }

interface SetupPayload {
  clinicId: string;
  treatments: TreatmentRow[];
  hours: string;
  faq: FaqRow[];
  doNotSay: string;
  appointmentEmail: string;
  appointmentWhatsapp: string;
  widgetInstalledAt: string | null;
  installedDomain: string | null;
  embedCode: string;
}

export default function SetupPage() {
  const { t, language, setLanguage } = useI18n();
  const { loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
  const [hours, setHours] = useState("");
  const [faq, setFaq] = useState<FaqRow[]>([]);
  const [doNotSay, setDoNotSay] = useState("");
  const [appointmentEmail, setAppointmentEmail] = useState("");
  const [appointmentWhatsapp, setAppointmentWhatsapp] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [embedCode, setEmbedCode] = useState("");
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [installedDomain, setInstalledDomain] = useState<string | null>(null);
  const [tab, setTab] = useState<"code" | "wordpress" | "agency">("code");
  const [copied, setCopied] = useState(false);
  const [agencyEmail, setAgencyEmail] = useState("");
  const [agencyNote, setAgencyNote] = useState("");

  const load = useCallback(async (mode: "full" | "install") => {
    const token = await getToken();
    if (!token) return;
    const response = await fetch("/api/clinics/setup", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      setError("loadFailed");
      setReady(true);
      return;
    }
    const data = await response.json() as SetupPayload;
    setClinicId(data.clinicId);
    setEmbedCode(data.embedCode);
    setInstalledAt(data.widgetInstalledAt);
    setInstalledDomain(data.installedDomain);
    if (mode === "full") {
      setTreatments(data.treatments.length ? data.treatments : [{ name: "", priceRange: "" }]);
      setHours(data.hours);
      setFaq(data.faq);
      setDoNotSay(data.doNotSay);
      setAppointmentEmail(data.appointmentEmail);
      setAppointmentWhatsapp(data.appointmentWhatsapp);
    }
    setReady(true);
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) void load("full");
  }, [authLoading, load]);

  useEffect(() => {
    if (step !== 2) return;
    const timer = window.setInterval(() => void load("install"), 4000);
    return () => window.clearInterval(timer);
  }, [step, load]);

  async function save(complete = false) {
    const token = await getToken();
    if (!token) return false;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/clinics/setup", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ treatments, hours, faq, doNotSay, appointmentEmail, appointmentWhatsapp, complete }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error === "contact_required" ? "contactRequired" : "loadFailed");
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (step === 1) {
      const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointmentEmail.trim());
      const hasWhatsapp = appointmentWhatsapp.replace(/\D/g, "").length >= 8;
      if (!hasEmail && !hasWhatsapp) {
        setError("contactRequired");
        return;
      }
    }
    const ok = await save(false);
    if (ok) setStep((current) => Math.min(current + 1, 2));
  }

  async function finish() {
    const ok = await save(true);
    if (ok && clinicId) router.replace(`/clinics/${clinicId}`);
  }

  async function sendAgency() {
    const token = await getToken();
    if (!token) return;
    setAgencyNote("");
    const response = await fetch("/api/clinics/setup/agency-email", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: agencyEmail }),
    });
    const payload = await response.json().catch(() => ({}));
    setAgencyNote(payload.emailSent ? t("setup.agencySent") : t("setup.agencyFailed"));
  }

  if (!ready) {
    return <main style={shell}><p style={{ color: UI_COLORS.textSecondary }}>{t("setup.saving")}</p></main>;
  }

  return (
    <main style={shell}>
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Logo size="lg" />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setLanguage("tr")} style={langButton(language === "tr")}>TR</button>
            <button type="button" onClick={() => setLanguage("en")} style={langButton(language === "en")}>EN</button>
          </div>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px", marginBottom: 8 }}>{t("setup.title")}</h1>
        <p style={{ color: UI_COLORS.textSecondary, marginBottom: 20 }}>{t("setup.subtitle")}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, color: UI_COLORS.textSecondary, fontSize: 13, fontWeight: 700 }}>
          <span>{t("setup.stepFacts")}</span>
          <span>{t("setup.stepContact")}</span>
          <span>{t("setup.stepInstall")}</span>
        </div>
        <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
          {step === 0 ? (
            <>
              <Field label={t("setup.treatments")}>
                {treatments.map((item, index) => (
                  <div key={`treatment-${index}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 8 }}>
                    <Input aria-label={t("setup.treatmentName")} value={item.name} onChange={(event) => updateTreatment(index, "name", event.target.value)} placeholder={t("setup.treatmentName")} />
                    <Input aria-label={t("setup.priceRange")} value={item.priceRange} onChange={(event) => updateTreatment(index, "priceRange", event.target.value)} placeholder={t("setup.priceRange")} />
                    <button type="button" onClick={() => setTreatments(treatments.filter((_, itemIndex) => itemIndex !== index))} style={textButton}>{t("setup.remove")}</button>
                  </div>
                ))}
                <button type="button" onClick={() => setTreatments([...treatments, { name: "", priceRange: "" }])} style={textButton}>{t("setup.addTreatment")}</button>
              </Field>
              <label style={labelStyle}>{t("setup.hours")}<textarea value={hours} onChange={(event) => setHours(event.target.value)} style={area} /></label>
              <Field label={t("setup.faq")}>
                {faq.map((item, index) => (
                  <div key={`faq-${index}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input aria-label={t("setup.question")} value={item.question} onChange={(event) => updateFaq(index, "question", event.target.value)} placeholder={t("setup.question")} />
                    <textarea aria-label={t("setup.answer")} value={item.answer} onChange={(event) => updateFaq(index, "answer", event.target.value)} placeholder={t("setup.answer")} style={area} />
                  </div>
                ))}
                <button type="button" onClick={() => setFaq([...faq, { question: "", answer: "" }])} style={textButton}>{t("setup.addFaq")}</button>
              </Field>
              <label style={labelStyle}>{t("setup.doNotSay")}<span style={{ fontWeight: 400, color: UI_COLORS.textSecondary }}>{t("setup.doNotSayHint")}</span><textarea value={doNotSay} onChange={(event) => setDoNotSay(event.target.value)} style={area} /></label>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Input label={t("setup.appointmentEmail")} type="email" value={appointmentEmail} onChange={(event) => setAppointmentEmail(event.target.value)} />
              <Input label={t("setup.appointmentWhatsapp")} value={appointmentWhatsapp} onChange={(event) => setAppointmentWhatsapp(event.target.value)} />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                {(["code", "wordpress", "agency"] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setTab(item)} style={langButton(tab === item)}>{t(`setup.tab${item === "code" ? "Code" : item === "wordpress" ? "Wordpress" : "Agency"}`)}</button>
                ))}
              </div>
              {tab === "code" ? (
                <>
                  <pre style={codeBox}>{embedCode}</pre>
                  <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(embedCode).then(() => setCopied(true))}>{copied ? t("setup.copied") : t("setup.copy")}</Button>
                </>
              ) : null}
              {tab === "wordpress" ? <p style={{ color: UI_COLORS.textPrimary, lineHeight: 1.6, margin: 0 }}>{t("setup.wordpress")}</p> : null}
              {tab === "agency" ? (
                <>
                  <Input label={t("setup.agencyEmail")} type="email" value={agencyEmail} onChange={(event) => setAgencyEmail(event.target.value)} />
                  <Button type="button" variant="secondary" onClick={() => void sendAgency()}>{t("setup.agencySend")}</Button>
                  {agencyNote ? <p style={{ margin: 0, color: UI_COLORS.textSecondary }}>{agencyNote}</p> : null}
                </>
              ) : null}
              <p style={{ margin: 0, fontWeight: 700, color: UI_COLORS.brand }}>
                {installedAt ? `${t("setup.live")}${installedDomain ? ` · ${installedDomain}` : ""}` : t("setup.waiting")}
              </p>
            </>
          ) : null}
          {error ? <p style={{ color: UI_COLORS.danger, fontSize: 13.5, margin: 0 }}>{error === "contactRequired" ? t("setup.contactRequired") : t("setup.loadFailed")}</p> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {step > 0 ? <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>{t("setup.back")}</Button> : null}
            {step < 2 ? <Button type="button" onClick={() => void next()} disabled={saving}>{saving ? t("setup.saving") : t("setup.next")}</Button> : <Button type="button" onClick={() => void finish()} disabled={saving}>{saving ? t("setup.saving") : t("setup.finish")}</Button>}
          </div>
        </div>
      </div>
    </main>
  );

  function updateTreatment(index: number, key: "name" | "priceRange", value: string) {
    setTreatments(treatments.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function updateFaq(index: number, key: "question" | "answer", value: string) {
    setFaq(faq.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={labelStyle}>{label}</span>{children}</div>;
}

const shell: CSSProperties = { minHeight: "100dvh", display: "flex", justifyContent: "center", background: "var(--bg-app)", padding: "32px 24px" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary };
const area: CSSProperties = { minHeight: 84, padding: "10px 14px", borderRadius: 12, border: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.bgInput, color: UI_COLORS.textPrimary, font: "inherit" };
const textButton: CSSProperties = { border: 0, background: "transparent", color: UI_COLORS.brand, fontWeight: 700, cursor: "pointer", textAlign: "left" };
const codeBox: CSSProperties = { margin: 0, whiteSpace: "pre-wrap", background: UI_COLORS.bgInput, borderRadius: 12, padding: 14, color: UI_COLORS.textPrimary, fontSize: 13 };

function langButton(active: boolean): CSSProperties {
  return { border: `1px solid ${active ? UI_COLORS.brand : UI_COLORS.border}`, background: "transparent", color: UI_COLORS.textPrimary, borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer" };
}
