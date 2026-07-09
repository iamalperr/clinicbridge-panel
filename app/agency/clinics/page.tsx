"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import {
  subscribeToAgencyClinics,
  addClinicToAgency,
  removeClinicFromAgency,
  updateAgencyClinic,
} from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Building2,
  Plus,
  Trash2,
  Loader2,
  MapPin,
  Globe,
  Stethoscope,
  AlertCircle,
} from "lucide-react";
import type { AgencyClinic, TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

export default function AgencyClinicsPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;

  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add clinic form
  const [newClinic, setNewClinic] = useState({
    clinicId: "",
    clinicName: "",
    branch: "",
    city: "",
    country: "",
    treatmentCategories: [] as TreatmentCategory[],
  });

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToAgencyClinics(agencyId, (data) => {
      setClinics(data);
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  const handleAddClinic = async () => {
    if (!agencyId || !newClinic.clinicId || !newClinic.clinicName) return;
    setSaving(true);
    try {
      await addClinicToAgency(agencyId, {
        clinicId: newClinic.clinicId,
        clinicName: newClinic.clinicName,
        branch: newClinic.branch || undefined,
        category: undefined,
        location: {
          city: newClinic.city,
          country: newClinic.country,
        },
        supportedLanguages: ["en", "tr"],
        treatmentCategories: newClinic.treatmentCategories,
        status: "active",
        priority: clinics.length + 1,
        responseSLA: 24,
      });
      setShowAddModal(false);
      setNewClinic({ clinicId: "", clinicName: "", branch: "", city: "", country: "", treatmentCategories: [] });
    } catch (err) {
      console.error("Failed to add clinic:", err);
    }
    setSaving(false);
  };

  const handleRemoveClinic = async (docId: string) => {
    if (!agencyId || !confirm("Remove this clinic from agency?")) return;
    try {
      await removeClinicFromAgency(agencyId, docId);
    } catch (err) {
      console.error("Failed to remove clinic:", err);
    }
  };

  const toggleStatus = async (clinic: AgencyClinic) => {
    if (!agencyId || !clinic.id) return;
    try {
      await updateAgencyClinic(agencyId, clinic.id, {
        status: clinic.status === "active" ? "paused" : "active",
      });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const toggleCategory = (cat: TreatmentCategory) => {
    setNewClinic((prev) => ({
      ...prev,
      treatmentCategories: prev.treatmentCategories.includes(cat)
        ? prev.treatmentCategories.filter((c) => c !== cat)
        : [...prev.treatmentCategories, cat],
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

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Clinics</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {clinics.length} clinic{clinics.length !== 1 ? "s" : ""} linked to your agency
          </p>
        </div>
        {profile?.role === "agencyAdmin" && (
          <Button onClick={() => setShowAddModal(true)} style={{ background: "#10b981", borderColor: "#10b981" }}>
            <Plus size={16} /> Add Clinic
          </Button>
        )}
      </div>

      {/* Clinic Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {clinics.map((clinic) => (
          <div
            key={clinic.id || clinic.clinicId}
            style={{
              background: "var(--bg-card)",
              borderRadius: 14,
              border: `1px solid ${UI_COLORS.border}`,
              padding: 20,
              transition: "box-shadow 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: clinic.status === "active" ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Building2 size={20} color={clinic.status === "active" ? "#10b981" : "#94a3b8"} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                    {clinic.clinicName}
                  </p>
                  {clinic.branch && (
                    <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{clinic.branch}</p>
                  )}
                </div>
              </div>
              <Badge
                label={clinic.status === "active" ? "Active" : "Paused"}
                variant={clinic.status === "active" ? "success" : "default"}
              />
            </div>

            {/* Details */}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: UI_COLORS.textSecondary }}>
                <MapPin size={13} />
                {clinic.location?.city}, {clinic.location?.country}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: UI_COLORS.textSecondary }}>
                <Globe size={13} />
                {(clinic.supportedLanguages || []).join(", ").toUpperCase() || "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: UI_COLORS.textSecondary }}>
                <Stethoscope size={13} />
                {(clinic.treatmentCategories || [])
                  .map((c) => TREATMENT_CATEGORIES[c]?.en || c)
                  .join(", ") || "—"}
              </div>
            </div>

            {/* Actions */}
            {profile?.role === "agencyAdmin" && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => toggleStatus(clinic)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: `1px solid ${UI_COLORS.border}`,
                    background: "transparent",
                    color: UI_COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {clinic.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => clinic.id && handleRemoveClinic(clinic.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    background: "rgba(239, 68, 68, 0.05)",
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {clinics.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: UI_COLORS.textMuted }}>
          <Building2 size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No clinics linked yet</p>
          <p style={{ fontSize: 13 }}>Add clinics to start managing leads and patient routing.</p>
        </div>
      )}

      {/* Add Clinic Modal */}
      {showAddModal && (
        <Modal isOpen={showAddModal} title="Add Clinic to Agency" onClose={() => setShowAddModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Clinic ID (from ClinicBridge)"
              value={newClinic.clinicId}
              onChange={(e) => setNewClinic((p) => ({ ...p, clinicId: e.target.value }))}
              placeholder="e.g., DnOlKzIhPc4agVymYcoH"
            />
            <Input
              label="Clinic Name"
              value={newClinic.clinicName}
              onChange={(e) => setNewClinic((p) => ({ ...p, clinicName: e.target.value }))}
              placeholder="e.g., Nova Dental Clinic"
            />
            <Input
              label="Branch (optional)"
              value={newClinic.branch}
              onChange={(e) => setNewClinic((p) => ({ ...p, branch: e.target.value }))}
              placeholder="e.g., Istanbul Main"
            />
            <div style={{ display: "flex", gap: 12 }}>
              <Input
                label="City"
                value={newClinic.city}
                onChange={(e) => setNewClinic((p) => ({ ...p, city: e.target.value }))}
                placeholder="Istanbul"
              />
              <Input
                label="Country"
                value={newClinic.country}
                onChange={(e) => setNewClinic((p) => ({ ...p, country: e.target.value }))}
                placeholder="Turkey"
              />
            </div>

            {/* Treatment Categories */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                Treatment Categories
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => {
                  const selected = newClinic.treatmentCategories.includes(key as TreatmentCategory);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCategory(key as TreatmentCategory)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 20,
                        border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
                        background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
                        color: selected ? "#10b981" : UI_COLORS.textSecondary,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {val.en}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleAddClinic}
              disabled={!newClinic.clinicId || !newClinic.clinicName || saving}
              style={{ background: "#10b981", borderColor: "#10b981" }}
            >
              {saving ? "Adding..." : "Add Clinic"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
