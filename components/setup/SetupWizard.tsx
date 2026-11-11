"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  MessageSquareWarning,
  Plus,
  Sparkles,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Logo from "@/components/ui/Logo";
import { UI_COLORS } from "@/components/ui/ui-shared";
import KnowledgeEditor, {
  EMPTY_KNOWLEDGE_VALUES,
  type KnowledgeEditorMode,
  type KnowledgeEditorValues,
} from "@/components/clinic/training/KnowledgeEditor";
import SetupHoursPicker from "@/components/setup/SetupHoursPicker";
import SetupSectionCard from "@/components/setup/SetupSectionCard";
import {
  setupAddBtn,
  setupChip,
  setupChipActive,
  setupHelper,
  setupIconBtn,
  setupListItem,
  setupStickyBar,
} from "@/components/setup/setupStyles";
import { setupProfilePercent } from "@/lib/setup/completion";
import type { SetupFaqInput, SetupTreatmentInput } from "@/lib/setup/materials";
import { buildSetupPreviewReply, setupSampleQuestion } from "@/lib/setup/previewReply";
import {
  applyWeekdaysFromMonday,
  defaultWeeklyHours,
  serializeWorkingHours,
  tryParseWorkingHours,
  type WeeklyHoursState,
} from "@/lib/setup/workingHours";

interface SetupPayload {
  clinicId: string;
  clinicName?: string;
  treatments: SetupTreatmentInput[];
  hours: string;
  faq: SetupFaqInput[];
  doNotSay: string;
  appointmentEmail: string;
  appointmentWhatsapp: string;
  widgetInstalledAt: string | null;
  installedDomain: string | null;
  embedCode: string;
}

const TREATMENT_CHIPS = [
  "İmplant",
  "Diş beyazlatma",
  "Zirkonyum kaplama",
  "Saç ekimi",
  "Burun estetiği",
  "Hollywood gülüşü",
];

const FAQ_STARTERS = [
  { question: "İmplant tedavisi ne kadar sürer?", answer: "" },
  { question: "İlk muayene ücretli mi?", answer: "" },
  { question: "Yurt dışından geliyorum, transfer var mı?", answer: "" },
];

const DO_NOT_SAY_CHIPS = [
  "Kesin fiyat vermesin",
  "Teşhis koymasın",
  "İndirim sözü vermesin",
  "Başka klinik önermesin",
];

type EditorKind = "treatment" | "faq" | "knowledge" | null;

export default function SetupWizard({
  forceFixture = false,
  fixtureEmpty = false,
  fixtureStep = 0,
}: {
  forceFixture?: boolean;
  fixtureEmpty?: boolean;
  fixtureStep?: 0 | 1 | 2;
}) {
  const { t, language, setLanguage } = useI18n();
  const { loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const fixtureMode = forceFixture;

  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [treatments, setTreatments] = useState<SetupTreatmentInput[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHoursState>(() => defaultWeeklyHours());
  const [hoursLegacyRaw, setHoursLegacyRaw] = useState<string | null>(null);
  const [faq, setFaq] = useState<SetupFaqInput[]>([]);
  const [doNotSayExtra, setDoNotSayExtra] = useState("");
  const [doNotSayChips, setDoNotSayChips] = useState<string[]>([]);
  const [appointmentEmail, setAppointmentEmail] = useState("");
  const [appointmentWhatsapp, setAppointmentWhatsapp] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [embedCode, setEmbedCode] = useState("");
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [installedDomain, setInstalledDomain] = useState<string | null>(null);
  const [tab, setTab] = useState<"code" | "wordpress" | "agency">("code");
  const [copied, setCopied] = useState(false);
  const [agencyEmail, setAgencyEmail] = useState("");
  const [agencyNote, setAgencyNote] = useState("");
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [editorKind, setEditorKind] = useState<EditorKind>(null);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [editorInitial, setEditorInitial] = useState(EMPTY_KNOWLEDGE_VALUES);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorSuccess, setEditorSuccess] = useState(false);
  const [extraNotes, setExtraNotes] = useState<Array<{ id: string; title: string; content: string; entity_type: string }>>([]);

  /** While legacy free-text hours are unconfirmed, keep the original string (do not overwrite). */
  const hoursText = useMemo(
    () => (hoursLegacyRaw != null ? hoursLegacyRaw : serializeWorkingHours(weeklyHours)),
    [hoursLegacyRaw, weeklyHours]
  );
  const doNotSay = useMemo(() => {
    const chips = doNotSayChips.join(" · ");
    return [chips, doNotSayExtra.trim()].filter(Boolean).join("\n");
  }, [doNotSayChips, doNotSayExtra]);

  const percent = setupProfilePercent({
    treatments,
    hours: hoursText,
    faq,
    doNotSay,
    appointmentEmail,
    appointmentWhatsapp,
    widgetInstalled: Boolean(installedAt),
  });

  /** Deterministic client-side preview — no LLM, no conversation logs, no usage. */
  const previewReply = useMemo(
    () => buildSetupPreviewReply({ treatments, hours: hoursText, faq }),
    [treatments, hoursText, faq]
  );

  function applyHoursFromClinic(raw: string) {
    const parsed = tryParseWorkingHours(raw);
    if (parsed.ok) {
      setWeeklyHours(parsed.state);
      setHoursLegacyRaw(null);
      return;
    }
    setHoursLegacyRaw(parsed.raw);
    setWeeklyHours(defaultWeeklyHours());
  }

  function confirmHoursMigration() {
    setHoursLegacyRaw(null);
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const load = useCallback(
    async (mode: "full" | "install") => {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("/api/clinics/setup", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        setError("loadFailed");
        setReady(true);
        return;
      }
      const data = (await response.json()) as SetupPayload;
      setClinicId(data.clinicId);
      setEmbedCode(data.embedCode);
      setInstalledAt(data.widgetInstalledAt);
      setInstalledDomain(data.installedDomain);
      if (mode === "full") {
        setTreatments(data.treatments);
        applyHoursFromClinic(data.hours || "");
        setFaq(data.faq);
        const { chips, extra } = splitDoNotSay(data.doNotSay);
        setDoNotSayChips(chips);
        setDoNotSayExtra(extra);
        setAppointmentEmail(data.appointmentEmail);
        setAppointmentWhatsapp(data.appointmentWhatsapp);
        setHydrated(true);
      }
      setReady(true);
    },
    [getToken]
  );

  useEffect(() => {
    if (fixtureMode) {
      setClinicId("fixture-clinic");
      setEmbedCode('<script\n  src="https://widget.clinicbridge-ai.com/widget.js"\n  data-clinic-id="fixture"\n  async>\n</script>');
      setStep(fixtureStep);
      if (fixtureEmpty) {
        setTreatments([]);
        applyHoursFromClinic("");
        setFaq([]);
        setDoNotSayChips([]);
        setDoNotSayExtra("");
      } else {
        setTreatments([{ name: "İmplant", priceRange: "15.000–25.000 TL", note: "Muayene sonrası netleşir" }]);
        applyHoursFromClinic("Pzt-Cuma 09:00-18:00");
        setFaq([{ question: "İmplant tedavisi ne kadar sürer?", answer: "Genellikle iki ziyaret planlanır." }]);
        setDoNotSayChips(["Kesin fiyat vermesin", "Teşhis koymasın"]);
        setAppointmentEmail("klinik@example.com");
      }
      setHydrated(true);
      setReady(true);
      return;
    }
    if (!authLoading) void load("full");
  }, [authLoading, load, fixtureMode, fixtureEmpty, fixtureStep]);

  useEffect(() => {
    if (step !== 2) return;
    const timer = window.setInterval(() => void load("install"), 4000);
    return () => window.clearInterval(timer);
  }, [step, load]);

  const persist = useCallback(async (complete = false) => {
    if (fixtureMode) {
      setSaveState("saved");
      window.setTimeout(() => setSaveState((current) => (current === "saved" ? "idle" : current)), 1200);
      return true;
    }
    const token = await getToken();
    if (!token) return false;
    setSaving(true);
    setSaveState("saving");
    setError("");
    try {
      const response = await fetch("/api/clinics/setup", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          treatments,
          hours: hoursText,
          faq,
          doNotSay,
          appointmentEmail,
          appointmentWhatsapp,
          complete,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error === "contact_required" ? "contactRequired" : "loadFailed");
        setSaveState("error");
        return false;
      }
      setSaveState("saved");
      window.setTimeout(() => setSaveState((current) => (current === "saved" ? "idle" : current)), 2000);
      return true;
    } catch {
      setSaveState("error");
      setError("loadFailed");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    fixtureMode,
    getToken,
    treatments,
    hoursText,
    faq,
    doNotSay,
    appointmentEmail,
    appointmentWhatsapp,
  ]);

  // Debounced autosave (≥1s after edits settle). Skips the hydrate burst; never writes on every keystroke.
  const autosaveArmed = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    autosaveArmed.current = false;
    const arm = window.setTimeout(() => {
      autosaveArmed.current = true;
    }, 50);
    return () => window.clearTimeout(arm);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !ready || fixtureMode || !autosaveArmed.current) return;
    // hoursText keeps legacy raw when unconfirmed, so other fields can autosave without overwriting hours.
    const timer = window.setTimeout(() => {
      void persist(false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    ready,
    fixtureMode,
    treatments,
    weeklyHours,
    hoursLegacyRaw,
    faq,
    doNotSay,
    appointmentEmail,
    appointmentWhatsapp,
    persist,
  ]);

  async function next() {
    if (step === 1) {
      const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointmentEmail.trim());
      const hasWhatsapp = appointmentWhatsapp.replace(/\D/g, "").length >= 8;
      if (!hasEmail && !hasWhatsapp) {
        setError("contactRequired");
        return;
      }
    }
    const ok = await persist(false);
    if (ok) setStep((current) => Math.min(current + 1, 2));
  }

  async function finish() {
    const ok = await persist(true);
    if (ok && clinicId) router.replace(`/clinics/${clinicId}`);
  }

  async function sendAgency() {
    const token = await getToken();
    if (!token) return;
    setAgencyNote("");
    const response = await fetch("/api/clinics/setup/agency-email", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: agencyEmail }),
    });
    const payload = await response.json().catch(() => ({}));
    setAgencyNote(payload.emailSent ? t("setup.agencySent") : t("setup.agencyFailed"));
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  function openTreatmentEditor(index: number | null, seedName = "") {
    setEditorKind("treatment");
    setEditorIndex(index);
    if (index == null) {
      setEditorInitial({ ...EMPTY_KNOWLEDGE_VALUES, title: seedName, entity_type: "treatment_profile" });
    } else {
      const item = treatments[index];
      setEditorInitial({
        title: item.name,
        content: item.note || "",
        priceRange: item.priceRange || "",
        entity_type: "treatment_profile",
      });
    }
    setEditorSuccess(false);
  }

  function openFaqEditor(index: number | null, seed?: { question: string; answer: string }) {
    setEditorKind("faq");
    setEditorIndex(index);
    if (index == null) {
      setEditorInitial({
        ...EMPTY_KNOWLEDGE_VALUES,
        title: seed?.question || "",
        content: seed?.answer || "",
      });
    } else {
      const item = faq[index];
      setEditorInitial({
        ...EMPTY_KNOWLEDGE_VALUES,
        title: item.question,
        content: item.answer,
      });
    }
    setEditorSuccess(false);
  }

  function openKnowledgeEditor(index: number | null) {
    setEditorKind("knowledge");
    setEditorIndex(index);
    if (index == null) {
      setEditorInitial(EMPTY_KNOWLEDGE_VALUES);
    } else {
      const item = extraNotes[index];
      setEditorInitial({
        title: item.title,
        content: item.content,
        entity_type: item.entity_type,
        priceRange: "",
      });
    }
    setEditorSuccess(false);
  }

  async function handleEditorSave(values: KnowledgeEditorValues) {
    setEditorSaving(true);
    try {
      if (editorKind === "treatment") {
        const row: SetupTreatmentInput = {
          name: values.title.trim(),
          priceRange: values.priceRange.trim(),
          note: values.content.trim(),
        };
        setTreatments((current) =>
          editorIndex == null ? [...current, row] : current.map((item, index) => (index === editorIndex ? { ...item, ...row } : item))
        );
      } else if (editorKind === "faq") {
        const row: SetupFaqInput = { question: values.title.trim(), answer: values.content.trim() };
        setFaq((current) =>
          editorIndex == null ? [...current, row] : current.map((item, index) => (index === editorIndex ? { ...item, ...row } : item))
        );
      } else if (editorKind === "knowledge") {
        const row = {
          id: editorIndex == null ? `local-${Date.now()}` : extraNotes[editorIndex].id,
          title: values.title.trim(),
          content: values.content.trim(),
          entity_type: values.entity_type,
        };
        setExtraNotes((current) =>
          editorIndex == null ? [...current, row] : current.map((item, index) => (index === editorIndex ? row : item))
        );
      }
      setEditorSuccess(true);
      showToast("Eklendi");
      window.setTimeout(() => {
        setEditorKind(null);
        setEditorSuccess(false);
      }, 700);
      window.setTimeout(() => void persist(false), 0);
    } finally {
      setEditorSaving(false);
    }
  }

  function deleteTreatment(index: number) {
    if (!window.confirm("Bu tedaviyi silmek istiyor musunuz?")) return;
    setTreatments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function deleteFaq(index: number) {
    if (!window.confirm("Bu soruyu silmek istiyor musunuz?")) return;
    setFaq((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function deleteExtra(index: number) {
    if (!window.confirm("Bu bilgiyi silmek istiyor musunuz?")) return;
    setExtraNotes((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleDoNotSayChip(chip: string) {
    setDoNotSayChips((current) => (current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip]));
  }

  if (!ready) {
    return (
      <main style={shell}>
        <p style={{ color: UI_COLORS.textSecondary }}>{t("setup.saving")}</p>
      </main>
    );
  }

  const editorMode: KnowledgeEditorMode =
    editorKind === "treatment" ? "treatment" : editorKind === "faq" ? "faq" : "knowledge";
  const editorTitle =
    editorKind === "treatment"
      ? editorIndex == null
        ? "Tedavi ekle"
        : "Tedaviyi düzenle"
      : editorKind === "faq"
        ? editorIndex == null
          ? "Soru ekle"
          : "Soruyu düzenle"
        : editorIndex == null
          ? "Yeni Bilgi Ekle"
          : "Bilgiyi Düzenle";

  return (
    <main style={shell}>
      <div style={layoutStyle(isMobile)}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <Logo size="lg" />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: UI_COLORS.textMuted, fontWeight: 600 }}>
                {saveState === "saving"
                  ? t("setup.saving")
                  : saveState === "saved"
                    ? "Kaydedildi ✓"
                    : saveState === "error"
                      ? "Kaydedilemedi"
                      : ""}
              </span>
              <button type="button" onClick={() => setLanguage("tr")} style={langButton(language === "tr")}>
                TR
              </button>
              <button type="button" onClick={() => setLanguage("en")} style={langButton(language === "en")}>
                EN
              </button>
            </div>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px", marginBottom: 8 }}>
            {t("setup.title")}
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginBottom: 12 }}>{t("setup.subtitle")}</p>
          <p style={{ marginBottom: 16 }}>
            <a
              href="https://clinicbridge-ai.com/kurulum-rehberi"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: UI_COLORS.brand, fontWeight: 700, fontSize: 14 }}
            >
              {t("setup.guideLink")}
            </a>
          </p>

          <Stepper step={step} labels={[t("setup.stepFacts"), t("setup.stepContact"), t("setup.stepInstall")]} mobile={isMobile} />
          <CompletionBar percent={percent} />

          <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: isMobile ? 110 : 24 }}>
            {step === 0 ? (
              <>
                <SetupSectionCard
                  icon={<Stethoscope size={18} />}
                  title={t("setup.treatments")}
                  helper="Asistan bu tedaviler hakkında bilgi verir. Fiyat isteğe bağlı."
                >
                  {treatments.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ ...setupHelper, fontWeight: 600 }}>Henüz tedavi eklemediniz</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {TREATMENT_CHIPS.map((chip) => (
                          <button key={chip} type="button" style={setupChip} onClick={() => openTreatmentEditor(null, chip)}>
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {treatments.map((item, index) => (
                        <div key={`treatment-${index}`} style={setupListItem}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: UI_COLORS.textPrimary }}>{item.name}</div>
                            <div style={{ fontSize: 13, color: UI_COLORS.textMuted }}>
                              {item.priceRange?.trim() || "Fiyat belirtilmedi"}
                              {item.note?.trim() ? ` · ${item.note.trim()}` : ""}
                            </div>
                          </div>
                          <button type="button" data-testid="setup-edit-treatment" aria-label="Düzenle" style={setupIconBtn} onClick={() => openTreatmentEditor(index)}>
                            <Edit2 size={16} />
                          </button>
                          <button type="button" data-testid="setup-delete-treatment" aria-label="Sil" style={setupIconBtn} onClick={() => deleteTreatment(index)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" data-testid="setup-add-treatment" style={setupAddBtn} onClick={() => openTreatmentEditor(null)}>
                    <Plus size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                    Bilgi ekle
                  </button>
                </SetupSectionCard>

                <SetupSectionCard icon={<CalendarClock size={18} />} title={t("setup.hours")}>
                  {hoursLegacyRaw != null ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="setup-hours-legacy">
                      <p style={{ ...setupHelper, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                        Saatlerinizi yeni formatta onaylayın
                      </p>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          padding: 12,
                          borderRadius: 12,
                          border: `1px solid ${UI_COLORS.border}`,
                          background: UI_COLORS.bgInput,
                          color: UI_COLORS.textSecondary,
                          fontSize: 13.5,
                          lineHeight: 1.5,
                        }}
                      >
                        {hoursLegacyRaw}
                      </pre>
                      <p style={setupHelper}>
                        Mevcut metin korunur; kaydetmeden önce yeni formatı onaylamanız gerekir. Onaylayana kadar eski metin üzerine yazılmaz.
                      </p>
                      <Button type="button" variant="secondary" onClick={confirmHoursMigration}>
                        Yeni formatta düzenle
                      </Button>
                    </div>
                  ) : (
                    <SetupHoursPicker
                      value={weeklyHours}
                      onChange={setWeeklyHours}
                      onApplyWeekdays={() => setWeeklyHours((current) => applyWeekdaysFromMonday(current))}
                    />
                  )}
                </SetupSectionCard>

                <SetupSectionCard
                  icon={<Sparkles size={18} />}
                  title={t("setup.faq")}
                  helper="Hastaların en çok sorduğu 3–5 soru yeterli."
                >
                  {faq.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <p style={{ ...setupHelper, fontWeight: 600 }}>Önerilen sorular</p>
                      {FAQ_STARTERS.map((item) => (
                        <button key={item.question} type="button" style={setupAddBtn} onClick={() => openFaqEditor(null, item)}>
                          {item.question}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {faq.map((item, index) => {
                        const open = faqOpen === index;
                        return (
                          <div key={`faq-${index}`} style={{ border: `1px solid ${UI_COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
                            <button
                              type="button"
                              onClick={() => setFaqOpen(open ? null : index)}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "12px 14px",
                                background: UI_COLORS.bgInput,
                                border: 0,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <span style={{ flex: 1, fontWeight: 700, color: UI_COLORS.textPrimary }}>{item.question}</span>
                              {open ? <ChevronUp size={16} color={UI_COLORS.textMuted} /> : <ChevronDown size={16} color={UI_COLORS.textMuted} />}
                            </button>
                            {open ? (
                              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                                <p style={{ margin: 0, color: UI_COLORS.textSecondary, lineHeight: 1.55 }}>{item.answer || "Cevap henüz yazılmadı."}</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Button type="button" variant="secondary" onClick={() => openFaqEditor(index)}>
                                    Düzenle
                                  </Button>
                                  <Button type="button" variant="ghost" onClick={() => deleteFaq(index)}>
                                    Sil
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" data-testid="setup-add-faq" style={setupAddBtn} onClick={() => openFaqEditor(null)}>
                    + Bilgi ekle
                  </button>
                </SetupSectionCard>

                <SetupSectionCard
                  icon={<MessageSquareWarning size={18} />}
                  title={t("setup.doNotSay")}
                  helper={t("setup.doNotSayHint")}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {DO_NOT_SAY_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        style={doNotSayChips.includes(chip) ? setupChipActive : setupChip}
                        onClick={() => toggleDoNotSayChip(chip)}
                      >
                        {doNotSayChips.includes(chip) ? <Check size={14} style={{ marginRight: 4 }} /> : null}
                        {chip}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary }}>Ek not (isteğe bağlı)</span>
                    <textarea
                      value={doNotSayExtra}
                      onChange={(event) => setDoNotSayExtra(event.target.value)}
                      style={area}
                      placeholder="Asistanın asla söylememesi gereken başka bir kural…"
                    />
                  </label>
                  <p style={setupHelper}>Acil durumlarda asistan her zaman önce 112&apos;ye yönlendirir.</p>
                </SetupSectionCard>

                <SetupSectionCard
                  icon={<Plus size={18} />}
                  title="Ek bilgiler"
                  helper="Konaklama, transfer veya klinik politikası gibi serbest bilgiler."
                >
                  {extraNotes.length === 0 ? (
                    <p style={{ ...setupHelper, fontWeight: 600 }}>Henüz ek bilgi yok</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {extraNotes.map((item, index) => (
                        <div key={item.id} style={setupListItem}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: UI_COLORS.textPrimary }}>{item.title}</div>
                            <div style={{ fontSize: 13, color: UI_COLORS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.content}
                            </div>
                          </div>
                          <button type="button" aria-label="Düzenle" style={setupIconBtn} onClick={() => openKnowledgeEditor(index)}>
                            <Edit2 size={16} />
                          </button>
                          <button type="button" aria-label="Sil" style={setupIconBtn} onClick={() => deleteExtra(index)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" data-testid="setup-add-knowledge" style={setupAddBtn} onClick={() => openKnowledgeEditor(null)}>
                    + Bilgi ekle
                  </button>
                </SetupSectionCard>

                {isMobile ? (
                  <Button type="button" variant="secondary" fullWidth onClick={() => setPreviewOpen(true)}>
                    Önizle
                  </Button>
                ) : null}
              </>
            ) : null}

            {step === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, padding: 24 }}>
                <Input label={t("setup.appointmentEmail")} type="email" value={appointmentEmail} onChange={(event) => setAppointmentEmail(event.target.value)} />
                <Input label={t("setup.appointmentWhatsapp")} value={appointmentWhatsapp} onChange={(event) => setAppointmentWhatsapp(event.target.value)} />
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, padding: 24 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["code", "wordpress", "agency"] as const).map((item) => (
                    <button key={item} type="button" onClick={() => setTab(item)} style={langButton(tab === item)}>
                      {t(`setup.tab${item === "code" ? "Code" : item === "wordpress" ? "Wordpress" : "Agency"}`)}
                    </button>
                  ))}
                </div>
                {tab === "code" ? (
                  <>
                    <pre style={codeBox}>{embedCode}</pre>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => navigator.clipboard.writeText(embedCode).then(() => setCopied(true))}
                    >
                      {copied ? t("setup.copied") : t("setup.copy")}
                    </Button>
                  </>
                ) : null}
                {tab === "wordpress" ? <p style={{ color: UI_COLORS.textPrimary, lineHeight: 1.6, margin: 0 }}>{t("setup.wordpress")}</p> : null}
                {tab === "agency" ? (
                  <>
                    <Input label={t("setup.agencyEmail")} type="email" value={agencyEmail} onChange={(event) => setAgencyEmail(event.target.value)} />
                    <Button type="button" variant="secondary" onClick={() => void sendAgency()}>
                      {t("setup.agencySend")}
                    </Button>
                    {agencyNote ? <p style={{ margin: 0, color: UI_COLORS.textSecondary }}>{agencyNote}</p> : null}
                  </>
                ) : null}
                <p style={{ margin: 0, fontWeight: 700, color: UI_COLORS.brand }}>
                  {installedAt ? `${t("setup.live")}${installedDomain ? ` · ${installedDomain}` : ""}` : t("setup.waiting")}
                </p>
              </div>
            ) : null}

            {error ? (
              <p style={{ color: UI_COLORS.danger, fontSize: 13.5, margin: 0 }}>
                {error === "contactRequired" ? t("setup.contactRequired") : t("setup.loadFailed")}
              </p>
            ) : null}

            {!isMobile ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {step > 0 ? (
                  <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
                    {t("setup.back")}
                  </Button>
                ) : null}
                {step < 2 ? (
                  <Button type="button" onClick={() => void next()} disabled={saving}>
                    {saving ? t("setup.saving") : t("setup.next")}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void finish()} disabled={saving}>
                    {saving ? t("setup.saving") : t("setup.finish")}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {!isMobile ? (
          <aside style={previewAside}>
            <PreviewPanel question={setupSampleQuestion()} reply={previewReply} />
          </aside>
        ) : null}
      </div>

      {isMobile ? (
        <div style={setupStickyBar}>
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
              {t("setup.back")}
            </Button>
          ) : null}
          {step < 2 ? (
            <Button type="button" fullWidth={step === 0} onClick={() => void next()} disabled={saving} style={{ flex: 1 }}>
              {saving ? t("setup.saving") : t("setup.next")}
            </Button>
          ) : (
            <Button type="button" fullWidth onClick={() => void finish()} disabled={saving} style={{ flex: 1 }}>
              {saving ? t("setup.saving") : t("setup.finish")}
            </Button>
          )}
        </div>
      ) : null}

      {isMobile && previewOpen ? (
        <div style={sheetScrim} onClick={() => setPreviewOpen(false)}>
          <div style={previewSheet} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ color: UI_COLORS.textPrimary }}>Önizleme</strong>
              <button type="button" onClick={() => setPreviewOpen(false)} style={setupIconBtn}>
                Kapat
              </button>
            </div>
            <PreviewPanel question={setupSampleQuestion()} reply={previewReply} />
          </div>
        </div>
      ) : null}

      <KnowledgeEditor
        isOpen={editorKind != null}
        mode={editorMode}
        title={editorTitle}
        initialValues={editorInitial}
        saving={editorSaving}
        success={editorSuccess}
        onClose={() => setEditorKind(null)}
        onSave={handleEditorSave}
      />

      {toast ? <div style={toastStyle}>{toast}</div> : null}
    </main>
  );
}

function Stepper({ step, labels, mobile }: { step: number; labels: string[]; mobile: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {mobile ? (
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary }}>
          Adım {step + 1}/3 · {labels[step]?.replace(/^\d+\.\s*/, "")}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        {labels.map((label, index) => {
          const active = index === step;
          const done = index < step;
          return (
            <div
              key={label}
              style={{
                flex: 1,
                borderRadius: 999,
                padding: "8px 10px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: active || done ? "#fff" : UI_COLORS.textMuted,
                background: active || done ? UI_COLORS.brand : UI_COLORS.bgInput,
                border: `1px solid ${active || done ? UI_COLORS.brand : UI_COLORS.border}`,
                opacity: mobile && !active ? 0.55 : 1,
              }}
            >
              {mobile ? index + 1 : label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompletionBar({ percent }: { percent: number }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary }}>Profil %{percent} tamamlandı</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: UI_COLORS.bgInput, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: UI_COLORS.brand, transition: "width 0.25s ease" }} />
      </div>
    </div>
  );
}

function PreviewPanel({ question, reply }: { question: string; reply: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: UI_COLORS.textPrimary }}>Canlı önizleme</h3>
      <p style={setupHelper}>Asistan, girdiğiniz bilgilere göre örnek bir yanıta yakın durur.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ alignSelf: "flex-end", maxWidth: "85%", background: UI_COLORS.brand, color: "#fff", borderRadius: 14, padding: "10px 12px", fontSize: 13.5 }}>
          {question}
        </div>
        <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: UI_COLORS.bgInput, border: `1px solid ${UI_COLORS.border}`, borderRadius: 14, padding: "10px 12px", fontSize: 13.5, color: UI_COLORS.textPrimary, lineHeight: 1.5 }}>
          {reply}
        </div>
      </div>
    </div>
  );
}

function splitDoNotSay(raw: string): { chips: string[]; extra: string } {
  const chips: string[] = [];
  const leftovers: string[] = [];
  for (const part of raw.split(/\n|·/).map((item) => item.trim()).filter(Boolean)) {
    if (DO_NOT_SAY_CHIPS.includes(part)) chips.push(part);
    else leftovers.push(part);
  }
  return { chips: [...new Set(chips)], extra: leftovers.join("\n") };
}

function langButton(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? UI_COLORS.brand : UI_COLORS.border}`,
    background: "transparent",
    color: UI_COLORS.textPrimary,
    borderRadius: 8,
    padding: "6px 10px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

const shell: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  justifyContent: "center",
  background: "var(--bg-app)",
  padding: "24px 16px 32px",
};

function layoutStyle(mobile: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: 1100,
    display: "grid",
    gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(280px, 340px)",
    gap: 28,
    alignItems: "start",
  };
}

const previewAside: CSSProperties = {
  position: "sticky",
  top: 24,
  background: UI_COLORS.bgCard,
  border: `1px solid ${UI_COLORS.border}`,
  borderRadius: 20,
  padding: 20,
};

const area: CSSProperties = {
  minHeight: 84,
  padding: "10px 14px",
  borderRadius: 12,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgInput,
  color: UI_COLORS.textPrimary,
  font: "inherit",
};

const codeBox: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  background: UI_COLORS.bgInput,
  borderRadius: 12,
  padding: 14,
  color: UI_COLORS.textPrimary,
  fontSize: 13,
};

const sheetScrim: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 50,
  display: "flex",
  alignItems: "flex-end",
};

const previewSheet: CSSProperties = {
  width: "100%",
  background: UI_COLORS.bgCard,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  padding: 20,
  paddingBottom: "max(20px, env(safe-area-inset-bottom))",
};

const toastStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 96,
  transform: "translateX(-50%)",
  background: UI_COLORS.textPrimary,
  color: UI_COLORS.bgCard,
  padding: "10px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  zIndex: 11000,
};
