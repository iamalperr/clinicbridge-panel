"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import SectionCard from "@/components/ui/SectionCard";
import { Loader2, Save, Layout, Palette, MessageCircle, Sparkles, Plus, Trash2, GripVertical, User, Activity } from "lucide-react";
import type { WidgetSettings, ShowBubblesConfig, QuickAction, QuickActionType, WidgetLauncherConfig, WidgetMessages, WidgetLanguage } from "@/lib/types";
import WidgetPreview from "./WidgetPreview";
import WidgetIntegration from "./WidgetIntegration";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

const DEFAULT_BUBBLES: ShowBubblesConfig = {
  enabled: true,
  displayMode: "rotate",
  messages: {
    tr: [
      "Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?",
      "İmplant seçenekleri hakkında bilgi alabilirsiniz",
      "Randevu almak ister misiniz?",
      "Nereden başlayacağınızı bilmiyor musunuz?",
    ],
    en: [
      "Need help choosing a treatment?",
      "Ask me about implant options",
      "Want to book an appointment?",
      "Not sure where to start?",
    ],
  },
  timing: { initialDelaySeconds: 3, rotationIntervalSeconds: 6, autoHideSeconds: 12 },
  behavior: { hideAfterOpen: true, showOncePerSession: false, disableOnMobile: false },
};

const DEFAULT_LAUNCHER: WidgetLauncherConfig = {
  shape: "rounded_square",
  position: "bottom_right",
  size: "medium",
  icon: "sparkle",
  text: {
    tr: "Asistan ile konuş",
    en: "Chat with assistant"
  },
  showText: false,
  showOnlineIndicator: true,
  showNotificationDot: false,
  tooltipEnabled: true,
  tooltipMessage: "Merhaba, size nasıl yardımcı olabiliriz?",
  tooltipDelaySeconds: 2,
  tooltipAutoHide: true,
};

const DEFAULT_MESSAGES: WidgetMessages = {
  tr: {
    greetingMessage: "Merhaba! Size nasıl yardımcı olabiliriz?",
    inputPlaceholder: "Bir mesaj yazın...",
    tooltipMessage: "Merhaba, size nasıl yardımcı olabiliriz?",
    quickActions: [
      "Randevu almak istiyorum",
      "Hizmetleriniz nelerdir?",
      "Kliniğiniz nerede?",
    ],
  },
  en: {
    greetingMessage: "Hello! How can we help you?",
    inputPlaceholder: "Type your message...",
    tooltipMessage: "Hello, how can we help you?",
    quickActions: [
      "Book an appointment",
      "What services do you offer?",
      "Where is your clinic?",
    ],
  },
};

const DEFAULT_SETTINGS: WidgetSettings = {
  title: "Clinic Assistant",
  welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
  primaryColor: "#6366f1",
  position: "bottom-right",
  showAvatar: true,
  showOnlineStatus: true,
  placeholder: "Bir mesaj yazın...",
  showBubbles: DEFAULT_BUBBLES,
  launcher: DEFAULT_LAUNCHER,
  messages: DEFAULT_MESSAGES,
  defaultLanguage: "auto",
  testMode: false,
  testModeMessage: {
    tr: "Merhaba, şu anda dijital asistanımızın kurulum süreci devam ediyor. Çok yakında sorularınızı buradan yanıtlayabileceğiz. Randevu ve detaylı bilgi için lütfen kliniğimizle doğrudan iletişime geçiniz.",
    en: "Hello, our digital assistant is currently being prepared. Very soon, we’ll be able to answer your questions here. For appointments or detailed information, please contact the clinic directly."
  }
};

const ACTION_TYPE_OPTIONS: { value: QuickActionType; label: string }[] = [
  { value: "appointment_request",  label: "📅 Randevu Talebi" },
  { value: "treatment_info",       label: "🦷 Tedavi Bilgisi" },
  { value: "describe_complaint",   label: "💬 Şikayet/Belirti" },
  { value: "clinic_services",      label: "🏥 Klinik Hizmetleri" },
  { value: "pricing_info",         label: "💰 Fiyat Bilgisi" },
  { value: "contact_request",      label: "📞 İletişim / Destek" },
  { value: "custom_prompt",        label: "✏️ Özel Mesaj" },
];

const AVATAR_OPTIONS: { value: WidgetSettings["avatarType"]; label: string; icon: string }[] = [
  { value: "default", label: "Varsayılan", icon: "👤" },
  { value: "female_doctor", label: "Kadın Doktor", icon: "👩‍⚕️" },
  { value: "male_doctor", label: "Erkek Doktor", icon: "👨‍⚕️" },
  { value: "clinic_assistant", label: "Asistan", icon: "🧑‍💼" },
  { value: "minimal", label: "Minimal", icon: "✨" },
  { value: "custom", label: "Özel Yükle", icon: "🖼️" },
];

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa_1", emoji: "📅", labelTR: "Randevu talebi oluştur",        labelEN: "Create appointment request", actionType: "appointment_request", isActive: true, sortOrder: 0 },
  { id: "qa_2", emoji: "🦷", labelTR: "Tedaviler hakkında bilgi al",   labelEN: "Learn about treatments",      actionType: "treatment_info",       isActive: true, sortOrder: 1 },
  { id: "qa_3", emoji: "💬", labelTR: "Şikayetimi anlatmak istiyorum", labelEN: "Describe my concern",         actionType: "describe_complaint",   isActive: true, sortOrder: 2 },
];

/* ── Sortable Quick Action Row ── */
function SortableQuickActionItem({
  action, onUpdate, onDelete, actionTypeOptions,
}: {
  action: QuickAction;
  onUpdate: (updated: QuickAction) => void;
  onDelete: () => void;
  actionTypeOptions: { value: QuickActionType; label: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: action.id });

  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${isDragging ? UI_COLORS.brand : action.isActive ? "rgba(99,102,241,0.3)" : UI_COLORS.border}`,
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    opacity: isDragging ? 0.85 : action.isActive ? 1 : 0.55,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,.2)" : "none",
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
  };

  const inpStyle: React.CSSProperties = {
    flex: 1, padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)",
    color: UI_COLORS.textPrimary, fontSize: 13, outline: "none",
  };

  return (
    <div ref={setNodeRef} style={containerStyle}>
      {/* Row 1: drag + emoji + labels + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span {...attributes} {...listeners}
          style={{ cursor: "grab", color: UI_COLORS.textMuted, flexShrink: 0, touchAction: "none" }}>
          <GripVertical size={15} />
        </span>
        <input
          value={action.emoji}
          onChange={e => onUpdate({ ...action, emoji: e.target.value })}
          style={{ ...inpStyle, flex: "0 0 44px", textAlign: "center", fontSize: 18 }}
          placeholder="📅"
        />
        <input
          value={action.labelTR}
          onChange={e => onUpdate({ ...action, labelTR: e.target.value })}
          style={inpStyle}
          placeholder="Türkçe etiket"
        />
        <input
          value={action.labelEN}
          onChange={e => onUpdate({ ...action, labelEN: e.target.value })}
          style={inpStyle}
          placeholder="English label"
        />
        {/* Active toggle */}
        <button
          onClick={() => onUpdate({ ...action, isActive: !action.isActive })}
          title={action.isActive ? "Devre dışı bırak" : "Etkinleştir"}
          style={{
            width: 34, height: 20, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0,
            background: action.isActive ? UI_COLORS.brand : "rgba(255,255,255,0.1)",
            position: "relative", transition: "background .2s",
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: action.isActive ? 17 : 3,
            width: 14, height: 14, borderRadius: "50%", background: "white",
            transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }} />
        </button>
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, flexShrink: 0 }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {/* Row 2: action type + optional custom prompt */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 26 }}>
        <select
          value={action.actionType}
          onChange={e => onUpdate({ ...action, actionType: e.target.value as QuickActionType })}
          style={{
            flex: "0 0 220px", padding: "7px 10px", borderRadius: 8,
            border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)",
            color: UI_COLORS.textPrimary, fontSize: 13, outline: "none", cursor: "pointer",
          }}
        >
          {actionTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {action.actionType === "custom_prompt" && (
          <input
            value={action.customPrompt ?? ""}
            onChange={e => onUpdate({ ...action, customPrompt: e.target.value })}
            placeholder="Özel mesaj metni…"
            style={{ ...inpStyle }}
          />
        )}
      </div>
    </div>
  );
}


/* ── Toggle helper ── */
function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, borderRadius: 99, border: "none", cursor: "pointer",
          background: checked ? UI_COLORS.brand : "rgba(255,255,255,0.1)",
          position: "relative", flexShrink: 0, transition: "background .2s", marginTop: 2,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18,
          borderRadius: "50%", background: "white", transition: "left .2s",
          boxShadow: "0 1px 4px rgba(0,0,0,.25)",
        }} />
      </button>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>{label}</p>
        {description && <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginTop: 3, lineHeight: 1.5 }}>{description}</p>}
      </div>
    </div>
  );
}

/* ── Sortable bubble row ── */
function SortableBubbleItem({
  id, value, onChange, onDelete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: isDragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: "8px 12px",
    border: `1px solid ${isDragging ? UI_COLORS.brand : UI_COLORS.border}`,
    fontSize: 13.5,
    color: UI_COLORS.textPrimary,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,.25)" : "none",
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
    cursor: "default",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        title="Sürükle"
        style={{
          cursor: "grab",
          color: UI_COLORS.textMuted,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          touchAction: "none",
          padding: "2px 0",
        }}
      >
        <GripVertical size={15} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "none",
          border: "none",
          flex: 1,
          color: UI_COLORS.textPrimary,
          fontSize: 13.5,
          outline: "none",
          minWidth: 0,
        }}
      />
      <button
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: UI_COLORS.textMuted,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ── Sortable bubble list ── */
function SortableBubbleList({
  lang, items, onUpdate, onDelete, onReorder,
  newVal, onNewValChange, onAdd,
}: {
  lang: "tr" | "en";
  items: string[];
  onUpdate: (idx: number, val: string) => void;
  onDelete: (idx: number) => void;
  onReorder: (newItems: string[]) => void;
  newVal: string;
  onNewValChange: (v: string) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Stable IDs: index-based prefixed with lang
  const ids = items.map((_, i) => `${lang}-${i}`);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx));
    }
  }, [ids, items, onReorder]);

  const inputRowStyle: React.CSSProperties = { display: "flex", gap: 8, marginTop: 4 };
  const msgInputStyle: React.CSSProperties = {
    flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((msg, i) => (
            <SortableBubbleItem
              key={ids[i]}
              id={ids[i]}
              value={msg}
              onChange={(v) => onUpdate(i, v)}
              onDelete={() => onDelete(i)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div style={inputRowStyle}>
        <input
          value={newVal}
          onChange={(e) => onNewValChange(e.target.value)}
          placeholder={lang === "tr" ? "Yeni Türkçe balon ekle…" : "Add new English bubble…"}
          style={msgInputStyle}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
        />
        <button
          onClick={onAdd}
          style={{ background: UI_COLORS.brand, border: "none", borderRadius: 10, padding: "0 14px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 4 }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── Number field ── */
function NumInput({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
        style={{
          padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
          background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14,
          outline: "none", width: "100%",
        }}
      />
    </div>
  );
}

export default function WidgetPage({ params }: PageProps) {
  const { clinicId } = use(params);

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [msgLang, setMsgLang] = useState<"tr" | "en">("tr");
  const [launcherLang, setLauncherLang] = useState<"tr" | "en">("tr");

  /* ── New bubble inputs ── */
  const [newBubbleTr, setNewBubbleTr] = useState("");
  const [newBubbleEn, setNewBubbleEn] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "widgetSettings", clinicId));
        if (snap.exists()) {
          const data = snap.data() as WidgetSettings;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data,
            showBubbles: { ...DEFAULT_BUBBLES, ...data.showBubbles,
              messages: { ...DEFAULT_BUBBLES.messages, ...data.showBubbles?.messages },
              timing: { ...DEFAULT_BUBBLES.timing, ...data.showBubbles?.timing },
              behavior: { ...DEFAULT_BUBBLES.behavior, ...data.showBubbles?.behavior },
            },
            // Merge i18n messages with defaults
            messages: {
              tr: { ...DEFAULT_MESSAGES.tr, ...data.messages?.tr },
              en: { ...DEFAULT_MESSAGES.en, ...data.messages?.en },
            },
            defaultLanguage: data.defaultLanguage ?? "auto",
          });
          if (data.quickActions && data.quickActions.length > 0) {
            setQuickActions(data.quickActions);
          }
        }
      } catch (err) { console.error("Widget settings fetch error:", err); }
      finally { setLoading(false); }
    })();
  }, [clinicId]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    setErrMsg("");
    try {
      await setDoc(doc(db, "widgetSettings", clinicId), { ...settings, quickActions, updatedAt: serverTimestamp() });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Kaydedilemedi.");
      setSaveStatus("error");
    } finally { setIsSaving(false); }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrMsg("Dosya boyutu 2MB'den büyük olamaz.");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setSettings({ ...settings, avatarType: "custom", customAvatarUrl: ev.target.result as string });
      }
    };
    reader.readAsDataURL(file);
  };

  /* ── Quick actions state ── */
  const [quickActions, setQuickActions] = useState<QuickAction[]>(DEFAULT_QUICK_ACTIONS);

  const qaIds = quickActions.map(a => a.id);
  const qaSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleQaDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = qaIds.indexOf(active.id as string);
    const newIdx = qaIds.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      setQuickActions(qs => arrayMove(qs, oldIdx, newIdx).map((q, i) => ({ ...q, sortOrder: i })));
    }
  }, [qaIds]);

  const addQuickAction = () => {
    const newAction: QuickAction = {
      id: `qa_${Date.now()}`,
      emoji: "💬",
      labelTR: "",
      labelEN: "",
      actionType: "custom_prompt",
      isActive: true,
      sortOrder: quickActions.length,
    };
    setQuickActions(qs => [...qs, newAction]);
  };

  const updateQuickAction = (id: string, updated: QuickAction) =>
    setQuickActions(qs => qs.map(q => q.id === id ? updated : q));

  const deleteQuickAction = (id: string) =>
    setQuickActions(qs => qs.filter(q => q.id !== id).map((q, i) => ({ ...q, sortOrder: i })));
  const bubbles = settings.showBubbles ?? DEFAULT_BUBBLES;

  const setBubbles = (partial: Partial<ShowBubblesConfig>) =>
    setSettings(s => ({ ...s, showBubbles: { ...(s.showBubbles ?? DEFAULT_BUBBLES), ...partial } }));

  const setTiming = (key: keyof ShowBubblesConfig["timing"], val: number) =>
    setBubbles({ timing: { ...bubbles.timing, [key]: val } });

  const setBehavior = (key: keyof ShowBubblesConfig["behavior"], val: boolean) =>
    setBubbles({ behavior: { ...bubbles.behavior, [key]: val } });

  const updateMsg = (lang: "tr" | "en", idx: number, val: string) => {
    const msgs = [...(bubbles.messages[lang] ?? [])];
    msgs[idx] = val;
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
  };

  const deleteMsg = (lang: "tr" | "en", idx: number) => {
    const msgs = (bubbles.messages[lang] ?? []).filter((_, i) => i !== idx);
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
  };

  const reorderMsg = (lang: "tr" | "en", newItems: string[]) =>
    setBubbles({ messages: { ...bubbles.messages, [lang]: newItems } });

  const addMsg = (lang: "tr" | "en") => {
    const val = lang === "tr" ? newBubbleTr.trim() : newBubbleEn.trim();
    if (!val) return;
    const msgs = [...(bubbles.messages[lang] ?? []), val];
    setBubbles({ messages: { ...bubbles.messages, [lang]: msgs } });
    lang === "tr" ? setNewBubbleTr("") : setNewBubbleEn("");
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14 }}>Yükleniyor…</p>
      </div>
    );
  }

  const inputRowStyle: React.CSSProperties = { display: "flex", gap: 8 };
  const msgInputStyle: React.CSSProperties = {
    flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`,
    background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none",
  };
  const msgTagStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px",
    border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary,
  };

  return (
    <div style={{ padding: "8px 0" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
            Web Widget Yapılandırması
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
            Chatbot'un web sitenizde nasıl görüneceğini ve davranacağını özelleştirin.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saveStatus === "success" && (
            <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>✓ Kaydedildi!</span>
          )}
          {saveStatus === "error" && (
            <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>✗ {errMsg}</span>
          )}
          <Button
            onClick={handleSave}
            isLoading={isSaving}
            style={{
              minWidth: 160,
              background: saveStatus === "success" ? "#10b98120" : undefined,
              color: saveStatus === "success" ? "#10b981" : undefined,
            }}
          >
            <Save size={16} style={{ marginRight: 6 }} />
            Ayarları Kaydet
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 32, alignItems: "start" }}>
        {/* ── Left: Settings ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Görünüm */}
          <SectionCard title="Genel Görünüm" icon={<Palette size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Input
                label="Widget Başlığı"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="örn: Nova Dental Clinic"
              />
              <Input
                label="Asistan Adı (İsteğe Bağlı)"
                value={settings.assistantName ?? ""}
                onChange={(e) => setSettings({ ...settings, assistantName: e.target.value })}
                placeholder="örn: Clinic Assistant"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ana Renk
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{ width: 42, height: 42, border: "none", borderRadius: 8, padding: 0, background: "none", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary, outline: "none" }}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Avatar Ayarları */}
          <SectionCard title="Avatar Ayarları" icon={<User size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                {AVATAR_OPTIONS.map((opt) => {
                  const isSelected = (settings.avatarType || "default") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSettings({ ...settings, avatarType: opt.value })}
                      style={{
                        background: isSelected ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isSelected ? UI_COLORS.brand : UI_COLORS.border}`,
                        borderRadius: 12,
                        padding: "16px 12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        color: UI_COLORS.textPrimary,
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{opt.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {settings.avatarType === "custom" && (
                <div style={{ padding: "16px", borderRadius: 12, border: `1px dashed ${UI_COLORS.border}`, background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 16 }}>
                  {settings.customAvatarUrl ? (
                    <img src={settings.customAvatarUrl} alt="Custom Avatar" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: UI_COLORS.textMuted }}>
                      <User size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Kendi klinik ikonunuzu veya asistan resminizi yükleyin. (Maks. 2MB, JPG/PNG)</p>
                    <label style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${UI_COLORS.border}` }}>
                      Görsel Seç
                      <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleAvatarUpload} style={{ display: "none" }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Widget Butonu */}
          {(() => {
            const launcher: WidgetLauncherConfig = settings.launcher || DEFAULT_LAUNCHER;
            const setLauncher = (patch: Partial<WidgetLauncherConfig>) =>
              setSettings({ ...settings, launcher: { ...launcher, ...patch } });

            const SHAPE_OPTIONS: { value: WidgetLauncherConfig["shape"]; label: string; preview: React.ReactNode }[] = [
              { value: "rounded_square", label: "Yuvarlak Kare", preview: <div style={{ width: 32, height: 32, borderRadius: 10, background: settings.primaryColor || "#6366f1" }} /> },
              { value: "circle", label: "Daire", preview: <div style={{ width: 32, height: 32, borderRadius: "50%", background: settings.primaryColor || "#6366f1" }} /> },
              { value: "square", label: "Kare", preview: <div style={{ width: 32, height: 32, borderRadius: 4, background: settings.primaryColor || "#6366f1" }} /> },
              { value: "pill", label: "Pill", preview: <div style={{ width: 52, height: 28, borderRadius: 999, background: settings.primaryColor || "#6366f1" }} /> },
              { value: "minimal", label: "Minimal", preview: <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${settings.primaryColor || "#6366f1"}`, background: "transparent" }} /> },
              { value: "chat_bubble", label: "Balon", preview: <div style={{ width: 36, height: 30, borderRadius: "12px 12px 2px 12px", background: settings.primaryColor || "#6366f1" }} /> },
            ];

            const ICON_OPTIONS: { value: WidgetLauncherConfig["icon"]; label: string; icon: string }[] = [
              { value: "sparkle", label: "Sparkle", icon: "\u2728" },
              { value: "chat", label: "Mesaj", icon: "\ud83d\udcac" },
              { value: "tooth", label: "Diş", icon: "\ud83e\uddb7" },
              { value: "medical_plus", label: "Sağlık", icon: "\u2764\ufe0f" },
              { value: "assistant", label: "Asistan", icon: "\ud83e\udd16" },
            ];

            const POS_OPTIONS: { value: WidgetLauncherConfig["position"]; label: string }[] = [
              { value: "bottom_right", label: "Sağ Alt" },
              { value: "bottom_left", label: "Sol Alt" },
              { value: "middle_right", label: "Sağ Orta" },
              { value: "middle_left", label: "Sol Orta" },
            ];

            const SIZE_OPTIONS: { value: WidgetLauncherConfig["size"]; label: string }[] = [
              { value: "small", label: "Küçük" },
              { value: "medium", label: "Orta" },
              { value: "large", label: "Büyük" },
            ];

            const rCard = (selected: boolean): React.CSSProperties => ({
              background: selected ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${selected ? UI_COLORS.brand : UI_COLORS.border}`,
              borderRadius: 12,
              padding: "12px 10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              transition: "all 0.2s",
              color: UI_COLORS.textPrimary,
            });

            const subLabel: React.CSSProperties = {
              fontSize: 13,
              fontWeight: 700,
              color: UI_COLORS.textSecondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            };

            return (
              <SectionCard title="Widget Butonu" icon={<MessageCircle size={18} />}>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                  {/* Buton Şekli */}
                  <div>
                    <p style={subLabel}>Buton Şekli</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {SHAPE_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => setLauncher({ shape: opt.value })} style={rCard(launcher.shape === opt.value)}>
                          {opt.preview}
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Buton İkonu */}
                  <div>
                    <p style={subLabel}>Buton İkonu</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {ICON_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => setLauncher({ icon: opt.value })} style={rCard(launcher.icon === opt.value)}>
                          <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Buton Metni & Toggle'lar */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4, border: `1px solid ${UI_COLORS.border}`, alignSelf: "flex-start" }}>
                        {(["tr", "en"] as const).map(lang => (
                          <button
                            key={lang}
                            onClick={() => setLauncherLang(lang)}
                            style={{
                              padding: "4px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700,
                              cursor: "pointer", transition: "all 0.15s",
                              background: launcherLang === lang ? UI_COLORS.brand : "transparent",
                              color: launcherLang === lang ? "white" : UI_COLORS.textMuted,
                            }}
                          >
                            {lang === "tr" ? "🇹🇷 Türkçe" : "🇬🇧 English"}
                          </button>
                        ))}
                      </div>
                      <Input
                        label={launcherLang === "tr" ? "Buton Metni" : "Button Text"}
                        value={typeof launcher.text === "string" ? (launcherLang === "tr" ? launcher.text : "") : (launcher.text?.[launcherLang] ?? "")}
                        onChange={(e) => {
                          const currentTextObj = typeof launcher.text === "string" ? { tr: launcher.text, en: "Chat with assistant" } : (launcher.text || { tr: "Asistan ile konuş", en: "Chat with assistant" });
                          setLauncher({ text: { ...currentTextObj, [launcherLang]: e.target.value } });
                        }}
                        placeholder={launcherLang === "tr" ? "Asistan ile konuş" : "Chat with assistant"}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 40 }}>
                      <Toggle checked={launcher.showText} onChange={(v) => setLauncher({ showText: v })} label="Metni Göster" />
                      <Toggle checked={launcher.showOnlineIndicator} onChange={(v) => setLauncher({ showOnlineIndicator: v })} label="Online Göstergesi" />
                      <Toggle checked={launcher.showNotificationDot} onChange={(v) => setLauncher({ showNotificationDot: v })} label="Bildirim Noktası" />
                    </div>
                  </div>

                  {/* Konum & Boyut */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <p style={subLabel}>Konum</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {POS_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => setLauncher({ position: opt.value })} style={{ ...rCard(launcher.position === opt.value), padding: "10px 8px" }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p style={subLabel}>Boyut</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        {SIZE_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => setLauncher({ size: opt.value })} style={{ ...rCard(launcher.size === opt.value), padding: "10px 8px", flex: "1 1 0" }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tooltip */}
                  <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 16 }}>
                    <Toggle
                      checked={launcher.tooltipEnabled}
                      onChange={(v) => setLauncher({ tooltipEnabled: v })}
                      label="Açılış Mesaj Balonu"
                      description="Widget butonunun üzerinde kısa bir karşılama mesajı gösterir."
                    />
                    {launcher.tooltipEnabled && (
                      <>
                        <Input
                          label="Tooltip Mesajı"
                          value={launcher.tooltipMessage}
                          onChange={(e) => setLauncher({ tooltipMessage: e.target.value })}
                          placeholder="Merhaba, size nasıl yardımcı olabiliriz?"
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gecikme (sn)</label>
                            <input
                              type="number" min={0} max={30}
                              value={launcher.tooltipDelaySeconds}
                              onChange={(e) => setLauncher({ tooltipDelaySeconds: Number(e.target.value) })}
                              style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${UI_COLORS.border}`, fontSize: 13.5, color: UI_COLORS.textPrimary, outline: "none", width: "100%" }}
                            />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 24 }}>
                            <Toggle checked={launcher.tooltipAutoHide} onChange={(v) => setLauncher({ tooltipAutoHide: v })} label="Otomatik Kapan" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                </div>
              </SectionCard>
            );
          })()}

          {/* Mesajlar ve İçerik — TR / EN tabs */}
          <SectionCard title="Mesajlar ve İçerik" icon={<MessageCircle size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Language tabs */}
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4, border: `1px solid ${UI_COLORS.border}`, alignSelf: "flex-start" }}>
                {(["tr", "en"] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setMsgLang(lang)}
                    style={{
                      padding: "6px 18px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.15s",
                      background: msgLang === lang ? UI_COLORS.brand : "transparent",
                      color: msgLang === lang ? "white" : UI_COLORS.textMuted,
                    }}
                  >
                    {lang === "tr" ? "🇹🇷 Türkçe" : "🇬🇧 English"}
                  </button>
                ))}
              </div>

              {/* Greeting Message */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {msgLang === "tr" ? "Karşılama Mesajı" : "Greeting Message"}
                </label>
                <input
                  value={settings.messages?.[msgLang]?.greetingMessage ?? ""}
                  onChange={e => setSettings(s => ({
                    ...s,
                    messages: {
                      ...DEFAULT_MESSAGES,
                      ...s.messages,
                      [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], greetingMessage: e.target.value }
                    }
                  }))}
                  placeholder={DEFAULT_MESSAGES[msgLang].greetingMessage}
                  style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, outline: "none" }}
                />
              </div>

              {/* Input Placeholder */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {msgLang === "tr" ? "Giriş Alanı Metni" : "Input Placeholder"}
                </label>
                <input
                  value={settings.messages?.[msgLang]?.inputPlaceholder ?? ""}
                  onChange={e => setSettings(s => ({
                    ...s,
                    messages: {
                      ...DEFAULT_MESSAGES,
                      ...s.messages,
                      [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], inputPlaceholder: e.target.value }
                    }
                  }))}
                  placeholder={DEFAULT_MESSAGES[msgLang].inputPlaceholder}
                  style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, outline: "none" }}
                />
              </div>

              {/* Tooltip Message */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {msgLang === "tr" ? "Tooltip / Açılış Mesaj Balonu" : "Tooltip Message"}
                </label>
                <input
                  value={settings.messages?.[msgLang]?.tooltipMessage ?? ""}
                  onChange={e => setSettings(s => ({
                    ...s,
                    messages: {
                      ...DEFAULT_MESSAGES,
                      ...s.messages,
                      [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], tooltipMessage: e.target.value }
                    }
                  }))}
                  placeholder={DEFAULT_MESSAGES[msgLang].tooltipMessage}
                  style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, outline: "none" }}
                />
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
                  {msgLang === "tr"
                    ? "Widget butonu üzerinde görünen karşılama balonu metni."
                    : "Text shown in the tooltip bubble above the widget button."}
                </p>
              </div>

              {/* Quick Actions per language */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {msgLang === "tr" ? "Hızlı Komutlar" : "Quick Actions"}
                </label>
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: -4, lineHeight: 1.5 }}>
                  {msgLang === "tr"
                    ? "Widget açıldığında ziyaretçiye sunulan hazır butonlar (Türkçe)."
                    : "Preset buttons shown to visitors when the widget opens (English)."}
                </p>
                {(settings.messages?.[msgLang]?.quickActions ?? DEFAULT_MESSAGES[msgLang].quickActions).map((qa, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={qa}
                      onChange={e => {
                        const current = [...(settings.messages?.[msgLang]?.quickActions ?? DEFAULT_MESSAGES[msgLang].quickActions)];
                        current[idx] = e.target.value;
                        setSettings(s => ({
                          ...s,
                          messages: {
                            ...DEFAULT_MESSAGES,
                            ...s.messages,
                            [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], quickActions: current }
                          }
                        }));
                      }}
                      style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 13.5, outline: "none" }}
                    />
                    <button
                      onClick={() => {
                        const current = (settings.messages?.[msgLang]?.quickActions ?? DEFAULT_MESSAGES[msgLang].quickActions).filter((_, i) => i !== idx);
                        setSettings(s => ({
                          ...s,
                          messages: {
                            ...DEFAULT_MESSAGES,
                            ...s.messages,
                            [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], quickActions: current }
                          }
                        }));
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, flexShrink: 0 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const current = [...(settings.messages?.[msgLang]?.quickActions ?? DEFAULT_MESSAGES[msgLang].quickActions), ""];
                    setSettings(s => ({
                      ...s,
                      messages: {
                        ...DEFAULT_MESSAGES,
                        ...s.messages,
                        [msgLang]: { ...DEFAULT_MESSAGES[msgLang], ...s.messages?.[msgLang], quickActions: current }
                      }
                    }));
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "none", border: `1.5px dashed ${UI_COLORS.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textMuted, cursor: "pointer" }}
                >
                  <Plus size={14} /> {msgLang === "tr" ? "Yeni Komut Ekle" : "Add Quick Action"}
                </button>
              </div>

            </div>
          </SectionCard>

          {/* Düzen */}
          <SectionCard title="Düzen ve Davranış" icon={<Layout size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Select
                label="Konum"
                value={settings.position}
                onChange={(e) => setSettings({ ...settings, position: e.target.value as any })}
                options={[
                  { label: "Sağ Alt", value: "bottom-right" },
                  { label: "Sol Alt", value: "bottom-left" },
                ]}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
                <Toggle
                  checked={settings.showAvatar}
                  onChange={(v) => setSettings({ ...settings, showAvatar: v })}
                  label="Avatar Göster"
                />
                <Toggle
                  checked={settings.showOnlineStatus}
                  onChange={(v) => setSettings({ ...settings, showOnlineStatus: v })}
                  label="Çevrimiçi Durumu Göster"
                />
              </div>
            </div>
          </SectionCard>

          {/* ═══════════════════════════════════════
              SHOW BUBBLES SECTION
          ═══════════════════════════════════════ */}
          <SectionCard title="Öneri Balonları (Show Bubbles)" icon={<Sparkles size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

              {/* Enable toggle */}
              <Toggle
                checked={bubbles.enabled}
                onChange={(v) => setBubbles({ enabled: v })}
                label="Öneri Balonlarını Etkinleştir"
                description="Widget açılmadan önce küçük öneri balonları gösterir ve ziyaretçiyi etkileşime yönlendirir."
              />

              {/* Display mode */}
              <Select
                label="Gösterim Modu"
                value={bubbles.displayMode}
                onChange={(e) => setBubbles({ displayMode: e.target.value as ShowBubblesConfig["displayMode"] })}
                options={[
                  { label: "Sırayla Göster (Rotate)", value: "rotate" },
                  { label: "Tümünü Göster", value: "show-all" },
                  { label: "Devre Dışı", value: "disabled" },
                ]}
              />

              {/* Messages — Turkish */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Türkçe Balonlar
                </p>
                <SortableBubbleList
                  lang="tr"
                  items={bubbles.messages.tr}
                  onUpdate={(idx, val) => updateMsg("tr", idx, val)}
                  onDelete={(idx) => deleteMsg("tr", idx)}
                  onReorder={(items) => reorderMsg("tr", items)}
                  newVal={newBubbleTr}
                  onNewValChange={setNewBubbleTr}
                  onAdd={() => addMsg("tr")}
                />
              </div>

              {/* Messages — English */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  İngilizce Balonlar
                </p>
                <SortableBubbleList
                  lang="en"
                  items={bubbles.messages.en}
                  onUpdate={(idx, val) => updateMsg("en", idx, val)}
                  onDelete={(idx) => deleteMsg("en", idx)}
                  onReorder={(items) => reorderMsg("en", items)}
                  newVal={newBubbleEn}
                  onNewValChange={setNewBubbleEn}
                  onAdd={() => addMsg("en")}
                />
              </div>

              {/* Timing */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Zamanlama Ayarları (saniye)
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <NumInput label="İlk Gecikme" value={bubbles.timing.initialDelaySeconds} onChange={(v) => setTiming("initialDelaySeconds", v)} />
                  <NumInput label="Döngü Süresi" value={bubbles.timing.rotationIntervalSeconds} onChange={(v) => setTiming("rotationIntervalSeconds", v)} min={1} />
                  <NumInput label="Otomatik Gizle" value={bubbles.timing.autoHideSeconds} onChange={(v) => setTiming("autoHideSeconds", v)} />
                </div>
              </div>

              {/* Behavior */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
                  Davranış Ayarları
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Toggle
                    checked={bubbles.behavior.hideAfterOpen}
                    onChange={(v) => setBehavior("hideAfterOpen", v)}
                    label="Widget Açılınca Gizle"
                    description="Kullanıcı asistanı açtığında balonlar kaybolur."
                  />
                  <Toggle
                    checked={bubbles.behavior.showOncePerSession}
                    onChange={(v) => setBehavior("showOncePerSession", v)}
                    label="Oturum Başına Bir Kez Göster"
                    description="Balonlar her oturumda yalnızca bir kez gösterilir."
                  />
                  <Toggle
                    checked={bubbles.behavior.disableOnMobile}
                    onChange={(v) => setBehavior("disableOnMobile", v)}
                    label="Mobilde Devre Dışı Bırak"
                    description="Mobil cihazlarda balonlar gösterilmez."
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── Quick Actions Section ── */}
          <SectionCard
            title="Başlangıç Hızlı Komutları"
            subtitle="Ziyaretçilere widgetin açılışında sunulan hazır aksiyonlar."
            icon={<Sparkles size={18} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, lineHeight: 1.6, marginBottom: 4 }}>
                Her klinik için başlangıç hızlı aksiyon butonlarını özelleştirin. WhatsApp, canlı destek talebi veya acil semptom durumlarında görünür — başlangıç listesine eklemeyin.
              </p>

              <DndContext sensors={qaSensors} collisionDetection={closestCenter} onDragEnd={handleQaDragEnd}>
                <SortableContext items={qaIds} strategy={verticalListSortingStrategy}>
                  {quickActions.map(action => (
                    <SortableQuickActionItem
                      key={action.id}
                      action={action}
                      onUpdate={(updated) => updateQuickAction(action.id, updated)}
                      onDelete={() => deleteQuickAction(action.id)}
                      actionTypeOptions={ACTION_TYPE_OPTIONS}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={addQuickAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 16px", borderRadius: 10, border: `1.5px dashed ${UI_COLORS.border}`,
                  background: "none", color: UI_COLORS.textMuted, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "border-color .2s, color .2s", alignSelf: "flex-start",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = UI_COLORS.brand; (e.currentTarget as HTMLButtonElement).style.borderColor = UI_COLORS.brand; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = UI_COLORS.textMuted; (e.currentTarget as HTMLButtonElement).style.borderColor = UI_COLORS.border; }}
              >
                <Plus size={16} /> Yeni Hızlı Komut Ekle
              </button>

              {/* Column headers */}
              <div style={{ display: "flex", gap: 8, paddingLeft: 26, fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span style={{ flex: "0 0 44px", textAlign: "center" }}>Emoji</span>
                <span style={{ flex: 1 }}>Türkçe</span>
                <span style={{ flex: 1 }}>İngilizce</span>
                <span style={{ flex: "0 0 60px" }}>Aktif</span>
              </div>
            </div>
          </SectionCard>

          {/* ── Test Mode Section ── */}
          <SectionCard
            title="Test Modu"
            subtitle="Test modu aktifken widget web sitesinde normal şekilde görünür. Ancak kullanıcı mesajlarına klinik özelinde AI yanıtı üretmez. Bu mod, klinik özelindeki içerikler tamamlanmadan önce performans ve entegrasyon testleri için kullanılır."
            icon={<Activity size={18} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Toggle
                checked={settings.testMode ?? false}
                onChange={(v) => setSettings(s => ({ ...s, testMode: v }))}
                label="Test Modu Aktif"
                description="Kullanıcı mesaj yazdığında AI yanıtı üretmek yerine aşağıdaki mesajı gösterir."
              />

              {(settings.testMode ?? false) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: `1px solid ${UI_COLORS.border}` }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Türkçe Test Mesajı
                    </label>
                    <textarea
                      value={settings.testModeMessage?.tr ?? ""}
                      onChange={e => setSettings(s => ({
                        ...s,
                        testModeMessage: { ...s.testModeMessage, en: s.testModeMessage?.en ?? "", tr: e.target.value }
                      }))}
                      placeholder="Türkçe test mesajı..."
                      style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      İngilizce Test Mesajı (English)
                    </label>
                    <textarea
                      value={settings.testModeMessage?.en ?? ""}
                      onChange={e => setSettings(s => ({
                        ...s,
                        testModeMessage: { ...s.testModeMessage, tr: s.testModeMessage?.tr ?? "", en: e.target.value }
                      }))}
                      placeholder="English test message..."
                      style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.03)", color: UI_COLORS.textPrimary, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <WidgetIntegration
            clinicId={clinicId}
            defaultLanguage={settings.defaultLanguage ?? "auto"}
            onLanguageChange={(lang: WidgetLanguage) => setSettings(s => ({ ...s, defaultLanguage: lang }))}
          />
        </div>

        {/* ── Right: Preview ── */}
        <div style={{ position: "sticky", top: 32 }}>
          <WidgetPreview settings={settings} />
        </div>
      </div>

      <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
