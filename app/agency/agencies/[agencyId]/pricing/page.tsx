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

const EMPTY_FORM = {
  treatmentId: "",
  treatmentName: "",
  category: "dental" as TreatmentCategory,
  clinicId: "",
  clinicName: "",
  priceMin: "",
  priceMax: "",
  currency: "EUR",
  priceType: "average" as ClinicTreatmentPrice["priceType"],
  packageDetails: "",
  notes: "",
  status: "active" as "active" | "inactive",
};

export default function PricingPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();

  const [pricing, setPricing] = useState<ClinicTreatmentPrice[]>([]);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>No Agency Selected</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          {isSuperAdmin(profile?.role) ? "Select an agency to manage treatment pricing." : "Your account is not linked to any agency."}
        </p>
      </div>
    );
  }

  const filtered = pricing.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.treatmentName.toLowerCase().includes(q) || (p.clinicName || "").toLowerCase().includes(q);
  });

  // Group by: global (no clinicId) vs clinic-specific
  const globalPricing = filtered.filter((p) => !p.clinicId);
  const clinicPricing = filtered.filter((p) => !!p.clinicId);

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setShowModal(true); };

  const openEdit = (p: ClinicTreatmentPrice) => {
    setForm({
      treatmentId: p.treatmentId, treatmentName: p.treatmentName, category: p.category,
      clinicId: p.clinicId || "", clinicName: p.clinicName || "",
      priceMin: p.priceMin.toString(), priceMax: p.priceMax.toString(),
      currency: p.currency, priceType: p.priceType,
      packageDetails: p.packageDetails || "", notes: p.notes || "", status: p.status,
    });
    setEditingId(p.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!agencyId || !form.treatmentName || !form.priceMin) return;
    setSaving(true);
    try {
      const data: any = {
        treatmentId: form.treatmentId || form.treatmentName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        treatmentName: form.treatmentName,
        category: form.category,
        clinicId: form.clinicId || undefined,
        clinicName: form.clinicName || undefined,
        priceMin: Number(form.priceMin),
        priceMax: Number(form.priceMax),
        currency: form.currency,
        priceType: form.priceType,
        packageDetails: form.packageDetails || undefined,
        notes: form.notes || undefined,
        status: form.status,
      };
      if (editingId) { await updatePricing(agencyId, editingId, data); }
      else { await createPricing(agencyId, data); }
      setShowModal(false);
    } catch (err) { console.error("Failed to save pricing:", err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!agencyId || !confirm("Delete this pricing entry?")) return;
    try { await deletePricing(agencyId, id); } catch (err) { console.error(err); }
  };

  const selectTreatment = (tid: string) => {
    const t = treatments.find((tr) => tr.id === tid);
    if (t) setForm({ ...form, treatmentId: t.id, treatmentName: t.name, category: t.category });
  };

  const selectClinic = (cid: string) => {
    if (!cid) { setForm({ ...form, clinicId: "", clinicName: "" }); return; }
    const c = clinics.find((cl) => cl.id === cid || cl.clinicId === cid);
    if (c) setForm({ ...form, clinicId: c.clinicId, clinicName: c.clinicName });
  };

  const renderPricingTable = (items: ClinicTreatmentPrice[], title: string) => {
    if (items.length === 0) return null;
    return (
      <div style={{ background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={16} color="#10b981" />
          <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{title}</span>
          <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>({items.length})</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
              {["Treatment", "Category", title.includes("Clinic") ? "Clinic" : "", "Price Range", "Type", "Status", ""].filter(Boolean).map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: UI_COLORS.textMuted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: UI_COLORS.textPrimary }}>{p.treatmentName}</td>
                <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>
                  {TREATMENT_CATEGORIES[p.category]?.en || p.category}
                </td>
                {title.includes("Clinic") && <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>{p.clinicName}</td>}
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>{p.priceMin}–{p.priceMax} {p.currency}</span>
                </td>
                <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>{p.priceType.replace("_", " ")}</td>
                <td style={{ padding: "12px 14px" }}><Badge label={p.status === "active" ? "Active" : "Inactive"} variant={p.status === "active" ? "success" : "warning"} /></td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(p)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: UI_COLORS.textMuted, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                      <Edit2 size={11} /> Edit
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
    );
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>Treatment Pricing</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {pricing.length} pricing entries — {globalPricing.length} global, {clinicPricing.length} clinic-specific
          </p>
        </div>
        <Button onClick={openAdd}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Add Pricing</span>
        </Button>
      </div>

      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
        <input type="text" placeholder="Search pricing..." value={search} onChange={(e) => setSearch(e.target.value)}
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
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>No pricing configured</h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            Add treatment pricing to enable AI price range responses.
          </p>
        </div>
      ) : (
        <>
          {renderPricingTable(globalPricing, "Global Treatment Pricing")}
          {renderPricingTable(clinicPricing, "Clinic-Specific Pricing")}
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Pricing" : "Add Pricing"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {treatments.length > 0 ? (
            <Select label="Treatment" value={form.treatmentId} onChange={(e) => selectTreatment(e.target.value)}
              options={[{ label: "Select treatment...", value: "" }, ...treatments.map((t) => ({ label: `${t.name} (${TREATMENT_CATEGORIES[t.category]?.en})`, value: t.id }))]} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Input label="Treatment Name" value={form.treatmentName} onChange={(e) => setForm({ ...form, treatmentName: e.target.value })} placeholder="e.g. Dental Implant" />
              <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TreatmentCategory })}
                options={Object.entries(TREATMENT_CATEGORIES).map(([k, v]) => ({ label: v.en, value: k }))} />
            </div>
          )}
          <Select label="Clinic (optional — leave empty for global pricing)" value={form.clinicId} onChange={(e) => selectClinic(e.target.value)}
            options={[{ label: "Global (all clinics)", value: "" }, ...clinics.map((c) => ({ label: c.clinicName, value: c.clinicId }))]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Input label="Price Min" value={form.priceMin} onChange={(e) => setForm({ ...form, priceMin: e.target.value })} placeholder="400" />
            <Input label="Price Max" value={form.priceMax} onChange={(e) => setForm({ ...form, priceMax: e.target.value })} placeholder="900" />
            <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={[{ label: "EUR", value: "EUR" }, { label: "USD", value: "USD" }, { label: "GBP", value: "GBP" }, { label: "TRY", value: "TRY" }]} />
          </div>
          <Select label="Price Type" value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value as ClinicTreatmentPrice["priceType"] })}
            options={[
              { label: "Average", value: "average" },
              { label: "Starting from", value: "starting_from" },
              { label: "Package", value: "package" },
              { label: "Per Unit", value: "per_unit" },
            ]} />
          <Input label="Package Details (optional)" value={form.packageDetails} onChange={(e) => setForm({ ...form, packageDetails: e.target.value })} placeholder="Includes accommodation, transfers..." />
          <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes" />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>{editingId ? "Save Changes" : "Add Pricing"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
