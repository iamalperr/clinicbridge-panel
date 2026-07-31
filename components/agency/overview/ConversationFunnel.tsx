"use client";

import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { ArrowDown } from "lucide-react";

interface ConversationFunnelProps {
  metrics: {
    totalConversations: number;
    qualified: number;
    clinicRecommended: number;
    quoteRequests: number;
    appointments: number;
  };
}

export default function ConversationFunnel({ metrics }: ConversationFunnelProps) {
  const steps = [
    { label: "Conversations", value: metrics.totalConversations, color: "#10b981" },
    { label: "Qualified", value: metrics.qualified, color: "#3b82f6" },
    { label: "Clinic Recommendations", value: metrics.clinicRecommended, color: "#8b5cf6" },
    { label: "Quote Requests", value: metrics.quoteRequests, color: "#f59e0b" },
    { label: "Appointments", value: metrics.appointments, color: "#ef4444" },
  ];

  return (
    <SectionCard title="AI Conversation Funnel">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const pct = metrics.totalConversations > 0 
            ? Math.round((step.value / metrics.totalConversations) * 100) 
            : 0;

          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              <div style={{
                width: "100%",
                maxWidth: 260,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderRadius: 8,
                background: `linear-gradient(90deg, ${step.color}15, ${step.color}05)`,
                border: `1px solid ${step.color}40`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                  {step.value} {step.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: step.color, opacity: 0.8 }}>
                  {pct}%
                </span>
              </div>
              
              {!isLast && (
                <div style={{ padding: "8px 0" }}>
                  <ArrowDown size={16} color={UI_COLORS.textMuted} style={{ opacity: 0.5 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
