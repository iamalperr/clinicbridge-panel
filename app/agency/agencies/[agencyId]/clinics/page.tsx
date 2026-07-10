"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import { useEffect, useState } from "react";
import {
  subscribeToAgencyClinics,
  addClinicToAgency,
  removeClinicFromAgency,
  updateAgencyClinic,
  getClinicBridgeClinics,
  subscribeToClinicPricing,
  addClinicPricing,
  deleteClinicPricing,
} from "@/lib/services/agencyService";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Building2, Plus, Trash2, Loader2, MapPin, Globe, Stethoscope,
  ExternalLink, Edit2, Shield, Star, Clock, Users2, DollarSign,
  Link2, ChevronRight, X, Check,
} from "lucide-react";
import type { AgencyClinic, TreatmentCategory, ClinicTreatmentPricing, PriceType } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

// ─── Clinic Type Options ────────────────────────────────────────────────────
const CLINIC_TYPE_OPTIONS = [
  "dental", "hair", "aesthetic", "ivf", "hospital", "medicalCenter", "other",
] as const;

const LANGUAGE_OPTIONS = ["en", "tr", "de", "ar", "es", "fr", "ru", "nl", "it"] as const;

// ─── Form Default ───────────────────────────────────────────────────────────
function emptyForm() {
  return {
    clinicId: "",
    clinicName: "",
    clinicType: "external" as "clinicbridge" | "external",
    category: "dental",
    branch: "",
    city: "",
    country: "",
    address: "",
    profileUrl: "",
    website: "",
    contactEmail: "",
    phone: "",
    whatsapp: "",
    shortDescription: "",
    longDescription: "",
    subTreatments: "",
    leadCapacity: "",
    responseSLA: "24",
    priorityScore: "80",
    targetCountries: "",
    treatmentCategories: [] as TreatmentCategory[],
    supportedLanguages: ["en", "tr"] as string[],
    quoteEnabled: true,
    quoteContactEmail: "",
    showInRecommendations: true,
    showPriceRange: true,
    showProfileLink: true,
  };
}

// ─── Toggle Chip ────────────────────────────────────────────────────────────
function ToggleChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
      background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
      color: selected ? "#10b981" : UI_COLORS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
    }}>{label}</button>
  );
}

// ─── Toggle Switch ──────────────────────────────────────────────────────────
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

// ─── Main Component ─────────────────────────────────────────────────────────
export default function AgencyClinicsPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [modalTab, setModalTab] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // ClinicBridge link mode
  const [cbClinics, setCbClinics] = useState<{ id: string; name: string; domain?: string; status?: string }[]>([]);
  const [cbLoading, setCbLoading] = useState(false);

  // Detail modal
  const [detailClinic, setDetailClinic] = useState<AgencyClinic | null>(null);
  const [detailPricing, setDetailPricing] = useState<ClinicTreatmentPricing[]>([]);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [pricingForm, setPricingForm] = useState({ treatmentName: "", priceMin: "", priceMax: "", currency: "EUR", priceType: "average" as PriceType, notes: "" });

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsub = subscribeToAgencyClinics(agencyId, (data) => { setClinics(data); setLoading(false); });
    return unsub;
  }, [agencyId]);

  // Subscribe to pricing when detail opens
  useEffect(() => {
    if (!detailClinic?.id || !agencyId) return;
    const unsub = subscribeToClinicPricing(agencyId, detailClinic.id, setDetailPricing);
    return unsub;
  }, [detailClinic?.id, agencyId]);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const openAdd = (type: "external" | "clinicbridge") => {
    setForm({ ...emptyForm(), clinicType: type });
    setEditingId(null);
    setModalTab(0);
    setShowAddModal(true);
    if (type === "clinicbridge") {
      setCbLoading(true);
      getClinicBridgeClinics().then(setCbClinics).finally(() => setCbLoading(false));
    }
  };

  const openEdit = (clinic: AgencyClinic) => {
    setForm({
      clinicId: clinic.clinicId,
      clinicName: clinic.clinicName,
      clinicType: clinic.clinicType || "external",
      category: clinic.category || "dental",
      branch: clinic.branch || "",
      city: clinic.location?.city || "",
      country: clinic.location?.country || "",
      address: clinic.location?.address || "",
      profileUrl: clinic.profileUrl || "",
      website: clinic.website || "",
      contactEmail: clinic.contactEmail || "",
      phone: clinic.phone || "",
      whatsapp: clinic.whatsapp || "",
      shortDescription: clinic.shortDescription || "",
      longDescription: clinic.longDescription || "",
      subTreatments: (clinic.subTreatments || []).join(", "),
      leadCapacity: clinic.leadCapacity ? String(clinic.leadCapacity) : "",
      responseSLA: clinic.responseSLA ? String(clinic.responseSLA) : "24",
      priorityScore: String(clinic.priority || 80),
      targetCountries: (clinic.targetPatientCountries || []).join(", "),
      treatmentCategories: clinic.treatmentCategories || [],
      supportedLanguages: clinic.supportedLanguages || ["en", "tr"],
      quoteEnabled: clinic.quoteEnabled ?? true,
      quoteContactEmail: clinic.quoteContactEmail || "",
      showInRecommendations: clinic.showInRecommendations ?? true,
      showPriceRange: clinic.showPriceRange ?? true,
      showProfileLink: clinic.showProfileLink ?? true,
    });
    setEditingId(clinic.id || null);
    setModalTab(0);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    setSaveError(null);

    // ── Validation ──
    if (!agencyId) {
      setSaveError(t("portal.clinics.error.noAgency") || "Agency ID not found.");
      return;
    }
    if (!form.clinicName.trim()) {
      setSaveError(t("portal.clinics.error.nameRequired") || "Clinic name is required.");
      setModalTab(0);
      return;
    }
    if (!form.city.trim() || !form.country.trim()) {
      setSaveError(t("portal.clinics.error.locationRequired") || "City and country are required.");
      setModalTab(0);
      return;
    }
    if (form.treatmentCategories.length === 0) {
      setSaveError(t("portal.clinics.error.categoryRequired") || "At least one treatment category is required.");
      setModalTab(1);
      return;
    }
    if (form.supportedLanguages.length === 0) {
      setSaveError(t("portal.clinics.error.languageRequired") || "At least one language is required.");
      setModalTab(1);
      return;
    }

    setSaving(true);
    const clinicSlug = form.clinicName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Build payload — Firestore rejects undefined values, so we only include non-empty optional fields
    const payload: Record<string, any> = {
      clinicId: form.clinicId || `ext_${Date.now()}`,
      clinicName: form.clinicName,
      clinicSlug,
      clinicType: form.clinicType,
      category: form.category,
      location: { city: form.city, country: form.country },
      supportedLanguages: form.supportedLanguages,
      treatmentCategories: form.treatmentCategories,
      subTreatments: form.subTreatments ? form.subTreatments.split(",").map(s => s.trim()).filter(Boolean) : [],
      targetPatientCountries: form.targetCountries ? form.targetCountries.split(",").map(s => s.trim()).filter(Boolean) : [],
      status: "active",
      priority: Number(form.priorityScore) || 80,
      responseSLA: Number(form.responseSLA) || 24,
      quoteEnabled: form.quoteEnabled,
      showInRecommendations: form.showInRecommendations,
      showPriceRange: form.showPriceRange,
      showProfileLink: form.showProfileLink,
    };

    // Only add optional fields if they have values (prevents Firestore undefined error)
    if (form.branch) payload.branch = form.branch;
    if (form.address) payload.location.address = form.address;
    if (form.profileUrl) payload.profileUrl = form.profileUrl;
    if (form.website) payload.website = form.website;
    if (form.contactEmail) payload.contactEmail = form.contactEmail;
    if (form.phone) payload.phone = form.phone;
    if (form.whatsapp) payload.whatsapp = form.whatsapp;
    if (form.shortDescription) payload.shortDescription = form.shortDescription;
    if (form.longDescription) payload.longDescription = form.longDescription;
    if (form.leadCapacity) payload.leadCapacity = Number(form.leadCapacity);
    if (form.quoteContactEmail) payload.quoteContactEmail = form.quoteContactEmail;

    console.log("[AgencyClinics] Saving with agencyId:", agencyId, "payload:", payload);

    try {
      if (editingId) {
        await updateAgencyClinic(agencyId, editingId, payload);
      } else {
        await addClinicToAgency(agencyId, payload as any);
      }
      setShowAddModal(false);
      setForm(emptyForm());
      setSaveError(null);
      setToast({ type: "success", message: t("portal.clinics.toast.success") || "Clinic added to agency." });
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      const errMsg = err?.message || err?.code || String(err);
      console.error("[AgencyClinics] Save failed:", err);
      console.error("[AgencyClinics] Error message:", errMsg);
      console.error("[AgencyClinics] agencyId:", agencyId);
      console.error("[AgencyClinics] Payload:", JSON.stringify(payload, null, 2));

      // Show specific error to user
      let userError = t("portal.clinics.toast.error") || "Failed to add clinic.";
      if (errMsg.includes("permission-denied") || errMsg.includes("PERMISSION_DENIED")) {
        userError = t("portal.clinics.error.permissionDenied") || "Permission denied. Check Firestore rules.";
      } else if (errMsg.includes("undefined")) {
        userError = t("portal.clinics.error.invalidData") || "Invalid data in payload.";
      } else if (errMsg.includes("not-found") || errMsg.includes("NOT_FOUND")) {
        userError = t("portal.clinics.error.agencyNotFound") || "Agency not found.";
      } else if (errMsg.includes("unavailable") || errMsg.includes("network")) {
        userError = t("portal.clinics.error.networkError") || "Network error. Please try again.";
      }
      setSaveError(`${userError} (${errMsg})`);
    }
    setSaving(false);
  };

  const handleRemove = async (docId: string) => {
    if (!agencyId || !confirm(t("portal.clinics.removeConfirm"))) return;
    try { await removeClinicFromAgency(agencyId, docId); } catch (err) { console.error(err); }
  };

  const toggleStatus = async (clinic: AgencyClinic) => {
    if (!agencyId || !clinic.id) return;
    try {
      await updateAgencyClinic(agencyId, clinic.id, { status: clinic.status === "active" ? "paused" : "active" });
    } catch (err) { console.error(err); }
  };

  const handleAddPricing = async () => {
    if (!agencyId || !detailClinic?.id || !pricingForm.treatmentName) return;
    setSaving(true);
    try {
      await addClinicPricing(agencyId, detailClinic.id, {
        agencyClinicId: detailClinic.id,
        treatmentName: pricingForm.treatmentName,
        priceMin: Number(pricingForm.priceMin) || 0,
        priceMax: Number(pricingForm.priceMax) || 0,
        currency: pricingForm.currency,
        priceType: pricingForm.priceType,
        notes: pricingForm.notes || undefined,
        status: "active",
      });
      setPricingForm({ treatmentName: "", priceMin: "", priceMax: "", currency: "EUR", priceType: "average", notes: "" });
      setShowPricingForm(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleDeletePricing = async (pricingId: string) => {
    if (!agencyId || !detailClinic?.id || !confirm(t("portal.clinics.pricing.deleteConfirm"))) return;
    try { await deleteClinicPricing(agencyId, detailClinic.id, pricingId); } catch (err) { console.error(err); }
  };

  const toggleCategory = (cat: TreatmentCategory) => {
    setForm((prev) => ({
      ...prev,
      treatmentCategories: prev.treatmentCategories.includes(cat)
        ? prev.treatmentCategories.filter((c) => c !== cat)
        : [...prev.treatmentCategories, cat],
    }));
  };

  const toggleLang = (lang: string) => {
    setForm((prev) => ({
      ...prev,
      supportedLanguages: prev.supportedLanguages.includes(lang)
        ? prev.supportedLanguages.filter((l) => l !== lang)
        : [...prev.supportedLanguages, lang],
    }));
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

  // ─── Tab components for modal ─────────────────────────────────────────
  const MODAL_TABS = [
    { key: "basic", label: t("portal.clinics.basicInfo") },
    { key: "treatments", label: t("portal.clinics.treatmentsAndLangs") },
    { key: "ai", label: t("portal.clinics.aiAndPricing") },
  ];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("portal.clinics.title")}</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {clinics.length} {t("portal.clinics.subtitle")}
          </p>
        </div>
        {clinics.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => openAdd("clinicbridge")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Link2 size={14} /> {t("portal.clinics.linkExisting")}</span>
            </Button>
            <Button onClick={() => openAdd("external")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> {t("portal.clinics.addClinic")}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {clinics.length === 0 && (
        <div style={{
          textAlign: "center", padding: 60, background: "var(--bg-card)",
          borderRadius: 16, border: `1px solid ${UI_COLORS.border}`,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
            background: "rgba(16, 185, 129, 0.08)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Building2 size={36} color="#10b981" style={{ opacity: 0.6 }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
            {t("portal.clinics.emptyTitle")}
          </h3>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, maxWidth: 440, margin: "0 auto 24px" }}>
            {t("portal.clinics.emptyDesc")}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Button onClick={() => openAdd("external")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> {t("portal.clinics.addClinic")}</span>
            </Button>
            <Button variant="secondary" onClick={() => openAdd("clinicbridge")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Link2 size={14} /> {t("portal.clinics.linkExisting")}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Clinic Cards */}
      {clinics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {clinics.map((clinic) => (
            <div
              key={clinic.id || clinic.clinicId}
              style={{
                background: "var(--bg-card)", borderRadius: 14,
                border: `1px solid ${UI_COLORS.border}`, overflow: "hidden",
                transition: "box-shadow 0.2s, border-color 0.2s", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.3)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(16, 185, 129, 0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = UI_COLORS.border; e.currentTarget.style.boxShadow = "none"; }}
              onClick={() => setDetailClinic(clinic)}
            >
              {/* Card Header */}
              <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: clinic.status === "active" ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Building2 size={20} color={clinic.status === "active" ? "#10b981" : "#94a3b8"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14.5, fontWeight: 700, color: UI_COLORS.textPrimary }}>{clinic.clinicName}</p>
                  {clinic.category && (
                    <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>
                      {t(`portal.clinics.clinicTypes.${clinic.category}`) !== `portal.clinics.clinicTypes.${clinic.category}` ? t(`portal.clinics.clinicTypes.${clinic.category}`) : clinic.category}
                    </p>
                  )}
                </div>
                <Badge
                  label={clinic.status === "active" ? t("portal.status.active") : t("portal.status.paused")}
                  variant={clinic.status === "active" ? "success" : "default"} dot
                />
              </div>

              {/* Card Meta */}
              <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: UI_COLORS.textSecondary }}>
                  <MapPin size={12} /> {clinic.location?.city}{clinic.location?.country ? `, ${clinic.location.country}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: UI_COLORS.textSecondary }}>
                  <Globe size={12} /> {(clinic.supportedLanguages || []).map(l => l.toUpperCase()).join(", ") || "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: UI_COLORS.textSecondary }}>
                  <Stethoscope size={12} /> {(clinic.treatmentCategories || []).map(catLabel).join(", ") || "—"}
                </div>
                {clinic.profileUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10b981" }}>
                    <ExternalLink size={12} />
                    <a href={clinic.profileUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#10b981", textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}>
                      FeelinHealthy Profile
                    </a>
                  </div>
                )}
              </div>

              {/* Card Stats */}
              <div style={{
                padding: "10px 20px", borderTop: `1px solid ${UI_COLORS.border}`,
                display: "flex", gap: 16, fontSize: 11.5, color: UI_COLORS.textMuted,
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Star size={11} /> {clinic.priority || "—"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={11} /> {clinic.responseSLA ? `${clinic.responseSLA}h` : "—"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Users2 size={11} /> {clinic.leadCapacity ? `${clinic.leadCapacity}/d` : "—"}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: UI_COLORS.textMuted, opacity: 0.5 }}>
                  {clinic.clinicType === "clinicbridge" ? "CB" : "EXT"}
                </span>
              </div>

              {/* Card Actions */}
              <div style={{
                padding: "10px 20px", borderTop: `1px solid ${UI_COLORS.border}`,
                display: "flex", gap: 6, justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(clinic); }} style={{
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                    background: "transparent", color: UI_COLORS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Edit2 size={12} /> {t("portal.clinics.edit")}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleStatus(clinic); }} style={{
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                    background: "transparent", color: UI_COLORS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>
                    {clinic.status === "active" ? t("portal.clinics.pause") : t("portal.clinics.activate")}
                  </button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); clinic.id && handleRemove(clinic.id); }} style={{
                  padding: "6px 10px", borderRadius: 6,
                  border: "1px solid rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.05)",
                  color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ADD / EDIT CLINIC MODAL ═══ */}
      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={editingId ? t("portal.clinics.edit") : form.clinicType === "clinicbridge" ? t("portal.clinics.linkClinicBridge") : t("portal.clinics.createExternal")}
        >
          {/* Modal Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${UI_COLORS.border}`, paddingBottom: -1 }}>
            {MODAL_TABS.map((tab, i) => (
              <button key={tab.key} type="button" onClick={() => setModalTab(i)} style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: "none", borderBottom: `2px solid ${modalTab === i ? "#10b981" : "transparent"}`,
                background: "transparent", color: modalTab === i ? "#10b981" : UI_COLORS.textSecondary,
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
            {/* TAB 0: Basic Info */}
            {modalTab === 0 && (
              <>
                {/* Clinic Type Toggle (only for new) */}
                {!editingId && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["clinicbridge", "external"] as const).map((type) => (
                      <button key={type} type="button" onClick={() => {
                        setForm((p) => ({ ...p, clinicType: type }));
                        if (type === "clinicbridge" && cbClinics.length === 0) {
                          setCbLoading(true);
                          getClinicBridgeClinics().then(setCbClinics).finally(() => setCbLoading(false));
                        }
                      }} style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${form.clinicType === type ? "#10b981" : UI_COLORS.border}`,
                        background: form.clinicType === type ? "rgba(16, 185, 129, 0.08)" : "transparent",
                        color: form.clinicType === type ? "#10b981" : UI_COLORS.textSecondary,
                      }}>
                        {type === "clinicbridge" ? `🔗 ${t("portal.clinics.linkClinicBridge")}` : `➕ ${t("portal.clinics.createExternal")}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* ClinicBridge Selector */}
                {form.clinicType === "clinicbridge" && !editingId && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>
                      {t("portal.clinics.selectClinicBridge")}
                    </p>
                    {cbLoading ? (
                      <div style={{ padding: 20, textAlign: "center" }}>
                        <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
                      </div>
                    ) : cbClinics.length === 0 ? (
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted, padding: 12 }}>{t("portal.clinics.noClinicBridge")}</p>
                    ) : (
                      <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
                        {cbClinics.map((cb) => {
                          const alreadyLinked = clinics.some((c) => c.clinicId === cb.id && c.clinicType === "clinicbridge");
                          const isSelected = form.clinicId === cb.id;
                          return (
                            <button
                              key={cb.id}
                              type="button"
                              disabled={alreadyLinked}
                              onClick={() => {
                                if (!alreadyLinked) {
                                  setForm((p) => ({ ...p, clinicId: cb.id, clinicName: p.clinicName || cb.name }));
                                }
                              }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                                border: "none", borderBottom: `1px solid ${UI_COLORS.border}`,
                                background: isSelected ? "rgba(16, 185, 129, 0.06)" : alreadyLinked ? "rgba(148, 163, 184, 0.04)" : "transparent",
                                color: alreadyLinked ? UI_COLORS.textMuted : isSelected ? "#10b981" : UI_COLORS.textPrimary,
                                fontSize: 13, cursor: alreadyLinked ? "not-allowed" : "pointer", textAlign: "left",
                                opacity: alreadyLinked ? 0.6 : 1,
                              }}
                            >
                              {isSelected && !alreadyLinked && <Check size={14} />}
                              <Building2 size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, flex: 1 }}>{cb.name}</span>
                              {cb.domain && <span style={{ fontSize: 11, color: UI_COLORS.textMuted }}>{cb.domain}</span>}
                              {alreadyLinked && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#94a3b8",
                                  padding: "2px 8px", borderRadius: 4,
                                  background: "rgba(148, 163, 184, 0.1)", border: "1px solid rgba(148, 163, 184, 0.15)",
                                  whiteSpace: "nowrap",
                                }}>
                                  {language === "tr" ? "Zaten bağlı" : "Already linked"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <Input label={t("portal.clinics.clinicName")} value={form.clinicName} onChange={(e) => setForm((p) => ({ ...p, clinicName: e.target.value }))} placeholder="e.g., Hospitadent Dental Group Pendik" />

                {/* Clinic Type Dropdown */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.clinicType")}</p>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
                      border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: UI_COLORS.textPrimary,
                    }}
                  >
                    {CLINIC_TYPE_OPTIONS.map((ct) => (
                      <option key={ct} value={ct}>{t(`portal.clinics.clinicTypes.${ct}`)}</option>
                    ))}
                  </select>
                </div>

                <Input label={t("portal.clinics.profileUrl")} value={form.profileUrl} onChange={(e) => setForm((p) => ({ ...p, profileUrl: e.target.value }))} placeholder={t("portal.clinics.profileUrlPlaceholder")} />
                <Input label={t("portal.clinics.website")} value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />

                <div style={{ display: "flex", gap: 12 }}>
                  <Input label={t("portal.clinics.city")} value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="Istanbul" />
                  <Input label={t("portal.clinics.country")} value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} placeholder="Turkey" />
                </div>
                <Input label={`${t("portal.clinics.address")} (optional)`} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

                <div style={{ display: "flex", gap: 12 }}>
                  <Input label={t("portal.clinics.contactEmail")} value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="info@clinic.com" />
                  <Input label={`${t("portal.clinics.phone")} (optional)`} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+90..." />
                </div>

                <Input label={t("portal.clinics.shortDesc")} value={form.shortDescription} onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))} />
              </>
            )}

            {/* TAB 1: Treatments & Languages */}
            {modalTab === 1 && (
              <>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.clinics.treatmentCategories")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => (
                      <ToggleChip key={key} label={language === "tr" ? val.tr : val.en} selected={form.treatmentCategories.includes(key as TreatmentCategory)} onClick={() => toggleCategory(key as TreatmentCategory)} />
                    ))}
                  </div>
                </div>

                <Input label={t("portal.clinics.subTreatments")} value={form.subTreatments} onChange={(e) => setForm((p) => ({ ...p, subTreatments: e.target.value }))} placeholder={t("portal.clinics.subTreatmentsPlaceholder")} />

                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.clinics.supportedLanguages")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <ToggleChip key={lang} label={lang.toUpperCase()} selected={form.supportedLanguages.includes(lang)} onClick={() => toggleLang(lang)} />
                    ))}
                  </div>
                </div>

                <Input label={`${t("portal.clinics.targetCountries")} (optional)`} value={form.targetCountries} onChange={(e) => setForm((p) => ({ ...p, targetCountries: e.target.value }))} placeholder="Germany, UK, Netherlands" />
              </>
            )}

            {/* TAB 2: AI & Pricing */}
            {modalTab === 2 && (
              <>
                <div style={{ display: "flex", gap: 12 }}>
                  <Input label={t("portal.clinics.priorityScore")} value={form.priorityScore} onChange={(e) => setForm((p) => ({ ...p, priorityScore: e.target.value }))} placeholder="0–100" />
                  <Input label={t("portal.clinics.responseSla")} value={form.responseSLA} onChange={(e) => setForm((p) => ({ ...p, responseSLA: e.target.value }))} placeholder="24" />
                  <Input label={t("portal.clinics.leadCapacity")} value={form.leadCapacity} onChange={(e) => setForm((p) => ({ ...p, leadCapacity: e.target.value }))} placeholder="20" />
                </div>

                <div style={{ borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, padding: 14 }}>
                  <ToggleSwitch label={t("portal.clinics.showInRecommendations")} checked={form.showInRecommendations} onChange={(v) => setForm((p) => ({ ...p, showInRecommendations: v }))} />
                  <ToggleSwitch label={t("portal.clinics.showPriceRange")} checked={form.showPriceRange} onChange={(v) => setForm((p) => ({ ...p, showPriceRange: v }))} />
                  <ToggleSwitch label={t("portal.clinics.showProfileLink")} checked={form.showProfileLink} onChange={(v) => setForm((p) => ({ ...p, showProfileLink: v }))} />
                  <ToggleSwitch label={t("portal.clinics.quoteEnabled")} checked={form.quoteEnabled} onChange={(v) => setForm((p) => ({ ...p, quoteEnabled: v }))} />
                </div>

                {form.quoteEnabled && (
                  <Input label={t("portal.clinics.quoteContactEmail")} value={form.quoteContactEmail} onChange={(e) => setForm((p) => ({ ...p, quoteContactEmail: e.target.value }))} placeholder="quotes@clinic.com" />
                )}
              </>
            )}
          </div>

          {/* Validation Error */}
          {saveError && (
            <div style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: 10, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", display: "flex", alignItems: "center", gap: 8 }}>
              <X size={14} color="#ef4444" />
              <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>{saveError}</span>
            </div>
          )}

          {/* Modal Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${UI_COLORS.border}` }}>
            <div style={{ display: "flex", gap: 6 }}>
              {modalTab > 0 && (
                <Button variant="secondary" onClick={() => setModalTab(modalTab - 1)}>←</Button>
              )}
              {modalTab < 2 && (
                <Button variant="secondary" onClick={() => setModalTab(modalTab + 1)}>→</Button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => { setShowAddModal(false); setSaveError(null); }}>{t("portal.buttons.cancel")}</Button>
              <Button onClick={handleSave} isLoading={saving} disabled={saving}>
                {saving ? (t("portal.clinics.saving") || "Saving...") : editingId ? t("portal.buttons.saveChanges") : t("portal.clinics.addToAgency")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ CLINIC DETAIL MODAL ═══ */}
      {detailClinic && (
        <Modal
          isOpen={!!detailClinic}
          onClose={() => { setDetailClinic(null); setShowPricingForm(false); }}
          title={detailClinic.clinicName}
        >
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {/* General Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: t("portal.clinics.city"), value: detailClinic.location?.city },
                { label: t("portal.clinics.country"), value: detailClinic.location?.country },
                { label: t("portal.clinics.clinicType"), value: detailClinic.category ? t(`portal.clinics.clinicTypes.${detailClinic.category}`) : "—" },
                { label: t("portal.clinics.website"), value: detailClinic.website },
                { label: t("portal.clinics.contactEmail"), value: detailClinic.contactEmail },
                { label: t("portal.clinics.phone"), value: detailClinic.phone },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>{value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Profile URL */}
            {detailClinic.profileUrl && (
              <a href={detailClinic.profileUrl} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
                background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)",
                color: "#10b981", fontSize: 13, fontWeight: 600, textDecoration: "none", marginBottom: 20,
              }}>
                <ExternalLink size={14} /> FeelinHealthy Profile →
              </a>
            )}

            {/* Short Description */}
            {detailClinic.shortDescription && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 4 }}>{t("portal.clinics.shortDesc")}</p>
                <p style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>{detailClinic.shortDescription}</p>
              </div>
            )}

            {/* Treatment Categories & Languages */}
            <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.treatmentCategories")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(detailClinic.treatmentCategories || []).map((c) => (
                    <Badge key={c} label={catLabel(c)} variant="info" />
                  ))}
                  {(detailClinic.treatmentCategories || []).length === 0 && <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>—</span>}
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.supportedLanguages")}</p>
                <div style={{ display: "flex", gap: 4 }}>
                  {(detailClinic.supportedLanguages || []).map((l) => (
                    <Badge key={l} label={l.toUpperCase()} variant="default" />
                  ))}
                </div>
              </div>
            </div>

            {/* Sub-Treatments */}
            {detailClinic.subTreatments && detailClinic.subTreatments.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.subTreatments")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {detailClinic.subTreatments.map((st) => (
                    <Badge key={st} label={st} variant="default" />
                  ))}
                </div>
              </div>
            )}

            {/* AI Matching Stats */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20,
              padding: 14, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
            }}>
              {[
                { label: t("portal.clinics.priorityScore"), value: detailClinic.priority, icon: <Star size={14} /> },
                { label: t("portal.clinics.responseSla"), value: detailClinic.responseSLA ? `${detailClinic.responseSLA}h` : "—", icon: <Clock size={14} /> },
                { label: t("portal.clinics.leadCapacity"), value: detailClinic.leadCapacity ? `${detailClinic.leadCapacity}/d` : "—", icon: <Users2 size={14} /> },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: UI_COLORS.textMuted, marginBottom: 4 }}>
                    {icon} <span style={{ fontSize: 11 }}>{label}</span>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: UI_COLORS.textPrimary }}>{value ?? "—"}</p>
                </div>
              ))}
            </div>

            {/* AI Toggles */}
            <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, marginBottom: 20 }}>
              {[
                { label: t("portal.clinics.showInRecommendations"), value: detailClinic.showInRecommendations },
                { label: t("portal.clinics.showPriceRange"), value: detailClinic.showPriceRange },
                { label: t("portal.clinics.showProfileLink"), value: detailClinic.showProfileLink },
                { label: t("portal.clinics.quoteEnabled"), value: detailClinic.quoteEnabled },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span style={{ color: UI_COLORS.textSecondary }}>{label}</span>
                  <Badge label={value ? "✓" : "✗"} variant={value ? "success" : "default"} />
                </div>
              ))}
            </div>

            {/* ─── Pricing Section ─── */}
            <div style={{ borderTop: `1px solid ${UI_COLORS.border}`, paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                  <DollarSign size={16} /> {t("portal.clinics.pricing.title")}
                </h3>
                <button onClick={() => setShowPricingForm(!showPricingForm)} style={{
                  padding: "5px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                  background: "transparent", color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {showPricingForm ? <X size={12} /> : <Plus size={12} />}
                  {showPricingForm ? t("portal.buttons.cancel") : t("portal.clinics.pricing.addPricing")}
                </button>
              </div>

              {/* Add Pricing Form */}
              {showPricingForm && (
                <div style={{ padding: 14, borderRadius: 10, border: `1px solid rgba(16, 185, 129, 0.2)`, background: "rgba(16, 185, 129, 0.02)", marginBottom: 12 }}>
                  <Input label={t("portal.clinics.pricing.treatmentName")} value={pricingForm.treatmentName} onChange={(e) => setPricingForm((p) => ({ ...p, treatmentName: e.target.value }))} placeholder="e.g., Dental Implant" />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Input label={t("portal.clinics.pricing.priceMin")} value={pricingForm.priceMin} onChange={(e) => setPricingForm((p) => ({ ...p, priceMin: e.target.value }))} placeholder="400" />
                    <Input label={t("portal.clinics.pricing.priceMax")} value={pricingForm.priceMax} onChange={(e) => setPricingForm((p) => ({ ...p, priceMax: e.target.value }))} placeholder="900" />
                    <div style={{ minWidth: 90 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.pricing.currency")}</p>
                      <select value={pricingForm.currency} onChange={(e) => setPricingForm((p) => ({ ...p, currency: e.target.value }))}
                        style={{ width: "100%", padding: "10px 8px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary }}>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="TRY">TRY</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>{t("portal.clinics.pricing.priceType")}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["average", "starting_from", "package", "per_unit"] as PriceType[]).map((pt) => (
                        <ToggleChip key={pt} label={t(`portal.clinics.pricing.${pt === "starting_from" ? "startingFrom" : pt === "per_unit" ? "perUnit" : pt}`)} selected={pricingForm.priceType === pt} onClick={() => setPricingForm((p) => ({ ...p, priceType: pt }))} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <Button onClick={handleAddPricing} disabled={!pricingForm.treatmentName || saving}>
                      {saving ? t("portal.clinics.saving") : t("portal.clinics.pricing.addPricing")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Pricing Table */}
              {detailPricing.length === 0 && !showPricingForm ? (
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, textAlign: "center", padding: 20 }}>
                  {t("portal.clinics.pricing.noPricing")}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detailPricing.map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                    }}>
                      <DollarSign size={14} color="#10b981" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, flex: 1 }}>{p.treatmentName}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
                        {p.priceMin}–{p.priceMax} {p.currency}
                      </span>
                      <Badge label={t(`portal.clinics.pricing.${p.priceType === "starting_from" ? "startingFrom" : p.priceType === "per_unit" ? "perUnit" : p.priceType}`)} variant="default" />
                      <button onClick={() => p.id && handleDeletePricing(p.id)} style={{
                        padding: "4px 6px", borderRadius: 4, border: "none",
                        background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", cursor: "pointer",
                      }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detail Modal Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${UI_COLORS.border}` }}>
            <Button variant="secondary" onClick={() => { openEdit(detailClinic); setDetailClinic(null); }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Edit2 size={14} /> {t("portal.clinics.edit")}</span>
            </Button>
            <Button variant="secondary" onClick={() => { setDetailClinic(null); setShowPricingForm(false); }}>
              {t("portal.buttons.cancel")}
            </Button>
          </div>
        </Modal>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 10000,
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 20px", borderRadius: 12,
          background: toast.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          backdropFilter: "blur(8px)",
          animation: "toastSlideUp 0.3s ease-out",
        }}>
          {toast.type === "success"
            ? <Check size={16} color="#10b981" />
            : <X size={16} color="#ef4444" />
          }
          <span style={{ fontSize: 13, fontWeight: 600, color: toast.type === "success" ? "#10b981" : "#ef4444" }}>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 8, display: "flex" }}><X size={14} color={UI_COLORS.textMuted} /></button>
        </div>
      )}
      <style>{`@keyframes toastSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
