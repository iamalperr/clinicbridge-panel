"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import SectionCard from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import type { AgencyClinic } from "@/lib/types/agency";
import type { AgencyMatchingRuleDoc } from "@/lib/types/matching";
import {
  FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS,
  PLATFORM_MAX_RECOMMENDED_CLINICS,
  buildFeelinHealthyMigrationRules,
  buildMatchingRuleId,
} from "@/lib/agency/agencyMatchingRules";

const BRANCH_LABELS: Record<string, { tr: string; en: string }> = {
  dental: { tr: "Diş Tedavisi", en: "Dental" },
  ivf: { tr: "Tüp Bebek (IVF)", en: "IVF" },
  cardiology: { tr: "Kardiyoloji", en: "Cardiology" },
  check_up: { tr: "Check-Up", en: "Check-Up" },
  eye_treatments: { tr: "Göz Tedavisi", en: "Eye Treatments" },
  hair_transplant: { tr: "Saç Ekimi", en: "Hair Transplant" },
  aesthetic_surgery: { tr: "Estetik & Plastik Cerrahi", en: "Aesthetic Surgery" },
};

const SIDE_LABELS: Record<string, { tr: string; en: string }> = {
  anatolian: { tr: "Anadolu Yakası", en: "Anatolian Side" },
  european: { tr: "Avrupa Yakası", en: "European Side" },
  any: { tr: "—", en: "—" },
};

function clinicLabel(c: AgencyClinic): string {
  return String(
    (c as any).clinicName ||
      (c as any).displayNameTr ||
      (c as any).name ||
      c.id
  );
}

interface Props {
  agencyId: string;
  clinics: AgencyClinic[];
  language: string;
  t: (key: string) => string;
}

export default function AgencyRecommendationRulesPanel({
  agencyId,
  clinics,
  language,
  t,
}: Props) {
  const { getToken } = useAuth();
  const isTr = language === "tr";
  const [rules, setRules] = useState<AgencyMatchingRuleDoc[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeClinics = useMemo(
    () =>
      clinics.filter((c) => {
        const status = String((c as any).status || "active").toLowerCase();
        if (status !== "active") return false;
        if (FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS.has(c.id)) return false;
        return true;
      }),
    [clinics]
  );

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const q = collection(db, "agencies", agencyId, "matchingRules");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => {
          const data = d.data() as Omit<AgencyMatchingRuleDoc, "id">;
          return { id: d.id, ...data, agencyId } as AgencyMatchingRuleDoc;
        });
        setRules(next);
        const d: Record<string, string[]> = {};
        for (const r of next) {
          d[r.id] = [...(r.clinicIds || [])].slice(0, PLATFORM_MAX_RECOMMENDED_CLINICS);
        }
        setDrafts(d);
        setLoading(false);
      },
      (err) => {
        console.error("[matchingRules subscribe]", err);
        setError(isTr ? "Kurallar yüklenemedi." : "Failed to load rules.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [agencyId, isTr]);

  const labelBranch = (b: string) =>
    (BRANCH_LABELS[b] || { tr: b, en: b })[isTr ? "tr" : "en"];
  const labelSide = (s: string) =>
    (SIDE_LABELS[s] || { tr: s, en: s })[isTr ? "tr" : "en"];
  const labelCity = (c: string) =>
    c === "istanbul"
      ? isTr
        ? "İstanbul"
        : "Istanbul"
      : c.charAt(0).toUpperCase() + c.slice(1);

  const clinicName = useCallback(
    (id: string) => {
      const found = clinics.find((c) => c.id === id);
      return found ? clinicLabel(found) : id;
    },
    [clinics]
  );

  const setSlot = (ruleId: string, slot: 0 | 1, clinicId: string) => {
    setDrafts((prev) => {
      const current = [...(prev[ruleId] || [])];
      while (current.length < PLATFORM_MAX_RECOMMENDED_CLINICS) current.push("");
      current[slot] = clinicId;
      // Prevent duplicate same clinic in both slots
      if (slot === 0 && current[1] === clinicId) current[1] = "";
      if (slot === 1 && current[0] === clinicId) current[0] = "";
      return { ...prev, [ruleId]: current.filter((x, i) => x || i === 0 || i === 1) };
    });
  };

  const swapSlots = (ruleId: string) => {
    setDrafts((prev) => {
      const current = [...(prev[ruleId] || [])];
      const a = current[0] || "";
      const b = current[1] || "";
      return { ...prev, [ruleId]: [b, a].filter(Boolean).length ? [b || "", a || ""] : [] };
    });
  };

  const saveRule = async (rule: AgencyMatchingRuleDoc) => {
    setSavingId(rule.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError(isTr ? "Oturum bulunamadı." : "Authentication required.");
        return;
      }
      const clinicIds = (drafts[rule.id] || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, PLATFORM_MAX_RECOMMENDED_CLINICS);

      const res = await fetch(`/api/agency/${agencyId}/matching-rules`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ruleId: rule.id,
          treatmentBranch: rule.treatmentBranch,
          city: rule.city,
          side: rule.side,
          clinicIds,
          enabled: rule.enabled !== false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          data.message ||
            data.error ||
            (isTr ? "Kayıt başarısız." : "Save failed.")
        );
        return;
      }
      setSavedId(rule.id);
      setTimeout(() => setSavedId(null), 2500);
    } catch (e) {
      console.error(e);
      setError(isTr ? "Kayıt başarısız." : "Save failed.");
    } finally {
      setSavingId(null);
    }
  };

  const resetRuleToLegacy = async (rule: AgencyMatchingRuleDoc) => {
    const legacy = buildFeelinHealthyMigrationRules(agencyId).find(
      (r) =>
        r.treatmentBranch === rule.treatmentBranch &&
        r.city === rule.city &&
        r.side === rule.side
    );
    if (!legacy) return;
    setDrafts((prev) => ({
      ...prev,
      [rule.id]: [...legacy.clinicIds].slice(0, PLATFORM_MAX_RECOMMENDED_CLINICS),
    }));
  };

  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => {
      const ba = `${a.treatmentBranch}|${a.city}|${a.side}`;
      const bb = `${b.treatmentBranch}|${b.city}|${b.side}`;
      return ba.localeCompare(bb);
    });
  }, [rules]);

  if (loading) {
    return (
      <SectionCard title={t("portal.matching.recommendationRules")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI_COLORS.textMuted }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          {isTr ? "Yükleniyor…" : "Loading…"}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("portal.matching.recommendationRules")}>
      <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginBottom: 16 }}>
        {t("portal.matching.recommendationRulesDesc")}
      </p>
      <p style={{ fontSize: 12, color: UI_COLORS.textSecondary, marginBottom: 16 }}>
        {isTr
          ? `Hasta görünümü en fazla ${PLATFORM_MAX_RECOMMENDED_CLINICS} klinik (platform limiti).`
          : `Patient-facing max is ${PLATFORM_MAX_RECOMMENDED_CLINICS} clinics (platform limit).`}
      </p>

      {error && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {sortedRules.length === 0 ? (
        <p style={{ fontSize: 13, color: UI_COLORS.textMuted, fontStyle: "italic" }}>
          {t("portal.matching.noRecommendationRules")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedRules.map((rule) => {
            const draft = drafts[rule.id] || [];
            const slot0 = draft[0] || "";
            const slot1 = draft[1] || "";
            const optionsFor = (otherSlot: string) =>
              activeClinics.filter((c) => c.id !== otherSlot);

            return (
              <div
                key={rule.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`,
                  background: "var(--bg-app)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: UI_COLORS.textPrimary,
                      }}
                    >
                      {labelBranch(rule.treatmentBranch)}
                    </p>
                    <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginTop: 2 }}>
                      {labelCity(rule.city)}
                      {rule.side !== "any" ? ` · ${labelSide(rule.side)}` : ""}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: rule.enabled !== false ? "#059669" : UI_COLORS.textMuted,
                      alignSelf: "flex-start",
                    }}
                  >
                    {rule.enabled !== false
                      ? isTr
                        ? "Aktif"
                        : "Enabled"
                      : isTr
                        ? "Kapalı"
                        : "Disabled"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: UI_COLORS.textMuted }}>
                      {isTr ? "Klinik 1" : "Clinic 1"}
                    </span>
                    <select
                      value={slot0}
                      onChange={(e) => setSlot(rule.id, 0, e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${UI_COLORS.border}`,
                        fontSize: 13,
                        background: "var(--bg-app)",
                        color: UI_COLORS.textPrimary,
                      }}
                    >
                      <option value="">{isTr ? "— Seçin —" : "— Select —"}</option>
                      {optionsFor(slot1).map((c) => (
                        <option key={c.id} value={c.id}>
                          {clinicLabel(c)}
                        </option>
                      ))}
                      {slot0 && !activeClinics.some((c) => c.id === slot0) && (
                        <option value={slot0}>{clinicName(slot0)} (stale)</option>
                      )}
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: UI_COLORS.textMuted }}>
                      {isTr ? "Klinik 2" : "Clinic 2"}
                    </span>
                    <select
                      value={slot1}
                      onChange={(e) => setSlot(rule.id, 1, e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${UI_COLORS.border}`,
                        fontSize: 13,
                        background: "var(--bg-app)",
                        color: UI_COLORS.textPrimary,
                      }}
                    >
                      <option value="">{isTr ? "— (isteğe bağlı) —" : "— (optional) —"}</option>
                      {optionsFor(slot0).map((c) => (
                        <option key={c.id} value={c.id}>
                          {clinicLabel(c)}
                        </option>
                      ))}
                      {slot1 && !activeClinics.some((c) => c.id === slot1) && (
                        <option value={slot1}>{clinicName(slot1)} (stale)</option>
                      )}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => swapSlots(rule.id)}
                    title={isTr ? "Sırayı değiştir" : "Swap order"}
                    style={{
                      height: 38,
                      width: 38,
                      borderRadius: 8,
                      border: `1px solid ${UI_COLORS.border}`,
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: UI_COLORS.textSecondary,
                    }}
                  >
                    <ArrowDownUp size={16} />
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {agencyId === "feelinhealthy" ||
                  buildMatchingRuleId(rule.treatmentBranch, rule.city, rule.side) ===
                    rule.id ? (
                    <Button
                      variant="secondary"
                      onClick={() => resetRuleToLegacy(rule)}
                      type="button"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <RotateCcw size={14} />
                        {t("portal.matching.resetToDefault")}
                      </span>
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => saveRule(rule)}
                    isLoading={savingId === rule.id}
                    type="button"
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {savedId === rule.id ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Save size={16} />
                      )}
                      {savedId === rule.id
                        ? t("portal.matching.saved")
                        : t("portal.matching.saveRule")}
                    </span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
