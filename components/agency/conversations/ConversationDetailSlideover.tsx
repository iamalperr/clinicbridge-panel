"use client";

import { X, User, Globe, Calendar, Bot } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { Conversation } from "@/lib/types/conversation";
import Badge from "@/components/ui/Badge";
import { format } from "date-fns";

interface Props {
  conversation: Conversation | null;
  onClose: () => void;
}

export default function ConversationDetailSlideover({ conversation, onClose }: Props) {
  if (!conversation) return null;

  const history = conversation.history || [];

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999,
          backdropFilter: "blur(2px)", animation: "fadeIn 0.2s ease"
        }}
      />
      
      {/* Slideover */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 600, maxWidth: "100%",
        background: "var(--bg-app)", zIndex: 1000, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", animation: "slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: `1px solid ${UI_COLORS.border}`, background: "#ffffff"
        }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 4 }}>
              Conversation Details
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: UI_COLORS.textMuted }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><User size={14} /> {conversation.patientName || "Anonymous"}</span>
              <span>•</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Globe size={14} /> {conversation.language?.toUpperCase() || "EN"}</span>
              <span>•</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar size={14} /> {conversation.createdAt ? format(conversation.createdAt.toDate ? conversation.createdAt.toDate() : new Date(conversation.createdAt), "MMM d, HH:mm") : ""}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ 
            background: "none", border: "none", cursor: "pointer", padding: 8,
            color: UI_COLORS.textMuted, borderRadius: "50%"
          }} onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <X size={20} />
          </button>
        </div>

        {/* Content Tabs / Info */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, background: "#ffffff", borderBottom: `1px solid ${UI_COLORS.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginBottom: 4 }}>Treatment Interest</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{conversation.subTreatment || conversation.treatmentCategory || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginBottom: 4 }}>Preferred Location</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{conversation.location || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginBottom: 4 }}>Status</div>
              <Badge label={conversation.status} variant={conversation.status === "active" ? "info" : "success"} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginBottom: 4 }}>AI Completion</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#10b981" }}>{conversation.aiCompletionRate}%</div>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Bot size={16} color="#10b981" /> Transcript
          </h4>
          
          {history.length === 0 && <div style={{ fontSize: 13, color: UI_COLORS.textMuted }}>No messages logged yet.</div>}
          
          {history.map((msg, idx) => (
            <div key={idx} style={{
              display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 12
            }}>
              <div style={{
                background: msg.role === "user" ? "#0f172a" : "#ffffff",
                color: msg.role === "user" ? "#fff" : UI_COLORS.textPrimary,
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                border: msg.role === "user" ? "none" : `1px solid ${UI_COLORS.border}`,
                fontSize: 14, lineHeight: 1.5, maxWidth: "85%", whiteSpace: "pre-wrap"
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
        
        <style>{`
          @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    </>
  );
}
