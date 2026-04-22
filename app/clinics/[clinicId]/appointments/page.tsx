"use client";

import { use, useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, Calendar, Clock, User, Stethoscope, ChevronRight, Inbox } from "lucide-react";
import Badge from "@/components/ui/Badge";
import type { Appointment } from "@/lib/types";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function AppointmentsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const appointmentsRef = collection(db, "appointments");
        const q = query(
          appointmentsRef,
          where("clinicId", "==", clinicId),
          orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Appointment[];
        
        setAppointments(data);
      } catch (error) {
        console.error("Error fetching appointments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, [clinicId]);

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
          {t("appointments.title") || "Recent Appointments"}
        </h1>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("appointments.subtitle") || "View recent appointments booked via AI or manually."}
        </p>
      </div>

      {appointments.length === 0 ? (
        <div style={{ 
          padding: "64px 24px", 
          textAlign: "center", 
          background: UI_COLORS.bgCard, 
          borderRadius: 16, 
          border: `1px dashed ${UI_COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16
        }}>
          <div style={{ 
            width: 64, height: 64, borderRadius: "50%", background: "var(--bg-page)", 
            display: "flex", alignItems: "center", justifyContent: "center", color: UI_COLORS.textMuted 
          }}>
            <Inbox size={32} strokeWidth={1.5} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 4 }}>
              {t("appointments.emptyTitle") || "No appointments yet"}
            </h3>
            <p style={{ fontSize: 14, color: UI_COLORS.textSecondary }}>
              {t("appointments.emptyDesc") || "AI or manual bookings will appear here."}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ 
          background: UI_COLORS.bgCard, 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: 16, 
          overflow: "hidden" 
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-page)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.patient") || "Patient"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.service") || "Service"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.date") || "Date & Time"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.status") || "Status"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.source") || "Source"}
                  </th>
                  <th style={{ padding: "16px 24px", width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((apt) => (
                  <tr key={apt.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-page)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <User size={16} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                          {apt.patientName}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: UI_COLORS.textPrimary, fontWeight: 500 }}>
                        <Stethoscope size={16} color={UI_COLORS.textMuted} />
                        {apt.service}
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: UI_COLORS.textPrimary, fontWeight: 500 }}>
                          <Calendar size={14} color={UI_COLORS.textMuted} />
                          {apt.preferredDate}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: UI_COLORS.textSecondary }}>
                          <Clock size={14} />
                          {apt.preferredTime}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <Badge variant={apt.status === "confirmed" ? "active" : apt.status === "pending" ? "pending" : "inactive"} />
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-page)", borderRadius: 100, border: `1px solid ${UI_COLORS.border}`, fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                        {t(`appointments.source.${apt.source}`) || apt.source}
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px", textAlign: "right" }}>
                      <button style={{ background: "transparent", border: "none", color: UI_COLORS.textMuted, cursor: "pointer", padding: 4 }}>
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
