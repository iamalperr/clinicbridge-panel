"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToPricing, createPricing, updatePricing, deletePricing } from "@/lib/services/pricingService";
import { subscribeToTreatments } from "@/lib/services/treatmentService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { DollarSign, Plus, Search, Loader2, Edit2, Trash2, AlertCircle } from "lucide-react";
import type { ClinicTreatmentPrice, TreatmentCatalogItem } from "@/lib/types/matching";
import type { TreatmentCategory, AgencyClinic } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";
import { useI18n } from "@/lib/i18n-context";

const EMPTY_FORM = {
  treatmentId: "",
  treatmentName: "",
  subTreatmentName: "",
  priceGroup: "",
  duration: "",
  category: "dental" as TreatmentCategory,
  clinicId: "",
  clinicName: "",
  priceMin: "",
  priceMax: "",
  currency: "EUR",
  priceType: "package" as ClinicTreatmentPrice["priceType"],
  packageDetails: "",
  notes: "",
  status: "active" as "active" | "inactive",
};

export default function PricingPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [pricing, setPricing] = useState<ClinicTreatmentPrice[]>([]);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };
    unsubs.push(subscribeToPricing(agencyId, (d) => { setPricing(d); checkDone(); }));
    unsubs.push(subscribeToTreatments(agencyId, (d) => { setTreatments(d); checkDone(); }));
    unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

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

  const filtered = pricing.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.treatmentName.toLowerCase().includes(q) || (p.clinicName || "").toLowerCase().includes(q);
  });

  const globalPricing = filtered.filter((p) => !p.clinicId);
  const clinicPricing = filtered.filter((p) => !!p.clinicId);

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setShowModal(true); };

  const openEdit = (p: ClinicTreatmentPrice) => {
    setForm({
      treatmentId: p.treatmentId, treatmentName: p.treatmentName,
      subTreatmentName: (p as any).subTreatmentName || p.treatmentName || "",
      priceGroup: (p as any).priceGroup || "",
      duration: (p as any).duration || "",
      category: p.category,
      clinicId: p.clinicId || "", clinicName: p.clinicName || "",
      priceMin: p.priceMin.toString(), priceMax: p.priceMax.toString(),
      currency: p.currency, priceType: p.priceType,
      packageDetails: p.packageDetails || "", notes: p.notes || "", status: p.status,
    });
    setEditingId(p.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    // Validation
    const subName = form.subTreatmentName || form.treatmentName;
    if (!agencyId) {
      showToast("error", language === "tr" ? "Acenta bilgisi bulunamadı." : "Agency not found.");
      return;
    }
    if (!subName) {
      showToast("error", language === "tr" ? "Alt tedavi / işlem adı zorunludur." : "Sub treatment name is required.");
      return;
    }
    if (!form.priceMin || isNaN(Number(form.priceMin))) {
      showToast("error", language === "tr" ? "Min fiyat geçerli bir sayı olmalıdır." : "Min price must be a valid number.");
      return;
    }
    setSaving(true);
    try {
      // Build payload — use empty string instead of undefined to prevent Firestore errors
      const data: Record<string, any> = {
        treatmentId: form.treatmentId || subName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        treatmentName: subName,
        subTreatmentName: subName,
        category: form.category,
        priceMin: Number(form.priceMin),
        priceMax: Number(form.priceMax) || Number(form.priceMin),
        currency: form.currency || "EUR",
        priceType: form.priceType || "package",
        status: form.status || "active",
        showOnPublicProfile: true,
        allowQuoteRequest: true,
      };
      // Optional fields — only include if not empty
      if (form.priceGroup) data.priceGroup = form.priceGroup;
      if (form.duration) data.duration = form.duration;
      if (form.clinicId) data.clinicId = form.clinicId;
      if (form.clinicName) data.clinicName = form.clinicName;
      if (form.packageDetails) data.packageDetails = form.packageDetails;
      if (form.notes) data.notes = form.notes;

      console.log("[PricingPage] handleSave payload:", { agencyId, editingId, data });

      if (editingId) {
        await updatePricing(agencyId, editingId, data);
      } else {
        await createPricing(agencyId, data);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowModal(false);
      showToast("success", language === "tr" ? "Fiyat başarıyla kaydedildi." : "Pricing saved successfully.");
    } catch (err: any) {
      console.error("[PricingPage] Failed to save pricing:", err, { agencyId, form });
      const code = err?.code || "";
      let msg = language === "tr" ? "Fiyat eklenemedi. Lütfen tekrar deneyin." : "Failed to save pricing. Please try again.";
      if (code === "permission-denied" || code === "PERMISSION_DENIED") {
        msg = language === "tr" ? "Fiyat ekleme yetkiniz yok veya veritabanı izni engellendi." : "Permission denied.";
      } else if (code === "invalid-argument" || (err?.message || "").includes("undefined")) {
        msg = language === "tr" ? "Eksik veya geçersiz veri nedeniyle fiyat kaydedilemedi." : "Invalid data — check required fields.";
      }
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!agencyId || !confirm(t("portal.pricing.deleteConfirm"))) return;
    try {
      await deletePricing(agencyId, id);
      showToast("success", language === "tr" ? "Fiyat silindi." : "Pricing deleted.");
    } catch (err) {
      console.error("[PricingPage] Failed to delete pricing:", err);
      showToast("error", language === "tr" ? "Fiyat silinemedi." : "Failed to delete.");
    }
  };

  const selectTreatment = (tid: string) => {
    const tr = treatments.find((trt) => trt.id === tid);
    if (tr) setForm({ ...form, treatmentId: tr.id, treatmentName: tr.name, category: tr.category });
  };

  const selectClinic = (cid: string) => {
    if (!cid) { setForm({ ...form, clinicId: "", clinicName: "" }); return; }
    const c = clinics.find((cl) => cl.id === cid || cl.clinicId === cid);
    if (c) setForm({ ...form, clinicId: c.clinicId, clinicName: c.clinicName });
  };

  const priceTypeLabel = (pt: string) => {
    const map: Record<string, string> = {
      average: t("portal.pricing.average"),
      starting_from: t("portal.pricing.startingFrom"),
      package: t("portal.pricing.package"),
      per_unit: t("portal.pricing.perUnit"),
      per_tooth: language === "tr" ? "Diş Başına" : "Per Tooth",
      per_session: language === "tr" ? "Seans Başına" : "Per Session",
      per_jaw: language === "tr" ? "Çene Başına" : "Per Jaw",
    };
    return map[pt] || pt;
  };

  // selected clinic sub-treatments
  const selectedClinicSubTreatments = form.clinicId
    ? (clinics.find((c) => c.clinicId === form.clinicId || c.id === form.clinicId)?.subTreatments || [])
    : [];

  const renderPricingTable = (items: ClinicTreatmentPrice[], title: string, isClinicTable: boolean) => {
    if (items.length === 0) return null;
    const groups = new Map<string, ClinicTreatmentPrice[]>();
    items.forEach((p) => {
      const g = (p as any).priceGroup || "—";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    });
    return (
      <div style={{ background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={16} color="#10b981" />
          <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{title}</span>
          <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>({items.length})</span>
        </div>
        {Array.from(groups.entries()).map(([group, gItems]) => (
          <div key={group}>
            {group !== "—" && (
              <div style={{ padding: "8px 20px", background: "rgba(16,185,129,0.03)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5 }}>{group}</span>
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  {[t("portal.pricing.treatment"), ...(isClinicTable ? [t("portal.pricing.clinic")] : []), t("portal.pricing.priceRange"), language === "tr" ? "Süre" : "Duration", t("portal.pricing.type"), ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: UI_COLORS.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gItems.map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: UI_COLORS.textPrimary }}>{(p as any).subTreatmentName || p.treatmentName}</td>
                    {isClinicTable && <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>{p.clinicName}</td>}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontWeight: 700, color: "#10b981" }}>
                        {p.priceMin === p.priceMax ? `${p.priceMin} ${p.currency}` : `${p.priceMin}–${p.priceMax} ${p.currency}`}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>{(p as any).duration || "—"}</td>
                    <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>{priceTypeLabel(p.priceType)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(p)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: UI_COLORS.textMuted, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                          <Edit2 size={11} /> {t("portal.common.edit")}
                        </button>
                        <button onClick={() => handleDelete(p.id)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>{t("portal.pricing.title")}</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {pricing.length} {t("portal.pricing.countSummary")} — {globalPricing.length} {t("portal.pricing.global")}, {clinicPricing.length} {t("portal.pricing.clinicSpecific")}
          </p>
        </div>
        <Button onClick={openAdd}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> {t("portal.pricing.addPricing")}</span>
        </Button>
      </div>

      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
        <input type="text" placeholder={t("portal.pricing.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : pricing.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}` }}>
          <DollarSign size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>{t("portal.pricing.noPricing")}</h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            {t("portal.pricing.noPricingDesc")}
          </p>
        </div>
      ) : (
        <>
          {renderPricingTable(globalPricing, t("portal.pricing.globalPricing"), false)}
          {renderPricingTable(clinicPricing, t("portal.pricing.clinicPricing"), true)}
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? t("portal.pricing.editPricing") : t("portal.pricing.addPricing")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Clinic Selection */}
          <Select label={t("portal.pricing.clinicOptional")} value={form.clinicId} onChange={(e) => selectClinic(e.target.value)}
            options={[{ label: t("portal.pricing.globalAllClinics"), value: "" }, ...clinics.map((c) => ({ label: c.clinicName, value: c.clinicId }))]} />

          {/* Sub Treatment picker */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>{language === "tr" ? "Alt Tedavi / İşlem" : "Sub Treatment / Procedure"}</p>
            {selectedClinicSubTreatments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {selectedClinicSubTreatments.map((st) => {
                  const sel = form.subTreatmentName === st;
                  return (
                    <button key={st} type="button" onClick={() => setForm({ ...form, subTreatmentName: st })} style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${sel ? "#10b981" : UI_COLORS.border}`,
                      background: sel ? "rgba(16,185,129,0.1)" : "transparent",
                      color: sel ? "#10b981" : UI_COLORS.textSecondary,
                    }}>{st}</button>
                  );
                })}
              </div>
            )}
            <Input label="" value={form.subTreatmentName} onChange={(e) => setForm({ ...form, subTreatmentName: e.target.value })} placeholder="All-on-4 Diş İmplantları" />
          </div>

          {/* Price Group + Duration */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label={language === "tr" ? "Fiyat Grubu" : "Price Group"} value={form.priceGroup} onChange={(e) => setForm({ ...form, priceGroup: e.target.value })} placeholder={language === "tr" ? "İmplant, Taç, Kaplamalar..." : "Implant, Crowns, Veneers..."} />
            <Input label={language === "tr" ? "Süre" : "Duration"} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder={language === "tr" ? "3 Gün" : "3 Days"} />
          </div>

          {/* Price fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Input label={t("portal.pricing.priceMin")} value={form.priceMin} onChange={(e) => setForm({ ...form, priceMin: e.target.value })} placeholder="360" />
            <Input label={t("portal.pricing.priceMax")} value={form.priceMax} onChange={(e) => setForm({ ...form, priceMax: e.target.value })} placeholder="360" />
            <Select label={t("portal.pricing.currency")} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={[{ label: "EUR", value: "EUR" }, { label: "USD", value: "USD" }, { label: "GBP", value: "GBP" }, { label: "TRY", value: "TRY" }]} />
          </div>

          {/* Price Type */}
          <Select label={t("portal.pricing.priceType")} value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value as ClinicTreatmentPrice["priceType"] })}
            options={[
              { label: t("portal.pricing.package"), value: "package" },
              { label: t("portal.pricing.average"), value: "average" },
              { label: t("portal.pricing.startingFrom"), value: "starting_from" },
              { label: t("portal.pricing.perUnit"), value: "per_unit" },
              { label: language === "tr" ? "Diş Başına" : "Per Tooth", value: "per_tooth" },
              { label: language === "tr" ? "Seans Başına" : "Per Session", value: "per_session" },
              { label: language === "tr" ? "Çene Başına" : "Per Jaw", value: "per_jaw" },
            ]} />

          <Input label={t("portal.pricing.packageDetails")} value={form.packageDetails} onChange={(e) => setForm({ ...form, packageDetails: e.target.value })} placeholder={t("portal.pricing.packageDetailsPlaceholder")} />
          <Input label={t("portal.pricing.notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("portal.pricing.notesPlaceholder")} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t("portal.common.cancel")}</Button>
            <Button onClick={handleSave} isLoading={saving}>{editingId ? t("portal.common.saveChanges") : t("portal.pricing.addPricing")}</Button>
          </div>
        </div>
      </Modal>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: toast.type === "success" ? "#10b981" : "#ef4444",
          color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          animation: "slideUp 0.3s ease",
        }}>
          {toast.message}
        </div>
      )}
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
