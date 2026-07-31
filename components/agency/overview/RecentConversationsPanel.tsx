"use client";

import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Conversation } from "@/lib/types/conversation";
import { Globe, User } from "lucide-react";

interface RecentConversationsPanelProps {
  conversations: Conversation[];
  agencyId: string;
}

const STATUS_COLORS: Record<string, "info" | "success" | "warning" | "default"> = {
  active: "info",
  qualified: "success",
  clinic_recommended: "success",
  quote_requested: "warning",
  appointment_scheduled: "success",
  abandoned: "default"
};

export default function RecentConversationsPanel({ conversations, agencyId }: RecentConversationsPanelProps) {
  return (
    <SectionCard title="Recent Conversations" action={
      <Link href={`/agency/agencies/${agencyId}/conversations`} style={{ fontSize: 13, fontWeight: 600, color: "#10b981", textDecoration: "none" }}>
        View All →
      </Link>
    }>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {conversations.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: UI_COLORS.textMuted, fontSize: 13 }}>
            No recent conversations found.
          </div>
        ) : (
          conversations.map((c, idx) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 0", borderBottom: idx === conversations.length - 1 ? "none" : `1px solid ${UI_COLORS.border}`
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={14} />
                    {c.patientName || "Anonymous"}
                  </span>
                  <span style={{ fontSize: 12, color: UI_COLORS.textMuted, display: "flex", alignItems: "center", gap: 3 }}>
                    <Globe size={12} />
                    {c.language?.toUpperCase() || "EN"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>
                  {c.treatmentCategory || c.subTreatment || "Exploring Options"}
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <Badge 
                  label={c.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} 
                  variant={STATUS_COLORS[c.status] || "default"} 
                />
                <span style={{ fontSize: 11, color: UI_COLORS.textMuted }}>
                  {c.lastActivityAt ? formatDistanceToNow(c.lastActivityAt?.toDate ? c.lastActivityAt.toDate() : new Date(c.lastActivityAt), { addSuffix: true }) : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
