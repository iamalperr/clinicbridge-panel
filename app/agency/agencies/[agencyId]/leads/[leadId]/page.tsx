"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { agencyQuotesPath } from "@/lib/agency/leadQuoteArchitecture";
import {
  LEAD_STATUS_ACTIONS,
  type LeadStatusActionKey,
} from "@/lib/agency/leadStatusActions";
import { subscribeToLead, updateLeadStatus, updateLeadClinicSelection, subscribeToClinicRequests, subscribeToNotificationJobs, subscribeToExtendedRequests } from "@/lib/services/leadService";
import { subscribeToAgencyClinics, getAgency } from "@/lib/services/agencyService";
import { resolveAgencyClinicSelectionLimit } from "@/lib/agency/leadClinicSelection";
import { FEELINHEALTHY_CONFIG } from "@/lib/agency/feelinhealthyConfig";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import {
  ArrowLeft, Loader2, User, Phone, Mail, MapPin, Calendar,
  Stethoscope, Building2, DollarSign, MessageSquare, Send,
  CheckCircle, XCircle, Clock, FileText, Globe, Bell, ExternalLink, Pencil,
} from "lucide-react";
import type { AgencyClinic, Lead, LeadStatus, TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES, LEAD_STATUSES, LEAD_URGENCIES } from "@/lib/types/agency";
import LeadDocumentsCard from "@/components/agency/LeadDocumentsCard";

// ─── Helpers ────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, fallback = "—" }: { icon: React.ReactNode; label: string; value: string | number | null | undefined; fallback?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
      <div style={{ color: UI_COLORS.textMuted, marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: value ? UI_COLORS.textPrimary : UI_COLORS.textMuted }}>{value || fallback}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: UI_COLORS.bgCard, borderRadius: 14,
      border: `1px solid ${UI_COLORS.border}`, padding: "20px 24px",
    }}>
      <h3 style={{
        fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary,
        display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        paddingBottom: 12, borderBottom: `1px solid ${UI_COLORS.border}`,
      }}>
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function statusVariant(s: string): "info" | "success" | "danger" | "warning" | "default" {
  if (s === "new") return "info";
  if (s === "converted" || s === "completed" || s === "patient_notified") return "success";
  if (s === "lost") return "danger";
  if (s === "assigned_to_clinic" || s === "contacted") return "warning";
  return "default";
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { t, language } = useI18n();
  const agencyId = params.agencyId as string;
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [clinicRequests, setClinicRequests] = useState<any[]>([]);
  const [notificationJobs, setNotificationJobs] = useState<any[]>([]);
  const [extendedRequests, setExtendedRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Patient email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Clinic selection editor
  const [showClinicModal, setShowClinicModal] = useState(false);
  const [agencyClinics, setAgencyClinics] = useState<AgencyClinic[]>([]);
  const [draftClinicIds, setDraftClinicIds] = useState<string[]>([]);
  const [savingClinics, setSavingClinics] = useState(false);
  const [clinicSelectLimit, setClinicSelectLimit] = useState(3);

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;
  const statusLabel = (s: string) => LEAD_STATUSES[s as LeadStatus]?.[language === "tr" ? "tr" : "en"] || s;
  const canEditClinics = Boolean(lead && lead.status !== "lost" && lead.status !== "converted");

  useEffect(() => {
    const unsub = subscribeToLead(agencyId, leadId, (data) => {
      setLead(data);
      setLoading(false);
    });
    const unsubCR = subscribeToClinicRequests(agencyId, leadId, (data) => {
      setClinicRequests(data);
    });
    const unsubJobs = subscribeToNotificationJobs(agencyId, leadId, (data) => {
      setNotificationJobs(data);
    });
    const unsubExt = subscribeToExtendedRequests(agencyId, leadId, (data) => {
      setExtendedRequests(data);
    });
    const unsubClinics = subscribeToAgencyClinics(agencyId, (clinics) => {
      setAgencyClinics(clinics);
    });
    void getAgency(agencyId).then((agency) => {
      if (!agency) return;
      setClinicSelectLimit(
        resolveAgencyClinicSelectionLimit({
          agencySlug: agency.slug,
          settingsMaxClinics: agency.settings?.maxClinicsPerTreatmentRequest,
          guestQuoteLimit: FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit,
        })
      );
    });
    return () => {
      unsub();
      unsubCR();
      unsubJobs();
      unsubExt();
      unsubClinics();
    };
  }, [agencyId, leadId]);

  const openClinicModal = () => {
    if (!lead) return;
    const current = Array.isArray(lead.clinicIds)
      ? lead.clinicIds.map(String).filter(Boolean)
      : [];
    setDraftClinicIds(current);
    setShowClinicModal(true);
  };

  const toggleDraftClinic = (clinicId: string) => {
    setDraftClinicIds((prev) => {
      if (prev.includes(clinicId)) return prev.filter((id) => id !== clinicId);
      if (prev.length >= clinicSelectLimit) return prev;
      return [...prev, clinicId];
    });
  };

  const handleSaveClinicSelection = async () => {
    if (!lead || draftClinicIds.length === 0) return;
    setSavingClinics(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Auth required");
      await updateLeadClinicSelection(agencyId, leadId, draftClinicIds, token, {
        locale: language,
      });
      setShowClinicModal(false);
      showToast(
        "success",
        language === "tr" ? "Seçilen klinikler güncellendi." : "Selected clinics updated."
      );
    } catch (err: any) {
      showToast(
        "error",
        err?.message || (language === "tr" ? "Klinik seçimi güncellenemedi." : "Could not update clinic selection.")
      );
    } finally {
      setSavingClinics(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleStatusAction = async (actionKey: LeadStatusActionKey) => {
    if (actionLoading) return;

    const action = LEAD_STATUS_ACTIONS[actionKey];
    const lang = language === "tr" ? "tr" : "en";
    const historyNote = action.historyNote[lang];

    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("AUTH_REQUIRED");

      await updateLeadStatus(agencyId, leadId, action.status, token, historyNote);
      showToast("success", "Durum güncellendi.");
    } catch (err) {
      console.error("[lead status update]", err);
      showToast("error", "Durum güncellenemedi.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendPatientEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/public/agency/send-patient-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, leadId, customMessage: emailMessage }),
      });
      if (!res.ok) throw new Error("API error");
      showToast("success", "Hastaya bilgilendirme e-postası gönderildi.");
      setShowEmailModal(false);
      setEmailMessage("");
    } catch (err) {
      console.error(err);
      showToast("error", "E-posta gönderilemedi.");
    }
    setSendingEmail(false);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
        <p>Lead bulunamadı.</p>
        <Button variant="secondary" onClick={() => router.back()} style={{ marginTop: 16 }}>
          <ArrowLeft size={14} /> Geri Dön
        </Button>
      </div>
    );
  }

  const createdDate = lead.createdAt?.toDate
    ? lead.createdAt.toDate().toLocaleString("tr-TR")
    : typeof lead.createdAt === "string"
    ? new Date(lead.createdAt).toLocaleString("tr-TR")
    : "—";

  return (
    <div style={{ padding: "24px 40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? "#10b981" : "#ef4444",
          color: "#fff", fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)", animation: "fadeIn 0.3s ease",
        }}>
          {toast.type === "success" ? <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> : <XCircle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push(`/agency/agencies/${agencyId}/leads`)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: UI_COLORS.textMuted, display: "flex", alignItems: "center", gap: 6, fontSize: 13,
          }}
        >
          <ArrowLeft size={16} /> Leadler
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, margin: 0 }}>
            {lead.patientName || "Anonim Hasta"}
          </h1>
          <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Lead #{leadId.slice(0, 8)} · {createdDate}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge label={statusLabel(lead.status)} variant={statusVariant(lead.status)} />
          {lead.urgency && (
            <span style={{
              fontSize: 11.5, fontWeight: 700,
              color: LEAD_URGENCIES[lead.urgency]?.color || "#94a3b8",
            }}>
              {LEAD_URGENCIES[lead.urgency]?.tr || lead.urgency}
            </span>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

        {/* Hasta Bilgileri */}
        <SectionCard title="Hasta Bilgileri" icon={<User size={16} color="#10b981" />}>
          <InfoRow icon={<User size={14} />} label="Ad Soyad" value={lead.patientName} />
          <InfoRow icon={<Phone size={14} />} label="Telefon" value={lead.patientPhone} />
          <InfoRow icon={<Mail size={14} />} label="E-posta" value={lead.patientEmail} fallback="Belirtilmedi" />
          <InfoRow icon={<User size={14} />} label="Yaş" value={lead.patientAge} />
          <InfoRow icon={<User size={14} />} label="Cinsiyet" value={lead.patientGender} />
          <InfoRow icon={<MapPin size={14} />} label="Ülke" value={lead.country} />
          <InfoRow icon={<Globe size={14} />} label={t("Language") || "Language"} value={lead.language?.toUpperCase()} />
        </SectionCard>

        {/* Tedavi Bilgileri */}
        <SectionCard title={t("Treatment") || "Treatment"} icon={<Stethoscope size={18} color={UI_COLORS.brand} />}>
          <InfoRow icon={<Stethoscope size={14} />} label="Tedavi Kategorisi" value={catLabel(lead.treatmentCategory)} />
          <InfoRow icon={<Stethoscope size={14} />} label="Alt Tedavi" value={lead.treatmentSubcategory} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
            <div style={{ color: UI_COLORS.textMuted, marginTop: 2, flexShrink: 0 }}>
              <Building2 size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t("portal.leads.selectedClinics")}
                </p>
                {canEditClinics && (
                  <button
                    type="button"
                    onClick={openClinicModal}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      border: "none",
                      background: "transparent",
                      color: "#0d9488",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <Pencil size={12} />
                    {language === "tr" ? "Düzenle" : "Edit"}
                  </button>
                )}
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: (lead.selectedClinicNames?.length || lead.assignedClinicName) ? UI_COLORS.textPrimary : UI_COLORS.textMuted }}>
                {lead.selectedClinicNames?.length
                  ? lead.selectedClinicNames.join(", ")
                  : lead.assignedClinicName || "—"}
              </p>
            </div>
          </div>
          <InfoRow icon={<DollarSign size={14} />} label="Bütçe" value={(lead as any).budget} />
          <InfoRow icon={<Calendar size={14} />} label="Seyahat Tarihi" value={lead.travelDate || (lead as any).travelDate} />
          <InfoRow icon={<MapPin size={14} />} label={t("portal.leads.city")} value={lead.selectedCity} />
          <InfoRow icon={<FileText size={14} />} label="KVKK Onayı" value={lead.consentStatus === "accepted" ? "✅ Onaylandı" : lead.consentStatus === "declined" ? "❌ Reddedildi" : "⏳ Bekliyor"} />
          <InfoRow icon={<Clock size={14} />} label="Kaynak" value={lead.source} />
          {lead.quoteId ? (
            <div style={{ paddingTop: 12 }}>
              <Link
                href={agencyQuotesPath(agencyId, lead.quoteId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#6366f1",
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={13} />
                {t("portal.leads.viewQuote")}
              </Link>
            </div>
          ) : null}
        </SectionCard>
      </div>
      
      {/* Genişletilmiş Klinik Talebi */}
      {extendedRequests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Genişletilmiş Klinik Talebi" icon={<Globe size={18} color="#8b5cf6" />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {extendedRequests.map(er => (
                <div key={er.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 4 }}>
                      Daha Fazla Klinik İstendi
                    </p>
                    <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
                      Talep Tarihi: {new Date(er.createdAt).toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div>
                    {er.status === "completed" ? (
                      <Badge label="Tamamlandı" variant="success" />
                    ) : er.status === "expired" ? (
                      <Badge label="Süresi Doldu" variant="danger" />
                    ) : (
                      <Badge label="Bekliyor" variant="warning" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* AI Konuşma Özeti */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="AI Konuşma Özeti" icon={<MessageSquare size={16} color="#10b981" />}>
          <p style={{ fontSize: 13.5, color: UI_COLORS.textSecondary, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {lead.conversationSummary || "Konuşma özeti bulunmuyor."}
          </p>
          {lead.aiExtractedNotes && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)" }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: "#10b981", marginBottom: 6, textTransform: "uppercase" }}>AI Notları</p>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{lead.aiExtractedNotes}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Clinic Requests */}
      {clinicRequests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Klinik Talepleri" icon={<Building2 size={16} color="#10b981" />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {clinicRequests.map((cr, i) => (
                <div key={cr.id} style={{
                  padding: "12px 16px", borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`,
                  background: "var(--bg-card)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>Klinik ID: {cr.clinicId}</p>
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 4 }}>Oluşturulma: {typeof cr.createdAt === "string" ? new Date(cr.createdAt).toLocaleString(language === "tr" ? "tr-TR" : "en-US") : "—"}</p>
                    </div>
                    <div>
                      <Badge label={cr.status} variant={statusVariant(cr.status)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Notification Jobs */}
      {notificationJobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Sistem Bildirimleri (Admin)" icon={<Bell size={16} color="#3b82f6" />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notificationJobs.map((job) => (
                <div key={job.id} style={{
                  padding: "12px 16px", borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`,
                  background: "var(--bg-card)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>Job ID: {job.id}</p>
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 4 }}>Oluşturulma: {typeof job.createdAt === "string" ? new Date(job.createdAt).toLocaleString(language === "tr" ? "tr-TR" : "en-US") : "—"}</p>
                      {job.lastErrorCode && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>Hata: {job.lastErrorCode}</p>}
                    </div>
                    <div>
                      <Badge label={job.status} variant={job.status === "sent" ? "success" : job.status === "failed" ? "danger" : "warning"} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Status History */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="Durum Geçmişi" icon={<Clock size={16} color="#10b981" />}>
          {(lead.statusHistory || []).length === 0 ? (
            <p style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Henüz durum geçmişi yok.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lead.statusHistory.map((entry, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 12px", borderRadius: 8,
                  background: i === lead.statusHistory.length - 1 ? "rgba(16,185,129,0.04)" : "transparent",
                  border: `1px solid ${i === lead.statusHistory.length - 1 ? "rgba(16,185,129,0.12)" : UI_COLORS.border}`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: i === lead.statusHistory.length - 1 ? "#10b981" : UI_COLORS.textMuted,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <Badge label={statusLabel(entry.status)} variant={statusVariant(entry.status)} />
                    {entry.note && <span style={{ fontSize: 12, color: UI_COLORS.textMuted, marginLeft: 8 }}>{entry.note}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: UI_COLORS.textMuted }}>
                    {typeof entry.changedAt === "string" ? new Date(entry.changedAt).toLocaleString("tr-TR") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* E-posta Durumu */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="E-posta Geçmişi" icon={<Mail size={16} color="#10b981" />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Acenta Bildirim E-postası</span>
              {(lead as any).notificationEmailSent
                ? <Badge label="Gönderildi" variant="success" />
                : <Badge label="Gönderilmedi" variant="default" />
              }
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Hasta Bilgilendirme E-postası</span>
              {(lead as any).patientEmailSent
                ? <Badge label="Gönderildi" variant="success" />
                : <Badge label="Gönderilmedi" variant="default" />
              }
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Actions */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap", padding: "20px 24px",
        background: UI_COLORS.bgCard, borderRadius: 14, border: `1px solid ${UI_COLORS.border}`,
      }}>
        <p style={{ width: "100%", fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>Aksiyonlar</p>

        {lead.status !== "clinic_contacted" && lead.status !== "converted" && lead.status !== "lost" && (
          <Button variant="secondary" onClick={() => handleStatusAction("contacted")} isLoading={actionLoading} disabled={actionLoading}>
            <Phone size={14} /> {LEAD_STATUS_ACTIONS.contacted.buttonLabel[language === "tr" ? "tr" : "en"]}
          </Button>
        )}

        {lead.status !== "converted" && (
          <Button onClick={() => handleStatusAction("converted")} isLoading={actionLoading} disabled={actionLoading}>
            <CheckCircle size={14} /> {LEAD_STATUS_ACTIONS.converted.buttonLabel[language === "tr" ? "tr" : "en"]}
          </Button>
        )}

        {lead.status !== "lost" && (
          <Button variant="secondary" onClick={() => handleStatusAction("lost")} isLoading={actionLoading} disabled={actionLoading}
            style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.2)" }}>
            <XCircle size={14} /> {LEAD_STATUS_ACTIONS.lost.buttonLabel[language === "tr" ? "tr" : "en"]}
          </Button>
        )}

        <Button variant="secondary" onClick={() => {
          setEmailMessage(`Sayın ${lead.patientName || "Hastamız"},\n\nTedavi talebiniz ekibimiz tarafından incelendi. Kısa süre içinde sizinle iletişime geçeceğiz.\n\nSağlıklı günler dileriz.`);
          setShowEmailModal(true);
        }}>
          <Send size={14} /> Hastaya Bilgilendirme Gönder
        </Button>
      </div>

      {/* Patient Email Modal */}
      <Modal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)} title="Hastaya Bilgilendirme E-postası">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>Alıcı</p>
            <p style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{lead.patientEmail || "E-posta adresi tanımlı değil"}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>Mesaj</p>
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={8}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 8,
                border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
                fontFamily: "inherit", resize: "vertical",
                background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowEmailModal(false)}>İptal</Button>
            <Button onClick={handleSendPatientEmail} isLoading={sendingEmail} disabled={!lead.patientEmail}>
              <Send size={14} /> Gönder
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clinic selection modal */}
      <Modal
        isOpen={showClinicModal}
        onClose={() => setShowClinicModal(false)}
        title={language === "tr" ? "Seçilen Klinikleri Düzenle" : "Edit Selected Clinics"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
            {language === "tr"
              ? `En fazla ${clinicSelectLimit} klinik seçebilirsiniz. Değişiklik lead, teklif talebi ve klinik taleplerine yansır; lead durumu değişmez. Hastaya sebep bilgisini bilgilendirme mailinde yazabilirsiniz.`
              : `You can select up to ${clinicSelectLimit} clinics. Changes sync to the lead, quote request, and clinic requests without changing lead status. Explain the reason in the patient notification email if needed.`}
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted }}>
            {language === "tr" ? "Seçilen" : "Selected"}: {draftClinicIds.length} / {clinicSelectLimit}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {agencyClinics
              .filter((c) => {
                const st = String(c.status || "active").toLowerCase();
                return st !== "inactive" && st !== "archived" && st !== "disabled";
              })
              .map((clinic) => {
                const id = String(clinic.id || clinic.clinicId || "");
                if (!id) return null;
                const checked = draftClinicIds.includes(id);
                const disabled = !checked && draftClinicIds.length >= clinicSelectLimit;
                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${checked ? "rgba(13,148,136,0.35)" : UI_COLORS.border}`,
                      background: checked ? "rgba(13,148,136,0.06)" : UI_COLORS.bgCard,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleDraftClinic(id)}
                    />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                      {clinic.clinicName || id}
                    </span>
                  </label>
                );
              })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setShowClinicModal(false)}>
              {language === "tr" ? "İptal" : "Cancel"}
            </Button>
            <Button
              onClick={handleSaveClinicSelection}
              isLoading={savingClinics}
              disabled={draftClinicIds.length === 0 || savingClinics}
            >
              {language === "tr" ? "Kaydet" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
