"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToAgency,
  subscribeToAgencyDashboard,
} from "@/lib/services/agencyService";
import { subscribeToLeads } from "@/lib/services/leadService";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  Users2,
  UserPlus,
  Building2,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { Agency, AgencyDashboardMetrics, Lead } from "@/lib/types/agency";
import {
  TREATMENT_CATEGORIES,
  LEAD_STATUSES,
  EMPTY_AGENCY_METRICS,
} from "@/lib/types/agency";

export default function AgencyDashboardPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [metrics, setMetrics] = useState<AgencyDashboardMetrics>(EMPTY_AGENCY_METRICS);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) return;

    const unsub1 = subscribeToAgency(agencyId, (a) => {
      setAgency(a);
      setLoading(false);
    });

    const unsub2 = subscribeToAgencyDashboard(agencyId, setMetrics);

    const unsub3 = subscribeToLeads(agencyId, (leads) => {
      setRecentLeads(leads.slice(0, 5));
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [agencyId]);

  if (!agencyId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>
          No Agency Assigned
        </h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          Your account is not linked to any agency. Contact admin.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          height: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2
          size={32}
          style={{ animation: "spin 1s linear infinite" }}
          color="#10b981"
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const categoryEntries = Object.entries(metrics.leadsByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const countryEntries = Object.entries(metrics.leadsByCountry)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      {/* Page Title */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: UI_COLORS.textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          {agency?.name || "Agency"} Dashboard
        </h1>
        <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
          Lead management and clinic performance overview
        </p>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard
          label="Total Leads"
          value={metrics.totalLeads}
          icon={<Users2 size={20} />}
        />
        <StatCard
          label="New Leads"
          value={metrics.newLeads}
          icon={<UserPlus size={20} />}
        />
        <StatCard
          label="Assigned"
          value={metrics.assignedLeads}
          icon={<Building2 size={20} />}
        />
        <StatCard
          label="Converted"
          value={metrics.convertedLeads}
          icon={<TrendingUp size={20} />}
        />
      </div>

      {/* Two column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 28,
        }}
      >
        {/* By Treatment Category */}
        <SectionCard title="Leads by Treatment Category">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categoryEntries.length === 0 && (
              <p style={{ color: UI_COLORS.textMuted, fontSize: 13 }}>
                No leads yet
              </p>
            )}
            {categoryEntries.map(([cat, count]) => {
              const label =
                TREATMENT_CATEGORIES[cat as keyof typeof TREATMENT_CATEGORIES]
                  ?.en || cat;
              const pct =
                metrics.totalLeads > 0
                  ? Math.round((count / metrics.totalLeads) * 100)
                  : 0;
              return (
                <div
                  key={cat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 600,
                      color: UI_COLORS.textPrimary,
                    }}
                  >
                    {label}
                  </span>
                  <div
                    style={{
                      width: 120,
                      height: 6,
                      background: "rgba(16, 185, 129, 0.1)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "#10b981",
                        borderRadius: 3,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: UI_COLORS.textSecondary,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* By Country */}
        <SectionCard title="Leads by Country">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {countryEntries.length === 0 && (
              <p style={{ color: UI_COLORS.textMuted, fontSize: 13 }}>
                No leads yet
              </p>
            )}
            {countryEntries.map(([country, count]) => {
              const pct =
                metrics.totalLeads > 0
                  ? Math.round((count / metrics.totalLeads) * 100)
                  : 0;
              return (
                <div
                  key={country}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 600,
                      color: UI_COLORS.textPrimary,
                    }}
                  >
                    {country}
                  </span>
                  <div
                    style={{
                      width: 120,
                      height: 6,
                      background: "rgba(59, 130, 246, 0.1)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "#3b82f6",
                        borderRadius: 3,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: UI_COLORS.textSecondary,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Recent Leads */}
      <SectionCard
        title="Recent Leads"
        action={
          <Link
            href="/agency/leads"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#10b981",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View All <ArrowRight size={14} />
          </Link>
        }
      >
        {recentLeads.length === 0 ? (
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13 }}>
            No leads yet. Leads will appear here once patients interact with your
            widget.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/agency/leads/${lead.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--bg-app)",
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: UI_COLORS.textPrimary,
                    }}
                  >
                    {lead.patientName || "Anonymous Patient"}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: UI_COLORS.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {TREATMENT_CATEGORIES[lead.treatmentCategory]?.en ||
                      lead.treatmentCategory}{" "}
                    · {lead.country} · {lead.language?.toUpperCase()}
                  </p>
                </div>
                <Badge
                  label={
                    LEAD_STATUSES[lead.status]?.en || lead.status
                  }
                  variant={
                    lead.status === "new"
                      ? "info"
                      : lead.status === "converted"
                      ? "success"
                      : lead.status === "lost"
                      ? "danger"
                      : "warning"
                  }
                />
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
