"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Bot, Save, Loader2, CheckCircle2, AlertCircle, Plus, X, GripVertical, MessageSquare,
} from "lucide-react";
import type { TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";
import type { IntakeQuestion, IntakeQuestionType, LocalizedString } from "@/lib/types/matching";
import { resolveLocalized } from "@/lib/types/matching";
import { useI18n } from "@/lib/i18n-context";

interface IntakeFlowConfig {
  assistantName: string;
  welcomeMessage: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  toneOfVoice: string;
  emergencyDisclaimer: string;
  fallbackMessage: string;
  consentUrl: string;
  categoryFlows: Record<string, IntakeQuestion[]>;
}

const DEFAULT_CONFIG: IntakeFlowConfig = {
  assistantName: "FeelinHealthy AI Care Assistant",
  welcomeMessage: "Hello! I can help you find the right clinic for your treatment. Tell me what treatment you are looking for, and I will match you with suitable clinics.",
  defaultLanguage: "en",
  supportedLanguages: ["en", "tr", "de", "fr"],
  toneOfVoice: "professional",
  emergencyDisclaimer: "This service does not replace medical advice. In case of emergency, contact local emergency services.",
  fallbackMessage: "I'd be happy to connect you with a human specialist. Let me transfer you.",
  consentUrl: "",
  categoryFlows: {},
};

// ─── Bilingual default flows ────────────────────────────────────────────────

const DEFAULT_DENTAL_FLOW: IntakeQuestion[] = [
  { id: "d1", questionText: { tr: "Hangi diş tedavisiyle ilgileniyorsunuz?", en: "What dental treatment are you interested in?" }, questionType: "select", options: [
    { label: { tr: "Dental İmplant", en: "Dental Implant" }, value: "dental_implant" },
    { label: { tr: "Zirkonyum Taç", en: "Zirconium Crowns" }, value: "zirconium_crowns" },
    { label: { tr: "Hollywood Gülümsemesi", en: "Hollywood Smile" }, value: "hollywood_smile" },
    { label: { tr: "Kanal Tedavisi", en: "Root Canal" }, value: "root_canal" },
    { label: { tr: "Diş Beyazlatma", en: "Teeth Whitening" }, value: "teeth_whitening" },
    { label: { tr: "Diğer", en: "Other" }, value: "other" },
  ], required: true, order: 1, saveAsField: "subTreatment" },
  { id: "d2", questionText: { tr: "Güncel bir diş röntgeniniz veya panoramik filminiz var mı?", en: "Do you have a recent dental X-ray?" }, questionType: "select", options: [
    { label: { tr: "Evet, var", en: "Yes, I have" }, value: "yes" },
    { label: { tr: "Hayır, yok", en: "No, I don't" }, value: "no" },
    { label: { tr: "Emin değilim", en: "Not sure" }, value: "unsure" },
  ], required: false, order: 2, saveAsField: "hasXray" },
  { id: "d3", questionText: { tr: "Kaç dişiniz için tedavi düşünüyorsunuz?", en: "How many teeth are affected?" }, questionType: "text", required: false, order: 3, saveAsField: "affectedTeeth" },
  { id: "d4", questionText: { tr: "Hangi ülkeden başvuru yapıyorsunuz?", en: "Which country are you traveling from?" }, questionType: "text", required: true, order: 4, saveAsField: "country" },
  { id: "d5", questionText: { tr: "Ne zaman seyahat etmeyi planlıyorsunuz?", en: "When are you planning to travel?" }, questionType: "date", required: false, order: 5, saveAsField: "travelDate" },
  { id: "d6", questionText: { tr: "Birden fazla kliniği karşılaştırmak ister misiniz?", en: "Would you like to compare multiple clinics?" }, questionType: "select", options: [
    { label: { tr: "Evet, birkaç kliniği karşılaştırmak istiyorum", en: "Yes, I want to compare multiple clinics" }, value: "yes" },
    { label: { tr: "Hayır, en uygun kliniği önerin", en: "No, recommend the most suitable clinic" }, value: "no" },
    { label: { tr: "Emin değilim", en: "Not sure" }, value: "unsure" },
  ], required: false, order: 6, saveAsField: "compareMode" },
];

const DEFAULT_HAIR_FLOW: IntakeQuestion[] = [
  { id: "h1", questionText: { tr: "Hangi saç ekimi tekniğiyle ilgileniyorsunuz?", en: "Which hair transplant technique are you interested in?" }, questionType: "select", options: [
    { label: { tr: "FUE Saç Ekimi", en: "FUE Hair Transplant" }, value: "fue" },
    { label: { tr: "DHI Saç Ekimi", en: "DHI Hair Transplant" }, value: "dhi" },
    { label: { tr: "Sakal Ekimi", en: "Beard Transplant" }, value: "beard" },
    { label: { tr: "Kaş Ekimi", en: "Eyebrow Transplant" }, value: "eyebrow" },
    { label: { tr: "Emin değilim", en: "Not sure" }, value: "unsure" },
  ], required: true, order: 1, saveAsField: "subTreatment" },
  { id: "h2", questionText: { tr: "Daha önce saç ekimi yaptırdınız mı?", en: "Have you had a previous hair transplant?" }, questionType: "select", options: [
    { label: { tr: "Evet", en: "Yes" }, value: "yes" }, { label: { tr: "Hayır", en: "No" }, value: "no" },
  ], required: false, order: 2, saveAsField: "previousTransplant" },
  { id: "h3", questionText: { tr: "Saçınızın güncel fotoğrafları var mı?", en: "Do you have recent photos of your hair?" }, questionType: "select", options: [
    { label: { tr: "Evet", en: "Yes" }, value: "yes" }, { label: { tr: "Hayır", en: "No" }, value: "no" },
  ], required: false, order: 3, saveAsField: "hasPhotos" },
  { id: "h4", questionText: { tr: "Hangi ülkeden başvuru yapıyorsunuz?", en: "Which country are you traveling from?" }, questionType: "text", required: true, order: 4, saveAsField: "country" },
  { id: "h5", questionText: { tr: "Ne zaman seyahat etmeyi planlıyorsunuz?", en: "Preferred travel date?" }, questionType: "date", required: false, order: 5, saveAsField: "travelDate" },
];

const DEFAULT_AESTHETIC_FLOW: IntakeQuestion[] = [
  { id: "a1", questionText: { tr: "Hangi estetik işlemle ilgileniyorsunuz?", en: "What aesthetic procedure are you interested in?" }, questionType: "select", options: [
    { label: { tr: "Burun Estetiği", en: "Rhinoplasty" }, value: "rhinoplasty" },
    { label: { tr: "Meme Büyütme", en: "Breast Augmentation" }, value: "breast_aug" },
    { label: { tr: "Liposuction", en: "Liposuction" }, value: "liposuction" },
    { label: { tr: "Karın Germe", en: "Tummy Tuck" }, value: "tummy_tuck" },
    { label: { tr: "Yüz Germe", en: "Facelift" }, value: "facelift" },
    { label: { tr: "Diğer", en: "Other" }, value: "other" },
  ], required: true, order: 1, saveAsField: "subTreatment" },
  { id: "a2", questionText: { tr: "Hangi ülkeden başvuru yapıyorsunuz?", en: "Which country are you traveling from?" }, questionType: "text", required: true, order: 2, saveAsField: "country" },
  { id: "a3", questionText: { tr: "Ne zaman seyahat etmeyi planlıyorsunuz?", en: "Preferred travel date?" }, questionType: "date", required: false, order: 3, saveAsField: "travelDate" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function AIConfigPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [config, setConfig] = useState<IntakeFlowConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeCat, setActiveCat] = useState<TreatmentCategory>("dental");
  const [newQ, setNewQ] = useState({ textTr: "", textEn: "", type: "text" as IntakeQuestionType, required: false });

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;

  /** Resolve a LocalizedString for current panel language */
  const loc = (val: LocalizedString | undefined): string => resolveLocalized(val, language);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const docRef = doc(db, "agencies", agencyId, "config", "ai");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as IntakeFlowConfig);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [agencyId]);

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true); setSaved(false);
    try {
      await setDoc(doc(db, "agencies", agencyId, "config", "ai"), {
        ...config, updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error("Failed to save:", err); }
    finally { setSaving(false); }
  };

  const getFlow = (cat: string): IntakeQuestion[] => config.categoryFlows[cat] || [];

  const setFlow = (cat: string, qs: IntakeQuestion[]) => {
    setConfig({ ...config, categoryFlows: { ...config.categoryFlows, [cat]: qs } });
  };

  const addQuestion = () => {
    const trText = newQ.textTr.trim();
    const enText = newQ.textEn.trim();
    if (!trText && !enText) return;
    const flow = getFlow(activeCat);
    const q: IntakeQuestion = {
      id: `q_${Date.now()}`,
      questionText: (trText && enText) ? { tr: trText, en: enText } : (trText || enText),
      questionType: newQ.type,
      required: newQ.required,
      order: flow.length + 1,
    };
    setFlow(activeCat, [...flow, q]);
    setNewQ({ textTr: "", textEn: "", type: "text", required: false });
  };

  const removeQuestion = (qid: string) => {
    setFlow(activeCat, getFlow(activeCat).filter((q) => q.id !== qid));
  };

  const loadDefaults = (cat: string) => {
    const defaults: Record<string, IntakeQuestion[]> = {
      dental: DEFAULT_DENTAL_FLOW,
      hair_transplant: DEFAULT_HAIR_FLOW,
      aesthetic_surgery: DEFAULT_AESTHETIC_FLOW,
    };
    if (defaults[cat]) setFlow(cat, defaults[cat]);
  };

  const toggleLang = (lang: string) => {
    setConfig((c) => ({
      ...c,
      supportedLanguages: c.supportedLanguages.includes(lang)
        ? c.supportedLanguages.filter((l) => l !== lang)
        : [...c.supportedLanguages, lang],
    }));
  };

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!agencyId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>{t("portal.common.noAgencySelected")}</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          {isSuperAdmin(profile?.role) ? t("portal.common.selectAgency") : t("portal.common.notLinked")}
        </p>
      </div>
    );
  }

  const langOptions = ["en", "tr", "de", "fr", "es", "ar", "ru"];
  const currentFlow = getFlow(activeCat);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            {t("portal.intakeFlow.title")}
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {t("portal.intakeFlow.subtitle")}
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? t("portal.intakeFlow.saved") : t("portal.intakeFlow.saveChanges")}
          </span>
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* General */}
        <SectionCard title={t("portal.intakeFlow.aiSettings")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label={t("portal.intakeFlow.assistantName")} value={config.assistantName} onChange={(e) => setConfig({ ...config, assistantName: e.target.value })} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>{t("portal.intakeFlow.welcomeMessage")}</p>
              <textarea value={config.welcomeMessage} onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })} rows={3}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-app)", color: UI_COLORS.textPrimary, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Select label={t("portal.intakeFlow.defaultLanguage")} value={config.defaultLanguage} onChange={(e) => setConfig({ ...config, defaultLanguage: e.target.value })}
                options={langOptions.map((l) => ({ label: l.toUpperCase(), value: l }))} />
              <Select label={t("portal.intakeFlow.toneOfVoice")} value={config.toneOfVoice} onChange={(e) => setConfig({ ...config, toneOfVoice: e.target.value })}
                options={[
                  { label: t("portal.intakeFlow.professional"), value: "professional" },
                  { label: t("portal.intakeFlow.friendly"), value: "friendly" },
                  { label: t("portal.intakeFlow.empathetic"), value: "empathetic" },
                  { label: t("portal.intakeFlow.clinical"), value: "clinical" },
                ]} />
            </div>
          </div>
        </SectionCard>

        {/* Languages */}
        <SectionCard title={t("portal.intakeFlow.supportedLanguages")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {langOptions.map((lang) => (
              <button key={lang} onClick={() => toggleLang(lang)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  background: config.supportedLanguages.includes(lang) ? "rgba(16, 185, 129, 0.1)" : "transparent",
                  color: config.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.textMuted,
                  border: `1px solid ${config.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.border}`,
                }}>
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Intake Flow Builder */}
        <SectionCard title={t("portal.intakeFlow.intakeFlowBuilder")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 16 }}>
            {t("portal.intakeFlow.intakeFlowDesc")}
          </p>

          {/* Category Tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => (
              <button key={key} onClick={() => setActiveCat(key as TreatmentCategory)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  background: activeCat === key ? "rgba(16, 185, 129, 0.1)" : "transparent",
                  color: activeCat === key ? "#10b981" : UI_COLORS.textMuted,
                  border: `1px solid ${activeCat === key ? "#10b981" : UI_COLORS.border}`,
                }}>
                {language === "tr" ? val.tr : val.en}
                {getFlow(key).length > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({getFlow(key).length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Questions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {currentFlow.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", background: "var(--bg-app)", borderRadius: 10, border: `1px dashed ${UI_COLORS.border}` }}>
                <MessageSquare size={24} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 8 }}>{t("portal.intakeFlow.noQuestions")}</p>
                {["dental", "hair_transplant", "aesthetic_surgery"].includes(activeCat) && (
                  <button onClick={() => loadDefaults(activeCat)}
                    style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1px solid #10b981`, background: "rgba(16, 185, 129, 0.08)", color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {t("portal.intakeFlow.loadDefaults")}
                  </button>
                )}
              </div>
            ) : (
              currentFlow.map((q, idx) => (
                <div key={q.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)",
                }}>
                  <GripVertical size={14} color={UI_COLORS.textMuted} style={{ opacity: 0.4, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, width: 24, flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>{loc(q.questionText)}</p>
                    {/* Show other language as subtitle */}
                    {typeof q.questionText === "object" && (
                      <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2, fontStyle: "italic" }}>
                        {language === "tr" ? q.questionText.en : q.questionText.tr}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "rgba(16, 185, 129, 0.08)", color: "#10b981", fontWeight: 600 }}>{q.questionType}</span>
                      {q.required && <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", fontWeight: 600 }}>{t("portal.intakeFlow.required")}</span>}
                      {q.saveAsField && <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "rgba(99, 102, 241, 0.08)", color: "#6366f1", fontWeight: 600 }}>→ {q.saveAsField}</span>}
                      {q.options && q.options.length > 0 && (
                        <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "rgba(245, 158, 11, 0.08)", color: "#f59e0b", fontWeight: 600 }}>
                          {q.options.map((o) => loc(o.label)).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeQuestion(q.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add Question — dual language inputs */}
          <div style={{ padding: 14, borderRadius: 10, border: `1px dashed ${UI_COLORS.border}`, background: "var(--bg-app)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("portal.intakeFlow.addQuestion")}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input type="text" value={newQ.textTr} onChange={(e) => setNewQ({ ...newQ, textTr: e.target.value })}
                placeholder={language === "tr" ? "Soru metni (TR)" : "Question text (TR)"}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
              <input type="text" value={newQ.textEn} onChange={(e) => setNewQ({ ...newQ, textEn: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                placeholder={language === "tr" ? "Question text (EN)" : "Question text (EN)"}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value as IntakeQuestionType })}
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, fontSize: 12, background: "var(--bg-card)", color: UI_COLORS.textPrimary, cursor: "pointer" }}>
                {(["text", "select", "multi_select", "date", "file", "phone", "email", "number"] as IntakeQuestionType[]).map((tp) => (
                  <option key={tp} value={tp}>{tp.replace("_", " ")}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: UI_COLORS.textMuted, cursor: "pointer" }}>
                <input type="checkbox" checked={newQ.required} onChange={(e) => setNewQ({ ...newQ, required: e.target.checked })} />
                {t("portal.intakeFlow.required")}
              </label>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" onClick={addQuestion}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> {t("portal.intakeFlow.addQuestion")}</span>
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* Compliance */}
        <SectionCard title={t("portal.intakeFlow.compliance")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label={t("portal.intakeFlow.consentUrl")} value={config.consentUrl} onChange={(e) => setConfig({ ...config, consentUrl: e.target.value })} placeholder="https://..." />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>{t("portal.intakeFlow.emergencyDisclaimer")}</p>
              <textarea value={config.emergencyDisclaimer} onChange={(e) => setConfig({ ...config, emergencyDisclaimer: e.target.value })} rows={2}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-app)", color: UI_COLORS.textPrimary, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>{t("portal.intakeFlow.humanFallback")}</p>
              <textarea value={config.fallbackMessage} onChange={(e) => setConfig({ ...config, fallbackMessage: e.target.value })} rows={2}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-app)", color: UI_COLORS.textPrimary, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
