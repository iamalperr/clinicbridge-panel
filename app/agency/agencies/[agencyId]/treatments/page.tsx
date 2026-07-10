"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToTreatments, createTreatment, updateTreatment, deleteTreatment } from "@/lib/services/treatmentService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Stethoscope, Plus, Search, Loader2, Edit2, Trash2, AlertCircle, DollarSign,
} from "lucide-react";
import type { TreatmentCatalogItem } from "@/lib/types/matching";
import type { TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";
import { useI18n } from "@/lib/i18n-context";

const EMPTY_FORM = {
  name: "",
  slug: "",
  category: "dental" as TreatmentCategory,
  description: "",
  avgPriceMin: "",
  avgPriceMax: "",
  currency: "EUR",
  priceType: "average" as TreatmentCatalogItem["priceType"],
  duration: "",
  recoveryTime: "",
  requiredDocuments: "",
  status: "active" as "active" | "inactive",
};

export default function TreatmentsPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsub = subscribeToTreatments(agencyId, (data) => {
      setTreatments(data);
      setLoading(false);
    });
    return () => unsub();
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

  const filtered = treatments.filter((t) => {
    if (filterCat !== "all" && t.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.category.includes(q);
    }
    return true;
  });

  const grouped = filtered.reduce((acc, t) => {
    const cat = t.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {} as Record<string, TreatmentCatalogItem[]>);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (t: TreatmentCatalogItem) => {
    setForm({
      name: t.name,
      slug: t.slug,
      category: t.category,
      description: t.description || "",
      avgPriceMin: t.avgPriceMin?.toString() || "",
      avgPriceMax: t.avgPriceMax?.toString() || "",
      currency: t.currency || "EUR",
      priceType: t.priceType || "average",
      duration: t.duration || "",
      recoveryTime: t.recoveryTime || "",
      requiredDocuments: (t.requiredDocuments || []).join(", "),
      status: t.status,
    });
    setEditingId(t.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!agencyId || !form.name) return;
    setSaving(true);
    try {
      const data: any = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        category: form.category,
        description: form.description,
        avgPriceMin: form.avgPriceMin ? Number(form.avgPriceMin) : undefined,
        avgPriceMax: form.avgPriceMax ? Number(form.avgPriceMax) : undefined,
        currency: form.currency,
        priceType: form.priceType,
        duration: form.duration,
        recoveryTime: form.recoveryTime,
        requiredDocuments: form.requiredDocuments.split(",").map(d => d.trim()).filter(Boolean),
        status: form.status,
      };
      if (editingId) {
        await updateTreatment(agencyId, editingId, data);
      } else {
        await createTreatment(agencyId, data);
      }
      setShowModal(false);
    } catch (err) {
      console.error("Failed to save treatment:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!agencyId || !confirm(t("portal.treatments.deleteConfirm"))) return;
    try { await deleteTreatment(agencyId, id); } catch (err) { console.error(err); }
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            {t("portal.treatments.title")}
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {treatments.length} {t("portal.treatments.countSummary")} ({Object.keys(grouped).length})
          </p>
        </div>
        <Button onClick={openAdd}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> {t("portal.treatments.addTreatment")}</span>
        </Button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
          <input type="text" placeholder={t("portal.treatments.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, cursor: "pointer" }}>
          <option value="all">{t("portal.treatments.allCategories")}</option>
          {Object.entries(TREATMENT_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{language === "tr" ? v.tr : v.en}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}` }}>
          <Stethoscope size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>
            {search ? t("portal.treatments.noTreatmentsSearch") : t("portal.treatments.noTreatments")}
          </h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            {t("portal.treatments.noTreatmentsDesc")}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Stethoscope size={16} color="#10b981" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                    {catLabel(cat)}
                  </span>
                  <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>({items.length})</span>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                    {[t("portal.treatments.treatment"), t("portal.treatments.priceRange"), t("portal.treatments.duration"), t("portal.treatments.recovery"), t("portal.treatments.status"), ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: UI_COLORS.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((t_item) => (
                    <tr key={t_item.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontWeight: 600, color: UI_COLORS.textPrimary }}>{t_item.name}</span>
                        {t_item.description && <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 2 }}>{t_item.description}</p>}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {t_item.avgPriceMin || t_item.avgPriceMax ? (
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>
                            {t_item.avgPriceMin}–{t_item.avgPriceMax} {t_item.currency}
                          </span>
                        ) : <span style={{ color: UI_COLORS.textMuted }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>{t_item.duration || "—"}</td>
                      <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>{t_item.recoveryTime || "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <Badge label={t_item.status === "active" ? t("portal.common.active") : t("portal.common.inactive")} variant={t_item.status === "active" ? "success" : "warning"} />
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEdit(t_item)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: UI_COLORS.textMuted, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                            <Edit2 size={11} /> {t("portal.common.edit")}
                          </button>
                          <button onClick={() => handleDelete(t_item.id)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: "#ef4444", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
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
      )}

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? t("portal.treatments.editTreatment") : t("portal.treatments.addTreatment")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input label={t("portal.treatments.treatmentName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dental Implant" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Select label={t("portal.treatments.category")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TreatmentCategory })}
              options={Object.entries(TREATMENT_CATEGORIES).map(([k, v]) => ({ label: language === "tr" ? v.tr : v.en, value: k }))} />
            <Select label={t("portal.treatments.status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
              options={[{ label: t("portal.common.active"), value: "active" }, { label: t("portal.common.inactive"), value: "inactive" }]} />
          </div>
          <Input label={t("portal.treatments.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("portal.treatments.descPlaceholder")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Input label={t("portal.treatments.priceMin")} value={form.avgPriceMin} onChange={(e) => setForm({ ...form, avgPriceMin: e.target.value })} placeholder="400" />
            <Input label={t("portal.treatments.priceMax")} value={form.avgPriceMax} onChange={(e) => setForm({ ...form, avgPriceMax: e.target.value })} placeholder="900" />
            <Select label={t("portal.treatments.currency")} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={[{ label: "EUR", value: "EUR" }, { label: "USD", value: "USD" }, { label: "GBP", value: "GBP" }, { label: "TRY", value: "TRY" }]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label={t("portal.treatments.duration")} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder={t("portal.treatments.durationPlaceholder")} />
            <Input label={t("portal.treatments.recovery")} value={form.recoveryTime} onChange={(e) => setForm({ ...form, recoveryTime: e.target.value })} placeholder={t("portal.treatments.recoveryPlaceholder")} />
          </div>
          <Input label={t("portal.treatments.requiredDocs")} value={form.requiredDocuments} onChange={(e) => setForm({ ...form, requiredDocuments: e.target.value })} placeholder={t("portal.treatments.requiredDocsPlaceholder")} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t("portal.common.cancel")}</Button>
            <Button onClick={handleSave} isLoading={saving}>{editingId ? t("portal.common.saveChanges") : t("portal.treatments.addTreatment")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
