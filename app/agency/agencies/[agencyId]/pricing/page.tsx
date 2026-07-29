"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToPricing } from "@/lib/services/pricingService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { DollarSign, Search, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import type { ClinicTreatmentPrice } from "@/lib/types/matching";
import type { AgencyClinic } from "@/lib/types/agency";
import { useI18n } from "@/lib/i18n-context";
import Link from "next/link";

export default function PricingPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();

  const [pricing, setPricing] = useState<ClinicTreatmentPrice[]>([]);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    unsubs.push(subscribeToPricing(agencyId, (d) => { setPricing(d); checkDone(); }));
    unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  if (!agencyId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>{t("portal.common.noAgencySelected")}</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          {isSuperAdmin(profile?.role) ? t("portal.common.selectAgency") : t("portal.common.notLinked")}
        </p>
      </div>
    );
  }

  // Only show pricing that is associated with a clinic
  const clinicPricing = pricing.filter((p) => !!p.clinicId && (!search || p.treatmentName.toLowerCase().includes(search.toLowerCase()) || (p.clinicName || "").toLowerCase().includes(search.toLowerCase())));

  const priceTypeLabel = (pt: string) => {
    const map: Record<string, string> = {
      average: t("portal.pricing.average"),
      starting_from: t("portal.pricing.startingFrom"),
      package: t("portal.pricing.package"),
      per_unit: t("portal.pricing.perUnit"),
      per_tooth: language === "tr" ? "Diş Başına" : "Per Tooth",
      per_session: language === "tr" ? "Seans Başına" : "Per Session",
      per_jaw: language === "tr" ? "Çene Başına" : "Per Jaw",
    };
    return map[pt] || pt;
  };

  const renderPricingTable = (items: ClinicTreatmentPrice[]) => {
    if (items.length === 0) return null;
    const groups = new Map<string, ClinicTreatmentPrice[]>();
    items.forEach((p) => {
      const g = (p as any).priceGroup || "—";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    });
    return (
      <div style={{ background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={16} color="#10b981" />
          <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{language === "tr" ? "Klinik Fiyatları" : "Clinic Pricing"}</span>
          <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>({items.length})</span>
        </div>
        {Array.from(groups.entries()).map(([group, gItems]) => (
          <div key={group}>
            {group !== "—" && (
              <div style={{ padding: "8px 20px", background: "rgba(16,185,129,0.03)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5 }}>{group}</span>
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  {[t("portal.pricing.treatment"), t("portal.pricing.clinic"), t("portal.pricing.priceRange"), language === "tr" ? "Süre" : "Duration", t("portal.pricing.type"), ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: UI_COLORS.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gItems.map((p) => {
                  const clinicDoc = clinics.find(c => c.clinicId === p.clinicId);
                  const clinicDocId = clinicDoc?.id;
                  
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: UI_COLORS.textPrimary }}>{(p as any).subTreatmentName || p.treatmentName}</td>
                      <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>{p.clinicName}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontWeight: 700, color: "#10b981" }}>
                          {p.priceMin === p.priceMax ? `${p.priceMin} ${p.currency}` : `${p.priceMin}–${p.priceMax} ${p.currency}`}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>{(p as any).duration || "—"}</td>
                      <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>{priceTypeLabel(p.priceType)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {clinicDocId && (
                          <Link href={`/agency/agencies/${agencyId}/clinics/${clinicDocId}?tab=pricing`} style={{ textDecoration: "none" }}>
                            <button style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", color: UI_COLORS.textPrimary, cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                              {language === "tr" ? "Kliniğe Git" : "Go to Clinic"} <ArrowRight size={14} />
                            </button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            {language === "tr" ? "Klinik Fiyatları" : "Clinic Prices"}
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4, maxWidth: 600, lineHeight: 1.5 }}>
            {language === "tr" 
              ? "Bu ekranda acentaya bağlı kliniklerin doğrulanmış fiyat kayıtlarını toplu olarak görüntüleyebilirsiniz. Fiyat düzenlemeleri ilgili klinik profilinden yapılır." 
              : "In this screen, you can view the verified pricing records of the clinics associated with the agency in bulk. Price adjustments are made from the respective clinic profile."}
          </p>
        </div>
      </div>

      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
        <input type="text" placeholder={t("portal.pricing.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : clinicPricing.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}` }}>
          <DollarSign size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>{t("portal.pricing.noPricing")}</h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            {t("portal.pricing.noPricingDesc")}
          </p>
        </div>
      ) : (
        renderPricingTable(clinicPricing)
      )}
    </div>
  );
}
