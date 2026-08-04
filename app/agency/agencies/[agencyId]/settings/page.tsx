"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { subscribeToAgency, updateAgency } from "@/lib/services/agencyService";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Save, Loader2, CheckCircle2, Mail, AlertTriangle, Send } from "lucide-react";
import type { Agency, TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";
import { useI18n } from "@/lib/i18n-context";
import {
  normalizeQuoteNotificationSettings,
  validateQuoteNotificationSettingsInput,
} from "@/lib/services/agencyQuoteNotificationContent";

function emailsToTextarea(list: string[]): string {
  return (list || []).join("\n");
}

function parseEmailTextarea(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AgencySettingsPage() {
  const { getToken } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#10b981");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);

  // Quote notification settings (agency-level, not public)
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifRecipientsText, setNotifRecipientsText] = useState("");
  const [notifCcText, setNotifCcText] = useState("");
  const [notifReplyTo, setNotifReplyTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToAgency(agencyId, (a) => {
      setAgency(a);
      if (a) {
        setName(a.name);
        setDomain(a.domain);
        setPrimaryColor(a.branding?.primaryColor || "#10b981");
        setPrivacyUrl(a.privacyUrl || "");
        setLanguages(a.supportedLanguages || []);
        setCategories(a.treatmentCategories || []);
      }
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) return;
    const ref = doc(db, "agencies", agencyId, "config", "settings");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const fromConfig = data?.quoteNotificationSettings;
        const normalized = normalizeQuoteNotificationSettings(fromConfig || {});
        setNotifEnabled(normalized.enabled);
        setNotifRecipientsText(emailsToTextarea(normalized.recipients));
        setNotifCcText(emailsToTextarea(normalized.cc));
        setNotifReplyTo(normalized.replyTo || "");
      },
      (err) => {
        console.warn("[agency settings] quoteNotificationSettings listen failed:", err?.message || err);
      }
    );
    return unsub;
  }, [agencyId]);

  const notifValidation = useMemo(() => {
    return validateQuoteNotificationSettingsInput({
      enabled: notifEnabled,
      recipients: parseEmailTextarea(notifRecipientsText),
      cc: parseEmailTextarea(notifCcText),
      replyTo: notifReplyTo.trim() || undefined,
    });
  }, [notifEnabled, notifRecipientsText, notifCcText, notifReplyTo]);

  const handleSave = async (): Promise<boolean> => {
    if (!agencyId) return false;
    setSaving(true);
    setSaved(false);
    setTestResult(null);
    try {
      const { settings: quoteNotificationSettings, errors } = validateQuoteNotificationSettingsInput({
        enabled: notifEnabled,
        recipients: parseEmailTextarea(notifRecipientsText),
        cc: parseEmailTextarea(notifCcText),
        replyTo: notifReplyTo.trim() || undefined,
      });

      if (errors.length > 0) {
        setTestResult({
          ok: false,
          message:
            language === "tr"
              ? "Reply-To adresi geçersiz. Lütfen kontrol edin."
              : "Reply-To address is invalid. Please check and try again.",
        });
        setSaving(false);
        return false;
      }

      // Canonical private config doc (not exposed on public agency config API)
      await setDoc(
        doc(db, "agencies", agencyId, "config", "settings"),
        {
          quoteNotificationSettings,
          // Keep legacy mirrors in sync for older readers
          quoteNotificationEmails: quoteNotificationSettings.recipients,
          notificationEmail: quoteNotificationSettings.recipients[0] || null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateAgency(agencyId, {
        name,
        domain,
        branding: { primaryColor },
        privacyUrl,
        supportedLanguages: languages,
        treatmentCategories: categories,
        settings: {
          ...(agency?.settings || {}),
          quoteNotificationSettings,
          quoteNotificationEmails: quoteNotificationSettings.recipients,
          notificationEmail: quoteNotificationSettings.recipients[0],
        },
      });

      // Reflect normalized values in the form
      setNotifRecipientsText(emailsToTextarea(quoteNotificationSettings.recipients));
      setNotifCcText(emailsToTextarea(quoteNotificationSettings.cc));
      setNotifReplyTo(quoteNotificationSettings.replyTo || "");

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setSaving(false);
      return true;
    } catch (err) {
      console.error("Save failed:", err);
      setSaving(false);
      return false;
    }
  };

  const handleSendTestEmail = async () => {
    if (!agencyId) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const savedOk = await handleSave();
      if (!savedOk) {
        setTestSending(false);
        return;
      }
      const token = await getToken();
      if (!token) {
        setTestResult({
          ok: false,
          message: language === "tr" ? "Oturum bulunamadı." : "Authentication required.",
        });
        return;
      }
      const res = await fetch(`/api/agency/${agencyId}/notifications/quote/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setTestResult({
          ok: false,
          message:
            data.message ||
            data.error ||
            (language === "tr" ? "Test e-postası gönderilemedi." : "Failed to send test email."),
        });
      } else {
        setTestResult({
          ok: true,
          message:
            language === "tr"
              ? `Test e-postası gönderildi (${data.recipientCount || 0} alıcı).`
              : `Test email sent (${data.recipientCount || 0} recipient(s)).`,
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: language === "tr" ? "Test e-postası gönderilemedi." : "Failed to send test email.",
      });
    } finally {
      setTestSending(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleCategory = (cat: TreatmentCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const LANG_OPTIONS = [
    { code: "en", label: "English" },
    { code: "tr", label: "Türkçe" },
    { code: "de", label: "Deutsch" },
    { code: "ar", label: "العربية" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "ru", label: "Русский" },
  ];

  const showEnabledWithoutRecipients =
    notifValidation.warnings.includes("ENABLED_WITHOUT_RECIPIENTS");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("portal.settings.title")}</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {t("portal.settings.subtitle")}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "#10b981", borderColor: "#10b981" }}
        >
          {saved ? <><CheckCircle2 size={14} /> {t("portal.settings.saved")}</> : saving ? t("portal.settings.saving") : <><Save size={14} /> {t("portal.settings.saveChanges")}</>}
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* General */}
        <SectionCard title={t("portal.settings.generalInfo")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label={t("portal.settings.agencyName")} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={t("portal.settings.domain")} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("portal.settings.domainPlaceholder")} />
          </div>
        </SectionCard>

        {/* Branding */}
        <SectionCard title={t("portal.settings.branding")}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>
                {t("portal.settings.primaryColor")}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 40, height: 40, borderRadius: 8, border: "none", cursor: "pointer" }}
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 120 }}
                />
              </div>
            </div>
            <div
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                background: primaryColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {t("portal.settings.preview")}
            </div>
          </div>
        </SectionCard>

        {/* Privacy */}
        <SectionCard title={t("portal.settings.privacy")}>
          <Input
            label={t("portal.settings.privacyUrl")}
            value={privacyUrl}
            onChange={(e) => setPrivacyUrl(e.target.value)}
            placeholder={t("portal.settings.privacyUrlPlaceholder")}
          />
          <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 6 }}>
            {t("portal.settings.privacyUrlDesc")}
          </p>
        </SectionCard>

        {/* Quote request notifications */}
        <SectionCard
          title={
            language === "tr" ? "Teklif Talebi Bildirimleri" : "Quote Request Notifications"
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted }}>
              {language === "tr"
                ? "Yeni teklif talebi oluşturulduğunda hangi e-posta adreslerine bildirim gideceğini buradan yönetin. Bu ayarlar her ajansa özeldir ve genel API üzerinden paylaşılmaz."
                : "Configure who receives email when a quote request is created. Settings are per-agency and are not exposed on public APIs."}
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={notifEnabled}
                onChange={(e) => setNotifEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#10b981" }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                {language === "tr" ? "Bildirimleri etkinleştir" : "Enable notifications"}
              </span>
            </label>

            {showEnabledWithoutRecipients && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  color: "#b45309",
                  fontSize: 13,
                }}
              >
                <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                  {language === "tr"
                    ? "Bildirimler açık ancak geçerli bir alıcı yok. En az bir e-posta adresi ekleyin."
                    : "Notifications are enabled but no valid recipient is configured. Add at least one email."}
                </span>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>
                {language === "tr" ? "Alıcı e-posta adresleri" : "Recipient emails"}
              </label>
              <textarea
                value={notifRecipientsText}
                onChange={(e) => setNotifRecipientsText(e.target.value)}
                rows={3}
                placeholder={language === "tr" ? "ornek@ajans.com\nikinci@ajans.com" : "ops@agency.com\nsecond@agency.com"}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: `1px solid ${UI_COLORS.border}`,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 4 }}>
                {language === "tr"
                  ? "Her satıra bir adres yazın. Geçersiz veya boş kayıtlar kaydedilirken temizlenir."
                  : "One email per line. Invalid or empty entries are removed on save."}
              </p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>
                {language === "tr" ? "CC e-posta adresleri" : "CC emails"}
              </label>
              <textarea
                value={notifCcText}
                onChange={(e) => setNotifCcText(e.target.value)}
                rows={2}
                placeholder={language === "tr" ? "opsiyonel@ajans.com" : "optional@agency.com"}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: `1px solid ${UI_COLORS.border}`,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>

            <Input
              label={language === "tr" ? "Reply-To adresi" : "Reply-To address"}
              value={notifReplyTo}
              onChange={(e) => setNotifReplyTo(e.target.value)}
              placeholder="reply@agency.com"
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testSending || saving}
                style={{ background: "#0f766e", borderColor: "#0f766e" }}
              >
                {testSending ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {language === "tr" ? "Gönderiliyor..." : "Sending..."}</>
                ) : (
                  <><Send size={14} /> {language === "tr" ? "Test e-postası gönder" : "Send test email"}</>
                )}
              </Button>
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Mail size={12} />
                {language === "tr"
                  ? "Kayıtlı ayarlarla test mesajı gönderir; teklif talebi oluşturmaz."
                  : "Uses saved settings. Does not create a quote request."}
              </span>
            </div>

            {testResult && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: testResult.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.08)",
                  border: `1px solid ${testResult.ok ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.3)"}`,
                  color: testResult.ok ? "#047857" : "#b91c1c",
                }}
              >
                {testResult.message}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Languages */}
        <SectionCard title={t("portal.settings.supportedLanguages")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LANG_OPTIONS.map((lang) => {
              const selected = languages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => toggleLanguage(lang.code)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
                    background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: selected ? "#10b981" : UI_COLORS.textSecondary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Treatment Categories */}
        <SectionCard title={t("portal.settings.treatmentCategories")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            {t("portal.settings.treatmentCategoriesDesc")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => {
              const selected = categories.includes(key as TreatmentCategory);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCategory(key as TreatmentCategory)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
                    background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: selected ? "#10b981" : UI_COLORS.textSecondary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {language === "tr" ? val.tr : val.en}
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
