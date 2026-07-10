"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import {
  updateClinicProfile,
  updateAgencyClinic,
  subscribeToClinicPricing,
  addClinicPricing,
  deleteClinicPricing,
  subscribeToClinicFAQ,
  addClinicFAQ,
  updateClinicFAQ,
  deleteClinicFAQ,
  subscribeToClinicDoctors,
  addClinicDoctor,
  updateClinicDoctor,
  deleteClinicDoctor,
} from "@/lib/services/agencyService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  ArrowLeft, Loader2, Save, Check, X, Plus, Trash2,
  Building2, FileText, Stethoscope, DollarSign, Brain,
  HelpCircle, MapPin, Settings, ExternalLink, Globe, UserCircle, Edit2,
} from "lucide-react";
import type {
  AgencyClinic, ClinicOverview, ClinicKnowledgeBase,
  ClinicLocationDetails, ClinicQuoteSettings, ClinicFAQ, ClinicDoctor,
  ClinicTreatmentPricing, TreatmentCategory, PriceType,
} from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

// ─── Shared Components ──────────────────────────────────────────────────────
function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>{label}</span>
      <button type="button" onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
        background: checked ? "#10b981" : UI_COLORS.border, position: "relative", transition: "background 0.2s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13,
          fontFamily: "inherit", resize: "vertical", outline: "none",
        }}
      />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary, display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      {icon} {title}
    </h3>
  );
}

// ─── Tab Definition ─────────────────────────────────────────────────────────
const TAB_KEYS = ["general", "overview", "treatments", "pricing", "doctors", "knowledgeBase", "faq", "location", "quoteSettings"] as const;
type TabKey = typeof TAB_KEYS[number];

const TAB_ICONS: Record<TabKey, React.ReactNode> = {
  general: <Building2 size={14} />,
  overview: <FileText size={14} />,
  treatments: <Stethoscope size={14} />,
  pricing: <DollarSign size={14} />,
  doctors: <UserCircle size={14} />,
  knowledgeBase: <Brain size={14} />,
  faq: <HelpCircle size={14} />,
  location: <MapPin size={14} />,
  quoteSettings: <Settings size={14} />,
};

// ═════════════════════════════════════════════════════════════════════════════
export default function ClinicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useI18n();
  const agencyId = params.agencyId as string;
  const clinicDocId = params.clinicDocId as string;

  const [clinic, setClinic] = useState<AgencyClinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state per section
  const [overview, setOverview] = useState<ClinicOverview>({});
  const [kb, setKb] = useState<ClinicKnowledgeBase>({});
  const [loc, setLoc] = useState<ClinicLocationDetails>({ city: "", country: "" });
  const [qs, setQs] = useState<ClinicQuoteSettings>({});
  const [generalForm, setGeneralForm] = useState({
    clinicName: "", clinicSlug: "", category: "", website: "", profileUrl: "",
    contactEmail: "", phone: "", whatsapp: "", branch: "",
    supportedLanguages: [] as string[], treatmentCategories: [] as TreatmentCategory[],
    subTreatments: "", showInRecommendations: true, showPriceRange: true, showProfileLink: true,
  });

  // Pricing
  const [pricing, setPricing] = useState<ClinicTreatmentPricing[]>([]);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    treatmentName: "", priceMin: "", priceMax: "", currency: "EUR",
    priceType: "average" as PriceType, notes: "", showOnPublicProfile: true, allowQuoteRequest: true,
  });

  // FAQ
  const [faqs, setFaqs] = useState<ClinicFAQ[]>([]);
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", showOnPublicProfile: true, useInAIAnswers: true });

  // Doctors
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [doctorForm, setDoctorForm] = useState({
    doctorName: "", title: "", specialty: "", role: "", photoUrl: "",
    shortBio: "", longBio: "", education: "", experienceYears: "",
    expertiseAreas: "", certifications: "", supportedLanguages: [] as string[],
    subTreatments: "", aiSummary: "", aiHighlights: "", doNotSay: "",
    showOnPublicProfile: true, status: "active" as "active" | "inactive",
    order: "",
  });
  const resetDoctorForm = () => {
    setDoctorForm({
      doctorName: "", title: "", specialty: "", role: "", photoUrl: "",
      shortBio: "", longBio: "", education: "", experienceYears: "",
      expertiseAreas: "", certifications: "", supportedLanguages: [],
      subTreatments: "", aiSummary: "", aiHighlights: "", doNotSay: "",
      showOnPublicProfile: true, status: "active", order: "",
    });
    setEditingDoctorId(null);
  };

  // ─── Load clinic data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!agencyId || !clinicDocId) return;
    const unsub = onSnapshot(
      doc(db, "agencies", agencyId, "clinics", clinicDocId),
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as AgencyClinic;
          setClinic(data);
          // Populate forms from clinic data
          setGeneralForm({
            clinicName: data.clinicName || "",
            clinicSlug: data.clinicSlug || "",
            category: data.category || "dental",
            website: data.website || "",
            profileUrl: data.profileUrl || "",
            contactEmail: data.contactEmail || "",
            phone: data.phone || "",
            whatsapp: data.whatsapp || "",
            branch: data.branch || "",
            supportedLanguages: data.supportedLanguages || [],
            treatmentCategories: data.treatmentCategories || [],
            subTreatments: (data.subTreatments || []).join(", "),
            showInRecommendations: data.showInRecommendations ?? true,
            showPriceRange: data.showPriceRange ?? true,
            showProfileLink: data.showProfileLink ?? true,
          });
          setOverview(data.overview || {
            shortDescription: data.shortDescription || "",
            longDescription: data.longDescription || "",
          });
          setKb(data.knowledgeBase || {});
          setLoc(data.locationDetails || { city: data.location?.city || "", country: data.location?.country || "", address: data.location?.address || "" });
          setQs(data.quoteSettings || { quoteEnabled: data.quoteEnabled, quoteContactEmail: data.quoteContactEmail });
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [agencyId, clinicDocId]);

  // Pricing subscription
  useEffect(() => {
    if (!agencyId || !clinicDocId) return;
    return subscribeToClinicPricing(agencyId, clinicDocId, setPricing);
  }, [agencyId, clinicDocId]);

  // FAQ subscription
  useEffect(() => {
    if (!agencyId || !clinicDocId) return;
    return subscribeToClinicFAQ(agencyId, clinicDocId, setFaqs);
  }, [agencyId, clinicDocId]);

  // Doctors subscription
  useEffect(() => {
    if (!agencyId || !clinicDocId) return;
    return subscribeToClinicDoctors(agencyId, clinicDocId, setDoctors);
  }, [agencyId, clinicDocId]);

  // ─── Save Handlers ────────────────────────────────────────────────────
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await updateAgencyClinic(agencyId, clinicDocId, {
        clinicName: generalForm.clinicName,
        clinicSlug: generalForm.clinicSlug,
        category: generalForm.category,
        website: generalForm.website || undefined,
        profileUrl: generalForm.profileUrl || undefined,
        contactEmail: generalForm.contactEmail || undefined,
        phone: generalForm.phone || undefined,
        whatsapp: generalForm.whatsapp || undefined,
        branch: generalForm.branch || undefined,
        supportedLanguages: generalForm.supportedLanguages,
        treatmentCategories: generalForm.treatmentCategories,
        subTreatments: generalForm.subTreatments ? generalForm.subTreatments.split(",").map(s => s.trim()).filter(Boolean) : [],
        showInRecommendations: generalForm.showInRecommendations,
        showPriceRange: generalForm.showPriceRange,
        showProfileLink: generalForm.showProfileLink,
        location: { city: loc.city, country: loc.country, address: loc.address },
      } as any);
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleSaveOverview = async () => {
    setSaving(true);
    try {
      await updateClinicProfile(agencyId, clinicDocId, { overview });
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleSaveKB = async () => {
    setSaving(true);
    try {
      await updateClinicProfile(agencyId, clinicDocId, { knowledgeBase: kb });
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleSaveLocation = async () => {
    setSaving(true);
    try {
      await updateClinicProfile(agencyId, clinicDocId, {
        locationDetails: loc,
        location: { city: loc.city, country: loc.country, address: loc.address },
      });
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleSaveQuoteSettings = async () => {
    setSaving(true);
    try {
      await updateClinicProfile(agencyId, clinicDocId, { quoteSettings: qs, quoteEnabled: qs.quoteEnabled, quoteContactEmail: qs.quoteContactEmail });
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleAddPricing = async () => {
    if (!pricingForm.treatmentName) return;
    setSaving(true);
    try {
      await addClinicPricing(agencyId, clinicDocId, {
        agencyClinicId: clinicDocId,
        treatmentName: pricingForm.treatmentName,
        priceMin: Number(pricingForm.priceMin) || 0,
        priceMax: Number(pricingForm.priceMax) || 0,
        currency: pricingForm.currency,
        priceType: pricingForm.priceType,
        notes: pricingForm.notes || undefined,
        showOnPublicProfile: pricingForm.showOnPublicProfile,
        allowQuoteRequest: pricingForm.allowQuoteRequest,
        status: "active",
      });
      setPricingForm({ treatmentName: "", priceMin: "", priceMax: "", currency: "EUR", priceType: "average", notes: "", showOnPublicProfile: true, allowQuoteRequest: true });
      setShowPricingForm(false);
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleAddFAQ = async () => {
    if (!faqForm.question || !faqForm.answer) return;
    setSaving(true);
    try {
      await addClinicFAQ(agencyId, clinicDocId, faqForm);
      setFaqForm({ question: "", answer: "", showOnPublicProfile: true, useInAIAnswers: true });
      setShowFaqForm(false);
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const handleSaveDoctor = async () => {
    if (!doctorForm.doctorName) return;
    setSaving(true);
    try {
      const payload = {
        doctorName: doctorForm.doctorName,
        title: doctorForm.title || undefined,
        specialty: doctorForm.specialty || undefined,
        role: doctorForm.role || undefined,
        photoUrl: doctorForm.photoUrl || undefined,
        shortBio: doctorForm.shortBio || undefined,
        longBio: doctorForm.longBio || undefined,
        education: doctorForm.education || undefined,
        experienceYears: doctorForm.experienceYears ? Number(doctorForm.experienceYears) : undefined,
        expertiseAreas: doctorForm.expertiseAreas ? doctorForm.expertiseAreas.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        certifications: doctorForm.certifications ? doctorForm.certifications.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        supportedLanguages: doctorForm.supportedLanguages.length > 0 ? doctorForm.supportedLanguages : undefined,
        subTreatments: doctorForm.subTreatments ? doctorForm.subTreatments.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        aiSummary: doctorForm.aiSummary || undefined,
        aiHighlights: doctorForm.aiHighlights ? doctorForm.aiHighlights.split("\n").filter(Boolean) : undefined,
        doNotSay: doctorForm.doNotSay ? doctorForm.doNotSay.split("\n").filter(Boolean) : undefined,
        showOnPublicProfile: doctorForm.showOnPublicProfile,
        status: doctorForm.status,
        order: doctorForm.order ? Number(doctorForm.order) : doctors.length,
      };
      if (editingDoctorId) {
        await updateClinicDoctor(agencyId, clinicDocId, editingDoctorId, payload);
      } else {
        await addClinicDoctor(agencyId, clinicDocId, payload);
      }
      resetDoctorForm();
      setShowDoctorForm(false);
      showToast("success", t("portal.clinics.profile.saved"));
    } catch (err) {
      console.error(err);
      showToast("error", t("portal.clinics.profile.saveFailed"));
    }
    setSaving(false);
  };

  const openEditDoctor = (doc: ClinicDoctor) => {
    setEditingDoctorId(doc.id || null);
    setDoctorForm({
      doctorName: doc.doctorName || "",
      title: doc.title || "",
      specialty: doc.specialty || "",
      role: doc.role || "",
      photoUrl: doc.photoUrl || "",
      shortBio: doc.shortBio || "",
      longBio: doc.longBio || "",
      education: doc.education || "",
      experienceYears: doc.experienceYears ? String(doc.experienceYears) : "",
      expertiseAreas: (doc.expertiseAreas || []).join(", "),
      certifications: (doc.certifications || []).join(", "),
      supportedLanguages: doc.supportedLanguages || [],
      subTreatments: (doc.subTreatments || []).join(", "),
      aiSummary: doc.aiSummary || "",
      aiHighlights: (doc.aiHighlights || []).join("\n"),
      doNotSay: (doc.doNotSay || []).join("\n"),
      showOnPublicProfile: doc.showOnPublicProfile ?? true,
      status: doc.status || "active",
      order: doc.order !== undefined ? String(doc.order) : "",
    });
    setShowDoctorForm(true);
  };

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
        Clinic not found.
      </div>
    );
  }

  const LANG_OPTIONS = ["en", "tr", "de", "ar", "es", "fr", "ru", "nl", "it"] as const;

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: "24px 40px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => router.push(`/agency/agencies/${agencyId}/clinics`)}
          style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
        >
          <ArrowLeft size={16} /> {t("portal.clinics.profile.backToClinics")}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, margin: 0 }}>{clinic.clinicName}</h1>
          <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {clinic.location?.city}, {clinic.location?.country} · {t("portal.clinics.profile.title")}
          </p>
        </div>
        {clinic.profileUrl && (
          <a href={clinic.profileUrl} target="_blank" rel="noopener noreferrer" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
            background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)",
            color: "#10b981", fontSize: 12, fontWeight: 600, textDecoration: "none",
          }}>
            <ExternalLink size={14} /> FeelinHealthy Profile
          </a>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto", borderBottom: `1px solid ${UI_COLORS.border}`, paddingBottom: 0 }}>
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? "#10b981" : UI_COLORS.textMuted,
              background: "transparent",
              borderBottom: activeTab === tab ? "2px solid #10b981" : "2px solid transparent",
              transition: "all 0.2s", whiteSpace: "nowrap",
            }}
          >
            {TAB_ICONS[tab]} {t(`portal.clinics.profile.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: UI_COLORS.bgCard, borderRadius: 12, border: `1px solid ${UI_COLORS.border}`, padding: 24 }}>

        {/* ═══ TAB: GENERAL ═══ */}
        {activeTab === "general" && (
          <div>
            <SectionTitle icon={<Building2 size={18} />} title={t("portal.clinics.profile.tabs.general")} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label={t("portal.clinics.clinicName")} value={generalForm.clinicName} onChange={(e) => setGeneralForm(p => ({ ...p, clinicName: e.target.value }))} />
              <Input label="Slug" value={generalForm.clinicSlug} onChange={(e) => setGeneralForm(p => ({ ...p, clinicSlug: e.target.value }))} />
              <Input label={t("portal.clinics.website")} value={generalForm.website} onChange={(e) => setGeneralForm(p => ({ ...p, website: e.target.value }))} />
              <Input label={t("portal.clinics.profileUrl")} value={generalForm.profileUrl} onChange={(e) => setGeneralForm(p => ({ ...p, profileUrl: e.target.value }))} />
              <Input label={t("portal.clinics.contactEmail")} value={generalForm.contactEmail} onChange={(e) => setGeneralForm(p => ({ ...p, contactEmail: e.target.value }))} />
              <Input label={t("portal.clinics.phone")} value={generalForm.phone} onChange={(e) => setGeneralForm(p => ({ ...p, phone: e.target.value }))} />
              <Input label={t("portal.clinics.whatsapp") || "WhatsApp"} value={generalForm.whatsapp} onChange={(e) => setGeneralForm(p => ({ ...p, whatsapp: e.target.value }))} />
              <Input label="Branch" value={generalForm.branch} onChange={(e) => setGeneralForm(p => ({ ...p, branch: e.target.value }))} />
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.clinics.treatmentCategories")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => {
                  const sel = generalForm.treatmentCategories.includes(key as TreatmentCategory);
                  return (
                    <button key={key} type="button" onClick={() => setGeneralForm(p => ({
                      ...p,
                      treatmentCategories: sel
                        ? p.treatmentCategories.filter(c => c !== key)
                        : [...p.treatmentCategories, key as TreatmentCategory],
                    }))} style={{
                      padding: "5px 12px", borderRadius: 20, border: `1px solid ${sel ? "#10b981" : UI_COLORS.border}`,
                      background: sel ? "rgba(16,185,129,0.1)" : "transparent",
                      color: sel ? "#10b981" : UI_COLORS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>{language === "tr" ? val.tr : val.en}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.clinics.supportedLanguages")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {LANG_OPTIONS.map((lang) => {
                  const sel = generalForm.supportedLanguages.includes(lang);
                  return (
                    <button key={lang} type="button" onClick={() => setGeneralForm(p => ({
                      ...p,
                      supportedLanguages: sel ? p.supportedLanguages.filter(l => l !== lang) : [...p.supportedLanguages, lang],
                    }))} style={{
                      padding: "5px 12px", borderRadius: 20, border: `1px solid ${sel ? "#10b981" : UI_COLORS.border}`,
                      background: sel ? "rgba(16,185,129,0.1)" : "transparent",
                      color: sel ? "#10b981" : UI_COLORS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>{lang.toUpperCase()}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 14 }}>
              <ToggleSwitch label={t("portal.clinics.showInRecommendations")} checked={generalForm.showInRecommendations} onChange={(v) => setGeneralForm(p => ({ ...p, showInRecommendations: v }))} />
              <ToggleSwitch label={t("portal.clinics.showPriceRange")} checked={generalForm.showPriceRange} onChange={(v) => setGeneralForm(p => ({ ...p, showPriceRange: v }))} />
              <ToggleSwitch label={t("portal.clinics.showProfileLink")} checked={generalForm.showProfileLink} onChange={(v) => setGeneralForm(p => ({ ...p, showProfileLink: v }))} />
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleSaveGeneral} isLoading={saving}><Save size={14} /> {t("portal.buttons.saveChanges")}</Button>
            </div>
          </div>
        )}

        {/* ═══ TAB: OVERVIEW ═══ */}
        {activeTab === "overview" && (
          <div>
            <SectionTitle icon={<FileText size={18} />} title={t("portal.clinics.profile.tabs.overview")} />
            <TextArea label={t("portal.clinics.profile.overview.shortDescription")} value={overview.shortDescription || ""} onChange={(v) => setOverview(p => ({ ...p, shortDescription: v }))} placeholder="Alanya'da dental implant, estetik diş hekimliği..." rows={2} />
            <TextArea label={t("portal.clinics.profile.overview.longDescription")} value={overview.longDescription || ""} onChange={(v) => setOverview(p => ({ ...p, longDescription: v }))} placeholder="Klinik hakkında detaylı bilgi..." rows={5} />
            <Input label={t("portal.clinics.profile.overview.specialties")} value={(overview.specialties || []).join(", ")} onChange={(e) => setOverview(p => ({ ...p, specialties: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} placeholder={t("portal.clinics.profile.overview.specialtiesPlaceholder")} />
            <Input label={t("portal.clinics.profile.overview.highlightedTreatments")} value={(overview.highlightedTreatments || []).join(", ")} onChange={(e) => setOverview(p => ({ ...p, highlightedTreatments: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} placeholder={t("portal.clinics.profile.overview.highlightedPlaceholder")} />
            <TextArea label={t("portal.clinics.profile.overview.targetPatientProfile")} value={overview.targetPatientProfile || ""} onChange={(v) => setOverview(p => ({ ...p, targetPatientProfile: v }))} rows={2} />
            <TextArea label={t("portal.clinics.profile.overview.healthTourismExperience")} value={overview.healthTourismExperience || ""} onChange={(v) => setOverview(p => ({ ...p, healthTourismExperience: v }))} rows={2} />

            <div style={{ borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 14, marginTop: 8 }}>
              <ToggleSwitch label={t("portal.clinics.profile.overview.internationalSupport")} checked={overview.internationalPatientSupport ?? false} onChange={(v) => setOverview(p => ({ ...p, internationalPatientSupport: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.overview.accommodationSupport")} checked={overview.accommodationSupport ?? false} onChange={(v) => setOverview(p => ({ ...p, accommodationSupport: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.overview.transferSupport")} checked={overview.transferSupport ?? false} onChange={(v) => setOverview(p => ({ ...p, transferSupport: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.overview.onlineConsultation")} checked={overview.onlineConsultation ?? false} onChange={(v) => setOverview(p => ({ ...p, onlineConsultation: v }))} />
            </div>

            <div style={{ marginTop: 12 }}>
              <Input label={t("portal.clinics.profile.overview.averageResponseTime")} value={overview.averageResponseTime || ""} onChange={(e) => setOverview(p => ({ ...p, averageResponseTime: e.target.value }))} placeholder="2-4 saat" />
            </div>
            <TextArea label={t("portal.clinics.profile.overview.clinicNotes")} value={overview.clinicNotes || ""} onChange={(v) => setOverview(p => ({ ...p, clinicNotes: v }))} rows={3} />

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleSaveOverview} isLoading={saving}><Save size={14} /> {t("portal.buttons.saveChanges")}</Button>
            </div>
          </div>
        )}

        {/* ═══ TAB: TREATMENTS ═══ */}
        {activeTab === "treatments" && (
          <div>
            <SectionTitle icon={<Stethoscope size={18} />} title={t("portal.clinics.profile.tabs.treatments")} />
            <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginBottom: 16 }}>
              {t("portal.clinics.treatmentCategories")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {generalForm.treatmentCategories.map((cat) => (
                <Badge key={cat} label={catLabel(cat)} variant="info" />
              ))}
              {generalForm.treatmentCategories.length === 0 && <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>—</span>}
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.clinics.subTreatments")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(clinic.subTreatments || []).map((st) => (
                  <Badge key={st} label={st} variant="default" />
                ))}
                {(!clinic.subTreatments || clinic.subTreatments.length === 0) && <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>—</span>}
              </div>
            </div>

            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.1)" }}>
              <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
                {language === "tr" ? "Tedavi kategorilerini ve alt tedavileri Genel Bilgiler sekmesinden yönetebilirsiniz." : "Manage treatment categories and sub-treatments from the General Info tab."}
              </p>
            </div>
          </div>
        )}

        {/* ═══ TAB: PRICING ═══ */}
        {activeTab === "pricing" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <SectionTitle icon={<DollarSign size={18} />} title={t("portal.clinics.profile.tabs.pricing")} />
              <Button variant="secondary" onClick={() => setShowPricingForm(!showPricingForm)} style={{ fontSize: 12 }}>
                {showPricingForm ? <X size={12} /> : <Plus size={12} />}
                {showPricingForm ? t("portal.buttons.cancel") : t("portal.clinics.pricing.addPricing")}
              </Button>
            </div>

            {showPricingForm && (
              <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.02)", marginBottom: 16 }}>
                <Input label={t("portal.clinics.pricing.treatmentName")} value={pricingForm.treatmentName} onChange={(e) => setPricingForm(p => ({ ...p, treatmentName: e.target.value }))} placeholder="Dental Implant" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
                  <Input label={t("portal.clinics.pricing.priceMin")} value={pricingForm.priceMin} onChange={(e) => setPricingForm(p => ({ ...p, priceMin: e.target.value }))} placeholder="400" />
                  <Input label={t("portal.clinics.pricing.priceMax")} value={pricingForm.priceMax} onChange={(e) => setPricingForm(p => ({ ...p, priceMax: e.target.value }))} placeholder="900" />
                  <Input label={t("portal.clinics.pricing.currency")} value={pricingForm.currency} onChange={(e) => setPricingForm(p => ({ ...p, currency: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {(["average", "starting_from", "package", "per_unit"] as PriceType[]).map((pt) => (
                    <button key={pt} type="button" onClick={() => setPricingForm(p => ({ ...p, priceType: pt }))} style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${pricingForm.priceType === pt ? "#10b981" : UI_COLORS.border}`,
                      background: pricingForm.priceType === pt ? "rgba(16,185,129,0.1)" : "transparent",
                      color: pricingForm.priceType === pt ? "#10b981" : UI_COLORS.textSecondary,
                    }}>{t(`portal.clinics.pricing.${pt === "starting_from" ? "startingFrom" : pt === "per_unit" ? "perUnit" : pt}`)}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Input label={t("portal.clinics.pricing.notes")} value={pricingForm.notes} onChange={(e) => setPricingForm(p => ({ ...p, notes: e.target.value }))} placeholder="..." />
                </div>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                  <Button onClick={handleAddPricing} isLoading={saving}><Plus size={14} /> {t("portal.clinics.pricing.addPricing")}</Button>
                </div>
              </div>
            )}

            {pricing.length === 0 && !showPricingForm && (
              <div style={{ textAlign: "center", padding: 40, color: UI_COLORS.textMuted }}>
                <DollarSign size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>{t("portal.clinics.pricing.noPricing")}</p>
              </div>
            )}

            {pricing.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{p.treatmentName}</p>
                  <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
                    {p.priceMin}–{p.priceMax} {p.currency} · {p.priceType}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                </div>
                <button onClick={() => { if (confirm(t("portal.clinics.pricing.deleteConfirm"))) deleteClinicPricing(agencyId, clinicDocId, p.id!); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* ═══ TAB: DOCTORS ═══ */}
        {activeTab === "doctors" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <SectionTitle icon={<UserCircle size={18} />} title={t("portal.clinics.profile.doctors.title")} />
              <Button variant="secondary" onClick={() => { if (showDoctorForm) { resetDoctorForm(); setShowDoctorForm(false); } else setShowDoctorForm(true); }} style={{ fontSize: 12 }}>
                {showDoctorForm ? <X size={12} /> : <Plus size={12} />}
                {showDoctorForm ? t("portal.buttons.cancel") : t("portal.clinics.profile.doctors.addDoctor")}
              </Button>
            </div>

            {showDoctorForm && (
              <div style={{ padding: 20, borderRadius: 12, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.02)", marginBottom: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>
                  {editingDoctorId ? t("portal.clinics.profile.doctors.editDoctor") : t("portal.clinics.profile.doctors.addDoctor")}
                </h4>

                {/* Basic Info */}
                <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  {t("portal.clinics.profile.doctors.basicInfo")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <Input label={t("portal.clinics.profile.doctors.doctorName")} value={doctorForm.doctorName} onChange={(e) => setDoctorForm(p => ({ ...p, doctorName: e.target.value }))} placeholder="Gülten Sinanoğlu" />
                  <Input label={t("portal.clinics.profile.doctors.titleField")} value={doctorForm.title} onChange={(e) => setDoctorForm(p => ({ ...p, title: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.titlePlaceholder")} />
                  <Input label={t("portal.clinics.profile.doctors.specialty")} value={doctorForm.specialty} onChange={(e) => setDoctorForm(p => ({ ...p, specialty: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.specialtyPlaceholder")} />
                  <Input label={t("portal.clinics.profile.doctors.role")} value={doctorForm.role} onChange={(e) => setDoctorForm(p => ({ ...p, role: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.rolePlaceholder")} />
                </div>
                <Input label={t("portal.clinics.profile.doctors.photoUrl")} value={doctorForm.photoUrl} onChange={(e) => setDoctorForm(p => ({ ...p, photoUrl: e.target.value }))} placeholder="https://..." />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <Input label={t("portal.clinics.profile.doctors.experienceYears")} value={doctorForm.experienceYears} onChange={(e) => setDoctorForm(p => ({ ...p, experienceYears: e.target.value }))} placeholder="10" />
                  <Input label={t("portal.clinics.profile.doctors.order")} value={doctorForm.order} onChange={(e) => setDoctorForm(p => ({ ...p, order: e.target.value }))} placeholder="1" />
                </div>

                {/* Biography */}
                <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>
                  {t("portal.clinics.profile.doctors.biography")}
                </p>
                <TextArea label={t("portal.clinics.profile.doctors.shortBio")} value={doctorForm.shortBio} onChange={(v) => setDoctorForm(p => ({ ...p, shortBio: v }))} rows={2} />
                <TextArea label={t("portal.clinics.profile.doctors.longBio")} value={doctorForm.longBio} onChange={(v) => setDoctorForm(p => ({ ...p, longBio: v }))} rows={4} />
                <TextArea label={t("portal.clinics.profile.doctors.education")} value={doctorForm.education} onChange={(v) => setDoctorForm(p => ({ ...p, education: v }))} rows={2} />
                <Input label={t("portal.clinics.profile.doctors.expertiseAreas")} value={doctorForm.expertiseAreas} onChange={(e) => setDoctorForm(p => ({ ...p, expertiseAreas: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.expertisePlaceholder")} />
                <Input label={t("portal.clinics.profile.doctors.certifications")} value={doctorForm.certifications} onChange={(e) => setDoctorForm(p => ({ ...p, certifications: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.certificationsPlaceholder")} />

                {/* Languages */}
                <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginTop: 8, marginBottom: 6 }}>{t("portal.clinics.profile.doctors.supportedLanguages")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {(["en", "tr", "de", "ar", "ru", "fr", "es", "nl", "it"] as const).map((lang) => {
                    const sel = doctorForm.supportedLanguages.includes(lang);
                    return (
                      <button key={lang} type="button" onClick={() => setDoctorForm(p => ({
                        ...p,
                        supportedLanguages: sel ? p.supportedLanguages.filter(l => l !== lang) : [...p.supportedLanguages, lang],
                      }))} style={{
                        padding: "4px 10px", borderRadius: 16, border: `1px solid ${sel ? "#10b981" : UI_COLORS.border}`,
                        background: sel ? "rgba(16,185,129,0.1)" : "transparent",
                        color: sel ? "#10b981" : UI_COLORS.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>{lang.toUpperCase()}</button>
                    );
                  })}
                </div>

                {/* Treatment Relation */}
                <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 8 }}>
                  {t("portal.clinics.profile.doctors.treatmentRelation")}
                </p>
                <Input label={t("portal.clinics.profile.doctors.subTreatments")} value={doctorForm.subTreatments} onChange={(e) => setDoctorForm(p => ({ ...p, subTreatments: e.target.value }))} placeholder={t("portal.clinics.profile.doctors.subTreatmentsPlaceholder")} />

                {/* AI Fields */}
                <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>
                  {t("portal.clinics.profile.doctors.aiFields")}
                </p>
                <TextArea label={t("portal.clinics.profile.doctors.aiSummary")} value={doctorForm.aiSummary} onChange={(v) => setDoctorForm(p => ({ ...p, aiSummary: v }))} placeholder={t("portal.clinics.profile.doctors.aiSummaryPlaceholder")} rows={2} />
                <TextArea label={t("portal.clinics.profile.doctors.aiHighlights")} value={doctorForm.aiHighlights} onChange={(v) => setDoctorForm(p => ({ ...p, aiHighlights: v }))} placeholder={t("portal.clinics.profile.doctors.aiHighlightsPlaceholder")} rows={3} />
                <TextArea label={t("portal.clinics.profile.doctors.doNotSay")} value={doctorForm.doNotSay} onChange={(v) => setDoctorForm(p => ({ ...p, doNotSay: v }))} placeholder={t("portal.clinics.profile.doctors.doNotSayPlaceholder")} rows={2} />

                {/* Toggles */}
                <div style={{ borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 10, marginTop: 8 }}>
                  <ToggleSwitch label={t("portal.clinics.profile.doctors.showOnPublicProfile")} checked={doctorForm.showOnPublicProfile} onChange={(v) => setDoctorForm(p => ({ ...p, showOnPublicProfile: v }))} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>{t("portal.status.status")}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["active", "inactive"] as const).map((s) => (
                        <button key={s} type="button" onClick={() => setDoctorForm(p => ({ ...p, status: s }))} style={{
                          padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          border: `1px solid ${doctorForm.status === s ? (s === "active" ? "#10b981" : "#ef4444") : UI_COLORS.border}`,
                          background: doctorForm.status === s ? (s === "active" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)") : "transparent",
                          color: doctorForm.status === s ? (s === "active" ? "#10b981" : "#ef4444") : UI_COLORS.textSecondary,
                        }}>{t(`portal.status.${s}`)}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="secondary" onClick={() => { resetDoctorForm(); setShowDoctorForm(false); }}>{t("portal.buttons.cancel")}</Button>
                  <Button onClick={handleSaveDoctor} isLoading={saving}>
                    <Save size={14} /> {editingDoctorId ? t("portal.buttons.saveChanges") : t("portal.clinics.profile.doctors.addDoctor")}
                  </Button>
                </div>
              </div>
            )}

            {/* Doctor Cards */}
            {doctors.length === 0 && !showDoctorForm && (
              <div style={{ textAlign: "center", padding: 48, color: UI_COLORS.textMuted }}>
                <UserCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>{t("portal.clinics.profile.doctors.noDoctors")}</p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {doctors.map((doc) => (
                <div key={doc.id} style={{
                  padding: 16, borderRadius: 12, border: `1px solid ${UI_COLORS.border}`,
                  background: doc.status === "active" ? "transparent" : "rgba(148,163,184,0.04)",
                  opacity: doc.status === "active" ? 1 : 0.65,
                }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    {/* Avatar */}
                    {doc.photoUrl ? (
                      <img src={doc.photoUrl} alt={doc.doctorName} style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 18, fontWeight: 800,
                      }}>{doc.doctorName?.charAt(0) || "?"}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{doc.title ? `${doc.title} ${doc.doctorName}` : doc.doctorName}</p>
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
                        {[doc.specialty, doc.role].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge label={doc.status === "active" ? t("portal.status.active") : t("portal.status.inactive")} variant={doc.status === "active" ? "success" : "default"} dot />
                  </div>

                  {doc.shortBio && <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, lineHeight: 1.5, marginBottom: 8 }}>{doc.shortBio}</p>}

                  {doc.expertiseAreas && doc.expertiseAreas.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {doc.expertiseAreas.map((e, i) => (
                        <span key={i} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "rgba(16,185,129,0.08)", color: "#10b981" }}>{e}</span>
                      ))}
                    </div>
                  )}

                  {doc.supportedLanguages && doc.supportedLanguages.length > 0 && (
                    <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                      🌐 {doc.supportedLanguages.map(l => l.toUpperCase()).join(", ")}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${UI_COLORS.border}`, paddingTop: 10 }}>
                    <button onClick={() => openEditDoctor(doc)} style={{
                      padding: "5px 10px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                      background: "transparent", color: UI_COLORS.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                    }}><Edit2 size={11} /> {t("portal.clinics.edit")}</button>
                    <button onClick={() => { if (doc.id) updateClinicDoctor(agencyId, clinicDocId, doc.id, { status: doc.status === "active" ? "inactive" : "active" }); }} style={{
                      padding: "5px 10px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                      background: "transparent", color: UI_COLORS.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}>{doc.status === "active" ? t("portal.clinics.pause") : t("portal.clinics.activate")}</button>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => { if (doc.id && confirm(t("portal.clinics.profile.doctors.deleteConfirm"))) deleteClinicDoctor(agencyId, clinicDocId, doc.id); }} style={{
                      padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)",
                      background: "rgba(239,68,68,0.04)", color: "#ef4444", fontSize: 11, cursor: "pointer",
                    }}><Trash2 size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ TAB: KNOWLEDGE BASE ═══ */}
        {activeTab === "knowledgeBase" && (
          <div>
            <SectionTitle icon={<Brain size={18} />} title={t("portal.clinics.profile.knowledgeBase.title")} />
            <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginBottom: 16 }}>{t("portal.clinics.profile.knowledgeBase.description")}</p>

            <TextArea label={t("portal.clinics.profile.knowledgeBase.summary")} value={kb.summary || ""} onChange={(v) => setKb(p => ({ ...p, summary: v }))} rows={2} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.detailedInfo")} value={kb.detailedInfo || ""} onChange={(v) => setKb(p => ({ ...p, detailedInfo: v }))} rows={5} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.keySellingPoints")} value={(kb.keySellingPoints || []).join("\n")} onChange={(v) => setKb(p => ({ ...p, keySellingPoints: v.split("\n").filter(Boolean) }))} placeholder={t("portal.clinics.profile.knowledgeBase.keyPointsPlaceholder")} rows={4} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.doNotSay")} value={(kb.doNotSay || []).join("\n")} onChange={(v) => setKb(p => ({ ...p, doNotSay: v.split("\n").filter(Boolean) }))} placeholder={t("portal.clinics.profile.knowledgeBase.doNotSayPlaceholder")} rows={3} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.treatmentNotes")} value={kb.treatmentNotes || ""} onChange={(v) => setKb(p => ({ ...p, treatmentNotes: v }))} rows={3} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.routingNotes")} value={kb.routingNotes || ""} onChange={(v) => setKb(p => ({ ...p, routingNotes: v }))} rows={2} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.pricingNotes")} value={kb.pricingNotes || ""} onChange={(v) => setKb(p => ({ ...p, pricingNotes: v }))} rows={2} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.medicalDisclaimer")} value={kb.medicalDisclaimer || ""} onChange={(v) => setKb(p => ({ ...p, medicalDisclaimer: v }))} rows={2} />
            <TextArea label={t("portal.clinics.profile.knowledgeBase.consentNotes")} value={kb.consentNotes || ""} onChange={(v) => setKb(p => ({ ...p, consentNotes: v }))} rows={2} />

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleSaveKB} isLoading={saving}><Save size={14} /> {t("portal.buttons.saveChanges")}</Button>
            </div>
          </div>
        )}

        {/* ═══ TAB: FAQ ═══ */}
        {activeTab === "faq" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <SectionTitle icon={<HelpCircle size={18} />} title={t("portal.clinics.profile.faq.title")} />
              <Button variant="secondary" onClick={() => setShowFaqForm(!showFaqForm)} style={{ fontSize: 12 }}>
                {showFaqForm ? <X size={12} /> : <Plus size={12} />}
                {showFaqForm ? t("portal.buttons.cancel") : t("portal.clinics.profile.faq.addFaq")}
              </Button>
            </div>

            {showFaqForm && (
              <div style={{ padding: 16, borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.02)", marginBottom: 16 }}>
                <TextArea label={t("portal.clinics.profile.faq.question")} value={faqForm.question} onChange={(v) => setFaqForm(p => ({ ...p, question: v }))} rows={2} />
                <TextArea label={t("portal.clinics.profile.faq.answer")} value={faqForm.answer} onChange={(v) => setFaqForm(p => ({ ...p, answer: v }))} rows={3} />
                <div style={{ borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 10, marginTop: 4 }}>
                  <ToggleSwitch label={t("portal.clinics.profile.faq.showOnPublicProfile")} checked={faqForm.showOnPublicProfile} onChange={(v) => setFaqForm(p => ({ ...p, showOnPublicProfile: v }))} />
                  <ToggleSwitch label={t("portal.clinics.profile.faq.useInAIAnswers")} checked={faqForm.useInAIAnswers} onChange={(v) => setFaqForm(p => ({ ...p, useInAIAnswers: v }))} />
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <Button onClick={handleAddFAQ} isLoading={saving}><Plus size={14} /> {t("portal.clinics.profile.faq.addFaq")}</Button>
                </div>
              </div>
            )}

            {faqs.length === 0 && !showFaqForm && (
              <div style={{ textAlign: "center", padding: 40, color: UI_COLORS.textMuted }}>
                <HelpCircle size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 13 }}>{t("portal.clinics.profile.faq.noFaqs")}</p>
              </div>
            )}

            {faqs.map((faq) => (
              <div key={faq.id} style={{ padding: 16, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 6 }}>{faq.question}</p>
                  <button onClick={() => { if (confirm(t("portal.clinics.profile.faq.deleteConfirm"))) deleteClinicFAQ(agencyId, clinicDocId, faq.id!); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={14} /></button>
                </div>
                <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>{faq.answer}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {faq.showOnPublicProfile && <Badge label="Public" variant="success" />}
                  {faq.useInAIAnswers && <Badge label="AI" variant="info" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ TAB: LOCATION ═══ */}
        {activeTab === "location" && (
          <div>
            <SectionTitle icon={<MapPin size={18} />} title={t("portal.clinics.profile.location.title")} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label={t("portal.clinics.profile.location.city")} value={loc.city} onChange={(e) => setLoc(p => ({ ...p, city: e.target.value }))} />
              <Input label={t("portal.clinics.profile.location.country")} value={loc.country} onChange={(e) => setLoc(p => ({ ...p, country: e.target.value }))} />
              <Input label={t("portal.clinics.profile.location.district")} value={loc.district || ""} onChange={(e) => setLoc(p => ({ ...p, district: e.target.value }))} />
              <Input label={t("portal.clinics.profile.location.nearestAirport")} value={loc.nearestAirport || ""} onChange={(e) => setLoc(p => ({ ...p, nearestAirport: e.target.value }))} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Input label={t("portal.clinics.profile.location.address")} value={loc.address || ""} onChange={(e) => setLoc(p => ({ ...p, address: e.target.value }))} />
              <Input label={t("portal.clinics.profile.location.mapLink")} value={loc.mapLink || ""} onChange={(e) => setLoc(p => ({ ...p, mapLink: e.target.value }))} placeholder="https://maps.google.com/..." />
            </div>
            <div style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 14 }}>
              <ToggleSwitch label={t("portal.clinics.profile.location.transferSupport")} checked={loc.transferSupport ?? false} onChange={(v) => setLoc(p => ({ ...p, transferSupport: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.location.accommodationSupport")} checked={loc.accommodationSupport ?? false} onChange={(v) => setLoc(p => ({ ...p, accommodationSupport: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.location.onlineConsultation")} checked={loc.onlineConsultation ?? false} onChange={(v) => setLoc(p => ({ ...p, onlineConsultation: v }))} />
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleSaveLocation} isLoading={saving}><Save size={14} /> {t("portal.buttons.saveChanges")}</Button>
            </div>
          </div>
        )}

        {/* ═══ TAB: QUOTE SETTINGS ═══ */}
        {activeTab === "quoteSettings" && (
          <div>
            <SectionTitle icon={<Settings size={18} />} title={t("portal.clinics.profile.quoteSettings.title")} />
            <div style={{ borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 14, marginBottom: 16 }}>
              <ToggleSwitch label={t("portal.clinics.profile.quoteSettings.quoteEnabled")} checked={qs.quoteEnabled ?? false} onChange={(v) => setQs(p => ({ ...p, quoteEnabled: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.quoteSettings.canReceiveLead")} checked={qs.canReceiveLead ?? true} onChange={(v) => setQs(p => ({ ...p, canReceiveLead: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.quoteSettings.consentRequired")} checked={qs.consentRequired ?? false} onChange={(v) => setQs(p => ({ ...p, consentRequired: v }))} />
              <ToggleSwitch label={t("portal.clinics.profile.quoteSettings.manualApprovalRequired")} checked={qs.manualApprovalRequired ?? false} onChange={(v) => setQs(p => ({ ...p, manualApprovalRequired: v }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label={t("portal.clinics.profile.quoteSettings.quoteContactEmail")} value={qs.quoteContactEmail || ""} onChange={(e) => setQs(p => ({ ...p, quoteContactEmail: e.target.value }))} placeholder="quotes@clinic.com" />
              <Input label={t("portal.clinics.profile.quoteSettings.defaultResponseSLA")} value={String(qs.defaultResponseSLA || "")} onChange={(e) => setQs(p => ({ ...p, defaultResponseSLA: Number(e.target.value) || undefined }))} placeholder="24" />
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleSaveQuoteSettings} isLoading={saving}><Save size={14} /> {t("portal.buttons.saveChanges")}</Button>
            </div>
          </div>
        )}

      </div>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 10000,
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 20px", borderRadius: 12,
          background: toast.type === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)", backdropFilter: "blur(8px)",
          animation: "profileToastIn 0.3s ease-out",
        }}>
          {toast.type === "success" ? <Check size={16} color="#10b981" /> : <X size={16} color="#ef4444" />}
          <span style={{ fontSize: 13, fontWeight: 600, color: toast.type === "success" ? "#10b981" : "#ef4444" }}>{toast.message}</span>
        </div>
      )}
      <style>{`@keyframes profileToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
