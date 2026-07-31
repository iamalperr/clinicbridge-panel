"use client";

import { useEffect, useState } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import { Loader2 } from "lucide-react";
import ConversationHealthCard from "@/components/agency/overview/ConversationHealthCard";
import ConversationFunnel from "@/components/agency/overview/ConversationFunnel";
import RecentConversationsPanel from "@/components/agency/overview/RecentConversationsPanel";
import { subscribeToRecentConversations, getConversationStats } from "@/lib/services/conversationService";
import type { Conversation } from "@/lib/types/conversation";

export default function AgencyOverviewPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t } = useI18n();

  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    // Subscribe to latest 5 conversations
    const unsub = subscribeToRecentConversations(agencyId, 5, (data) => {
      if (isMounted) setRecentConversations(data);
    });

    // Fetch initial stats
    getConversationStats(agencyId).then(data => {
      if (isMounted) {
        setStats(data);
        setLoading(false);
      }
    }).catch(err => {
      console.error("Failed to load conversation stats", err);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [agencyId]);

  if (loading) {
    return (
      <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Fallback if stats didn't load properly
  const safeStats = stats || {
    totalConversations: 0, todaysConversations: 0, clinicRecommended: 0,
    quoteRequests: 0, appointments: 0, avgCompletionRate: 0, qualified: 0
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Title Area */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          {t("portal.tabs.overview") || "Overview"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Monitor your AI matching operations and lead conversion performance.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
        
        {/* Left Column: Funnel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <ConversationHealthCard metrics={safeStats} />
          <ConversationFunnel metrics={safeStats} />
        </div>

        {/* Right Column: Recent Activity */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <RecentConversationsPanel conversations={recentConversations} agencyId={agencyId} />
        </div>
        
      </div>
    </div>
  );
}
