"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Clinic, Plan, ClinicStatus } from "@/lib/types";
import { MOCK_CLINICS } from "@/lib/mock-data";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { formatNumber } from "@/lib/utils";
import { CheckCircle2, Loader2, Sparkles, Layout, Mic } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

export default function ClinicsPage() {
  const { t } = useI18n();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newClinic, setNewClinic] = useState<Partial<Clinic>>({ 
    name: "", domain: "", plan: "starter", status: "trial", 
    modules: { ai: true, widget: false, voice: false }
  });

  const fetchClinics = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, "clinics"));
      if (snap.empty) {
        setClinics([]);
      } else {
        setClinics(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Clinic, "id">) })));
      }
    } catch (err) {
      console.error("Firestore error:", err);
      setError(t("dashboard.errors.fetch"));
      setClinics(MOCK_CLINICS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClinics();
  }, []);

  const filteredClinics = useMemo(() => {
    return clinics.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.domain?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clinics, searchQuery]);

  const handleAddClinic = async () => {
    // Strict Validation
    if (!newClinic.name || !newClinic.domain || !newClinic.status || !newClinic.plan) {
      setSubmitError(t("dashboard.errors.validation"));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    
    const clinicToSave = {
      name: newClinic.name,
      domain: newClinic.domain,
      plan: newClinic.plan,
      status: newClinic.status,
      modules: newClinic.modules,
      messages: 0,
      conversations: 0,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "clinics"), clinicToSave);
      await fetchClinics();
      setIsSuccess(true);
      
      // Auto-close after success feedback
      setTimeout(() => {
        setIsAddModalOpen(false);
        setIsSuccess(false);
        setNewClinic({ name: "", domain: "", plan: "starter", status: "trial", modules: { ai: true, widget: false, voice: false } });
      }, 1800);
      
    } catch (err) {
      console.error("Failed to add clinic:", err);
      setSubmitError(t("dashboard.errors.saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const active = clinics.filter((c) => c.status === "active").length;
  const totalMsgs = clinics.reduce((s, c) => s + (c.messages ?? 0), 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.5px" }}>{t("dashboard.title")}</h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 4, fontSize: 14 }}>{t("dashboard.subtitle")}</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          + {t("common.addClinic")}
        </Button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18, marginBottom: 32 }}>
        <StatCard label={t("dashboard.stats.totalClinics")}   value={clinics.length} subtext={`${active} ${t("common.status.active").toLowerCase()}`} />
        <StatCard label={t("dashboard.stats.activeClinics")}  value={active} subtext={`${clinics.length - active} ${t("common.status.inactive").toLowerCase()}`} />
        <StatCard label={t("dashboard.stats.totalMessages")}  value={formatNumber(totalMsgs)} subtext={t("dashboard.stats.acrossAll")} />
      </div>

      {/* Controls & Search */}
      <div style={{ marginBottom: 24 }}>
        <Input 
          placeholder={t("common.search")} 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* Error/Loading handling */}
      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 12, padding: 16, marginBottom: 24, color: UI_COLORS.danger, fontSize: 14 }}>
          {error}
        </div>
      )}
      
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "64px 0", color: UI_COLORS.textMuted, fontSize: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p>{t("dashboard.loading")}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      ) : filteredClinics.length === 0 ? (
        <EmptyState 
          title={searchQuery ? t("dashboard.noResults") : t("dashboard.noClinics")} 
          description={searchQuery ? t("dashboard.noResultsDesc") : t("dashboard.noClinicsDesc")} 
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {filteredClinics.map((clinic) => (
            <div key={clinic.id} style={{ 
              background: UI_COLORS.bgCard, 
              border: `1px solid ${UI_COLORS.border}`, 
              borderRadius: UI_COMMON_STYLES.radius, 
              padding: UI_COMMON_STYLES.cardPadding,
              transition: UI_COMMON_STYLES.transition 
            }}>
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ 
                    width: 40, height: 40, borderRadius: 10, 
                    background: UI_COMMON_STYLES.brandGradient, 
                    display: "flex", alignItems: "center", justifyContent: "center", 
                    fontSize: 16, fontWeight: 700, color: "white", flexShrink: 0,
                    boxShadow: UI_COMMON_STYLES.logoShadow
                  }}>
                    {clinic.name[0]}
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>{clinic.name}</p>
                    {clinic.domain && <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2 }}>{clinic.domain}</p>}
                  </div>
                </div>
                {clinic.status && <Badge variant={clinic.status} dot />}
              </div>

              {/* Feature tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {clinic.plan && <Badge variant={clinic.plan} />}
                {clinic.modules?.ai && <Badge variant="active" label="AI" />}
                {clinic.modules?.widget && <Badge variant="indexed" label="Widget" />}
                {clinic.modules?.voice && <Badge variant="trial" label="Voice" />}
              </div>

              {/* Mini stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "16px 0", borderTop: `1px solid ${UI_COLORS.border}`, borderBottom: `1px solid ${UI_COLORS.border}`, marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{t("dashboard.cards.messages")}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary }}>{formatNumber(clinic.messages ?? 0)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{t("dashboard.cards.conversations")}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary }}>{formatNumber(clinic.conversations ?? 0)}</p>
                </div>
              </div>

              <Link 
                href={`/clinics/${clinic.id}`} 
                style={{ 
                  display: "block", textAlign: "center", padding: "10px", 
                  borderRadius: 10, background: "rgba(99, 102, 241, 0.08)", 
                  color: UI_COLORS.brand, fontWeight: 700, fontSize: 13.5, 
                  textDecoration: "none", transition: UI_COMMON_STYLES.transition 
                }}
              >
                {t("dashboard.manageWorkspace")} →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Add Clinic Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => !isSubmitting && !isSuccess && setIsAddModalOpen(false)} title={isSuccess ? "" : t("dashboard.modal.addNew")} width={550}>
        {isSuccess ? (
          <div style={{ 
            padding: "40px 0", 
            textAlign: "center", 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center",
            gap: 16
          }}>
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: "50%", 
              background: "rgba(16, 185, 129, 0.1)", 
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
              animation: "bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)"
            }}>
              <CheckCircle2 size={48} />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("dashboard.modal.success")}</h3>
            <p style={{ color: UI_COLORS.textSecondary, fontSize: 15 }}>{newClinic.name} {t("dashboard.modal.successDesc")}</p>
            <style>{`
              @keyframes bounceIn {
                from { opacity: 0; transform: scale(0.3); }
                to { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Input 
                label={t("dashboard.modal.name")} 
                placeholder="Örn: Smile Dental" 
                value={newClinic.name}
                onChange={(e) => setNewClinic({ ...newClinic, name: e.target.value })}
              />
              <Input 
                label={t("dashboard.modal.website")} 
                placeholder="Örn: smiledental.com" 
                value={newClinic.domain}
                onChange={(e) => setNewClinic({ ...newClinic, domain: e.target.value })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Select 
                label={t("dashboard.modal.plan")} 
                value={newClinic.plan}
                onChange={(e) => setNewClinic({ ...newClinic, plan: e.target.value as Plan })}
                options={[
                  { label: "Starter", value: "starter" },
                  { label: "Pro", value: "pro" },
                  { label: "Enterprise", value: "enterprise" },
                ]}
              />
              <Select 
                label={t("dashboard.modal.status")} 
                value={newClinic.status}
                onChange={(e) => setNewClinic({ ...newClinic, status: e.target.value as ClinicStatus })}
                options={[
                  { label: `Trial (${t("common.status.trial")})`, value: "trial" },
                  { label: `Active (${t("common.status.active")})`, value: "active" },
                  { label: `Inactive (${t("common.status.inactive")})`, value: "inactive" },
                ]}
              />
            </div>
            
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("dashboard.modal.modules")}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { id: "ai", label: "AI Assistant", icon: <Sparkles size={16} /> },
                  { id: "widget", label: "Web Widget", icon: <Layout size={16} /> },
                  { id: "voice", label: "Voice Agent", icon: <Mic size={16} /> },
                ].map((m) => {
                  const modules = (newClinic.modules || {}) as Record<string, boolean>;
                  const isChecked = !!modules[m.id];
                  return (
                    <div 
                      key={m.id}
                      onClick={() => setNewClinic({ ...newClinic, modules: { ...newClinic.modules!, [m.id]: !isChecked } })}
                      style={{ 
                        padding: "12px", 
                        borderRadius: 12, 
                        border: `1px solid ${isChecked ? UI_COLORS.brand : UI_COLORS.border}`,
                        background: isChecked ? "rgba(99, 102, 241, 0.04)" : "rgba(255, 255, 255, 0.01)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        transition: UI_COMMON_STYLES.transition,
                        color: isChecked ? UI_COLORS.brand : UI_COLORS.textSecondary
                      }}
                    >
                      {m.icon}
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {submitError && (
              <div style={{ 
                color: UI_COLORS.danger, 
                background: "rgba(239, 68, 68, 0.08)", 
                padding: "12px 16px", 
                borderRadius: 10, 
                fontSize: 13, 
                fontWeight: 600,
                border: "1px solid rgba(239, 68, 68, 0.1)"
              }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8, paddingTop: 20, borderTop: `1px solid ${UI_COLORS.border}` }}>
              <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>{t("common.cancel")}</Button>
              <Button onClick={handleAddClinic} disabled={!newClinic.name || isSubmitting} style={{ minWidth: 120 }}>
                {isSubmitting ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" />
                    {t("dashboard.modal.saving")}
                  </div>
                ) : t("dashboard.modal.save")}
              </Button>
            </div>
          </div>
        )}
        <style>{`
          .animate-spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </Modal>
    </div>
  );
}