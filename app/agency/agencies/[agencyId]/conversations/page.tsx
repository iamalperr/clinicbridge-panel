"use client";

import { useEffect, useState } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import type { Conversation } from "@/lib/types/conversation";
import { useI18n } from "@/lib/i18n-context";
import { Loader2, Search, Filter } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Badge from "@/components/ui/Badge";
import { formatDistanceToNow, format } from "date-fns";
import ConversationDetailSlideover from "@/components/agency/conversations/ConversationDetailSlideover";

const STATUS_COLORS: Record<string, "info" | "success" | "warning" | "default"> = {
  active: "info",
  qualified: "success",
  clinic_recommended: "success",
  quote_requested: "warning",
  appointment_scheduled: "success",
  abandoned: "default"
};

export default function ConversationsPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t } = useI18n();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    const q = query(
      collection(db, "agencies", agencyId, "conversations"),
      orderBy("lastActivityAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
      setConversations(results);
      setLoading(false);
    });
    return () => unsub();
  }, [agencyId]);

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Conversations</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>View all AI intake sessions and interactions.</p>
        </div>
        
        {/* Filters placeholder */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search size={16} color={UI_COLORS.textMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input type="text" placeholder="Search patient..." style={{ padding: "8px 12px 8px 36px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, fontSize: 14, width: 240, outline: "none" }} />
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "#ffffff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            <Filter size={16} /> Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#ffffff", borderRadius: 12, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted, fontSize: 14 }}>
            No conversations found.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>Patient</th>
                <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>Started</th>
                <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>Treatment</th>
                <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>Status</th>
                <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map(c => {
                const dateVal = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
                const lastVal = c.lastActivityAt?.toDate ? c.lastActivityAt.toDate() : new Date(c.lastActivityAt);
                
                return (
                  <tr key={c.id} 
                      onClick={() => setSelectedConvo(c)}
                      style={{ borderBottom: `1px solid ${UI_COLORS.border}`, cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>{c.patientName || "Anonymous"}</div>
                      <div style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{c.language?.toUpperCase() || "EN"}</div>
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textSecondary }}>
                      {dateVal ? format(dateVal, "MMM d, HH:mm") : ""}
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 14, color: UI_COLORS.textPrimary }}>
                      {c.subTreatment || c.treatmentCategory || "—"}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <Badge label={c.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} variant={STATUS_COLORS[c.status] || "default"} />
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textSecondary }}>
                      {lastVal ? formatDistanceToNow(lastVal, { addSuffix: true }) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Slideover Detail */}
      <ConversationDetailSlideover 
        conversation={selectedConvo} 
        onClose={() => setSelectedConvo(null)} 
      />
    </div>
  );
}
