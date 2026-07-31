"use client";

import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";

interface ConversationHealthCardProps {
  metrics: {
    totalConversations: number;
    todaysConversations: number;
    clinicRecommended: number;
    quoteRequests: number;
    appointments: number;
    avgCompletionRate: number;
  };
}

export default function ConversationHealthCard({ metrics }: ConversationHealthCardProps) {
  const data = [
    { label: "Total Conversations", value: metrics.totalConversations },
    { label: "Today's Conversations", value: metrics.todaysConversations },
    { label: "Clinic Recommended", value: metrics.clinicRecommended },
    { label: "Quote Requests", value: metrics.quoteRequests },
    { label: "Appointments", value: metrics.appointments },
    { label: "AI Completion", value: `${metrics.avgCompletionRate}%` },
  ];

  return (
    <SectionCard title="Conversation Health">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.map((item, idx) => (
          <div key={idx} style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            padding: "8px 0", 
            borderBottom: idx === data.length - 1 ? "none" : `1px dotted ${UI_COLORS.border}`
          }}>
            <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>
              {item.label}
              {idx < 5 && "".padEnd(20 - item.label.length, ".")}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
