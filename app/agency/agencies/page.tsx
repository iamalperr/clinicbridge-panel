"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToAllAgencies, createAgency, updateAgency } from "@/lib/services/agencyService";
import { seedFeelinHealthy } from "@/lib/seed/feelinhealthy";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Building2, Plus, Search, Loader2, Globe, Calendar, Edit2, AlertCircle, Database,
} from "lucide-react";
import type { Agency, TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

export default function AgenciesPage() {
  const { profile } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Form
  const [form, setForm] = useState({
    name: "",
    slug: "",
    domain: "",
    productType: "",
    contactEmail: "",
    timezone: "Europe/Istanbul",
    status: "active" as Agency["status"],
    supportedLanguages: [] as string[],
    allowedDomains: "",
    privacyUrl: "",
  });

  useEffect(() => {
    const unsub = subscribeToAllAgencies((data) => {
      setAgencies(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (!isSuperAdmin(profile?.role)) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>Access Denied</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>Only Super Admins can manage agencies.</p>
      </div>
    );
  }

  const filtered = agencies.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.domain?.toLowerCase().includes(q) || a.slug?.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setForm({ name: "", slug: "", domain: "", productType: "Health Tourism Network", contactEmail: "", timezone: "Europe/Istanbul", status: "active", supportedLanguages: [], allowedDomains: "", privacyUrl: "" });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (a: Agency) => {
    setForm({
      name: a.name,
      slug: a.slug,
      domain: a.domain,
      productType: a.productType || "",
      contactEmail: a.contactEmail || "",
      timezone: a.timezone || "Europe/Istanbul",
      status: a.status,
      supportedLanguages: a.supportedLanguages || [],
      allowedDomains: (a.allowedDomains || []).join(", "),
      privacyUrl: a.privacyUrl || "",
    });
    setEditingId(a.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      const data: any = {
        name: form.name,
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        domain: form.domain,
        productType: form.productType,
        contactEmail: form.contactEmail,
        timezone: form.timezone,
        status: form.status,
        supportedLanguages: form.supportedLanguages,
        allowedDomains: form.allowedDomains.split(",").map((d) => d.trim()).filter(Boolean),
        privacyUrl: form.privacyUrl,
        branding: { primaryColor: "#10b981" },
        treatmentCategories: Object.keys(TREATMENT_CATEGORIES) as TreatmentCategory[],
      };

      if (editingId) {
        await updateAgency(editingId, data);
      } else {
        await createAgency(data);
      }
      setShowModal(false);
    } catch (err) {
      console.error("Failed to save agency:", err);
    } finally {
      setSaving(false);
    }
  };

  const langOptions = ["en", "tr", "de", "fr", "es", "ar", "ru"];
  const toggleLang = (lang: string) => {
    setForm((f) => ({
      ...f,
      supportedLanguages: f.supportedLanguages.includes(lang)
        ? f.supportedLanguages.filter((l) => l !== lang)
        : [...f.supportedLanguages, lang],
    }));
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            Agencies
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {agencies.length} agencies in the ClinicBridge Network.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={async () => {
            const agency = agencies.find(a => a.slug === "feelinhealthy");
            if (!agency) { alert("Create FeelinHealthy agency first."); return; }
            if (!confirm("Seed FeelinHealthy with demo treatments, clinics, pricing and leads?")) return;
            setSeeding(true);
            try {
              const result = await seedFeelinHealthy(agency.id);
              alert(`Seeded: ${result.treatments} treatments, ${result.clinics} clinics, ${result.pricing} pricing entries, ${result.leads} leads.`);
            } catch (err) { console.error(err); alert("Seed failed."); }
            finally { setSeeding(false); }
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Database size={14} /> {seeding ? "Seeding..." : "Seed Demo"}</span>
          </Button>
          <Button onClick={openAdd}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Create Agency</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
        <input
          type="text"
          placeholder="Search agencies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10,
            border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
            background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none",
          }}
        />
      </div>

      {loading ? (
        <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center", background: "var(--bg-card)",
          borderRadius: 14, border: `1px solid ${UI_COLORS.border}`,
        }}>
          <Building2 size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>
            {search ? "No agencies match your search" : "No agencies yet"}
          </h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            Create your first agency to get started.
          </p>
        </div>
      ) : (
        <div style={{
          background: "var(--bg-card)", borderRadius: 14,
          border: `1px solid ${UI_COLORS.border}`, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                {["Agency", "Domain", "Slug", "Languages", "Type", "Status", "Actions"].map((h) => (
                  <th key={h} style={{
                    padding: "12px 14px", textAlign: "left", fontWeight: 700,
                    fontSize: 11.5, textTransform: "uppercase",
                    letterSpacing: "0.05em", color: UI_COLORS.textMuted,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: "linear-gradient(135deg, #10b981, #059669)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Building2 size={16} color="#fff" />
                      </div>
                      <span style={{ fontWeight: 700, color: UI_COLORS.textPrimary }}>{a.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "14px", color: UI_COLORS.textSecondary }}>
                    {a.domain || "—"}
                  </td>
                  <td style={{ padding: "14px" }}>
                    <code style={{ fontSize: 12, color: UI_COLORS.textMuted, background: "var(--bg-app)", padding: "2px 6px", borderRadius: 4 }}>
                      {a.slug}
                    </code>
                  </td>
                  <td style={{ padding: "14px", color: UI_COLORS.textSecondary, fontSize: 12 }}>
                    {a.supportedLanguages?.map((l) => l.toUpperCase()).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "14px", color: UI_COLORS.textMuted, fontSize: 12 }}>
                    {a.productType || "—"}
                  </td>
                  <td style={{ padding: "14px" }}>
                    <Badge label={a.status === "active" ? "Active" : "Inactive"} variant={a.status === "active" ? "success" : "warning"} />
                  </td>
                  <td style={{ padding: "14px" }}>
                    <button
                      onClick={() => openEdit(a)}
                      style={{
                        padding: "6px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                        background: "var(--bg-card)", color: UI_COLORS.textSecondary,
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Agency" : "Create Agency"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input label="Agency Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. FeelinHealthy" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Slug / Agency ID" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. feelinhealthy" />
            <Input label="Domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="e.g. feelinhealthy.com" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Product Type" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder="e.g. Health Tourism Network" />
            <Input label="Contact Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="e.g. info@feelinhealthy.com" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Agency["status"] })} options={[{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }, { label: "Trial", value: "trial" }]} />
            <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Europe/Istanbul" />
          </div>
          <Input label="Privacy / Consent URL" value={form.privacyUrl} onChange={(e) => setForm({ ...form, privacyUrl: e.target.value })} placeholder="https://..." />
          <Input label="Allowed Domains (comma separated)" value={form.allowedDomains} onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })} placeholder="feelinhealthy.com, www.feelinhealthy.com" />

          {/* Languages */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 8 }}>Supported Languages</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {langOptions.map((lang) => (
                <button
                  key={lang}
                  onClick={() => toggleLang(lang)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s",
                    background: form.supportedLanguages.includes(lang) ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: form.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.textMuted,
                    border: `1px solid ${form.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.border}`,
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>{editingId ? "Save Changes" : "Create Agency"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
