"use client";

/**
 * Shared “Bilgi ekle / düzenle” editor used by Eğitim (desktop Modal) and the
 * setup wizard (desktop Modal + mobile full-screen sheet). Same fields and
 * validation; callers own persistence (Firestore / setup API).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { UI_COLORS } from "@/components/ui/ui-shared";

export type KnowledgeEditorMode = "knowledge" | "treatment" | "faq";

export type KnowledgeEditorValues = {
  title: string;
  content: string;
  entity_type: string;
  priceRange: string;
};

export const EMPTY_KNOWLEDGE_VALUES: KnowledgeEditorValues = {
  title: "",
  content: "",
  entity_type: "general",
  priceRange: "",
};

export const ENTITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "general", label: "Genel Bilgi" },
  { value: "doctor_profile", label: "Doktor Profili" },
  { value: "treatment_profile", label: "Tedavi Profili" },
  { value: "clinic_general_information", label: "Klinik Genel Bilgi" },
  { value: "pricing_information", label: "Fiyatlandırma Bilgisi" },
  { value: "appointment_information", label: "Randevu Bilgisi" },
  { value: "policy_information", label: "Politika / Kural" },
];

export function isKnowledgeFormValid(mode: KnowledgeEditorMode, values: KnowledgeEditorValues): boolean {
  if (mode === "treatment") return values.title.trim().length > 0;
  if (mode === "faq") return values.title.trim().length > 0 && values.content.trim().length > 0;
  return values.title.trim().length > 0 && values.content.trim().length > 0;
}

export function knowledgeValuesEqual(a: KnowledgeEditorValues, b: KnowledgeEditorValues): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.entity_type === b.entity_type &&
    a.priceRange === b.priceRange
  );
}

type KnowledgeEditorProps = {
  isOpen: boolean;
  mode: KnowledgeEditorMode;
  title: string;
  initialValues: KnowledgeEditorValues;
  saving?: boolean;
  success?: boolean;
  successTitle?: string;
  successSubtitle?: string;
  error?: string;
  /** Force sheet/modal; default auto = sheet under 768px. */
  presentation?: "auto" | "modal" | "sheet";
  onClose: () => void;
  onSave: (values: KnowledgeEditorValues) => void | Promise<void>;
};

export default function KnowledgeEditor({
  isOpen,
  mode,
  title,
  initialValues,
  saving = false,
  success = false,
  successTitle = "Kaydedildi",
  successSubtitle = "Asistan bu bilgiyi kullanmaya başlayacak.",
  error,
  presentation = "auto",
  onClose,
  onSave,
}: KnowledgeEditorProps) {
  const [values, setValues] = useState(initialValues);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (isOpen) setValues(initialValues);
  }, [isOpen, initialValues]);

  const dirty = useMemo(() => !knowledgeValuesEqual(values, initialValues), [values, initialValues]);
  const useSheet = presentation === "sheet" || (presentation === "auto" && isMobile);

  function requestClose() {
    if (saving) return;
    if (dirty && !success) {
      const ok = window.confirm("Değişiklikler kaydedilmedi, çıkılsın mı?");
      if (!ok) return;
    }
    onClose();
  }

  async function handleSave() {
    if (!isKnowledgeFormValid(mode, values) || saving) return;
    await onSave(values);
  }

  const body = success ? (
    <SuccessFeedback title={successTitle} subtitle={successSubtitle} />
  ) : (
    <KnowledgeFormFields
      mode={mode}
      values={values}
      onChange={setValues}
      error={error}
      footer={
        useSheet ? null : (
          <ModalActions
            onCancel={requestClose}
            onConfirm={() => void handleSave()}
            confirmLabel="Kaydet"
            loading={saving}
            disabled={!isKnowledgeFormValid(mode, values)}
          />
        )
      }
    />
  );

  if (!isOpen || !mounted) return null;

  if (useSheet) {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={sheetOverlay}
        onClick={requestClose}
      >
        <div style={sheetPanel} onClick={(event) => event.stopPropagation()}>
          <header style={sheetHeader}>
            <button type="button" onClick={requestClose} style={sheetHeaderBtn} disabled={saving}>
              Geri
            </button>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: UI_COLORS.textPrimary }}>{success ? "" : title}</h2>
            <button
              type="button"
              onClick={() => void handleSave()}
              style={{ ...sheetHeaderBtn, color: UI_COLORS.brand, fontWeight: 800, opacity: isKnowledgeFormValid(mode, values) && !saving ? 1 : 0.45 }}
              disabled={!isKnowledgeFormValid(mode, values) || saving || success}
            >
              {saving ? "…" : "Kaydet"}
            </button>
          </header>
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{body}</div>
          {!success ? (
            <div style={sheetFooter}>
              <Button fullWidth onClick={() => void handleSave()} disabled={!isKnowledgeFormValid(mode, values) || saving}>
                {saving ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" /> Kaydediliyor…
                  </span>
                ) : (
                  "Kaydet"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={success ? "" : title} width={600}>
      {body}
    </Modal>
  );
}

export function KnowledgeFormFields({
  mode,
  values,
  onChange,
  error,
  footer,
}: {
  mode: KnowledgeEditorMode;
  values: KnowledgeEditorValues;
  onChange: (next: KnowledgeEditorValues) => void;
  error?: string;
  footer?: ReactNode;
}) {
  const titleLabel = mode === "faq" ? "Soru" : mode === "treatment" ? "Tedavi adı" : "Başlık";
  const contentLabel = mode === "faq" ? "Cevap" : mode === "treatment" ? "Not (isteğe bağlı)" : "İçerik";
  const titlePlaceholder =
    mode === "faq"
      ? "Örn: İmplant tedavisi ne kadar sürer?"
      : mode === "treatment"
        ? "Örn: İmplant"
        : "Örn: Transfer hizmeti";
  const contentPlaceholder =
    mode === "faq"
      ? "Kısa ve net cevap yazın"
      : mode === "treatment"
        ? "Örn: İlk muayene sonrası netleşir"
        : "Asistanın kullanmasını istediğiniz bilgiyi yazın";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Input
        label={titleLabel}
        placeholder={titlePlaceholder}
        value={values.title}
        onChange={(event) => onChange({ ...values, title: event.target.value })}
      />
      {mode === "knowledge" ? (
        <EntityTypeSelect
          value={values.entity_type}
          onChange={(entity_type) => onChange({ ...values, entity_type })}
        />
      ) : null}
      {mode === "treatment" ? (
        <Input
          label="Fiyat aralığı (isteğe bağlı)"
          placeholder="Örn: 15.000–25.000 TL"
          value={values.priceRange}
          onChange={(event) => onChange({ ...values, priceRange: event.target.value })}
        />
      ) : null}
      <TextareaField
        label={contentLabel}
        placeholder={contentPlaceholder}
        value={values.content}
        onChange={(content) => onChange({ ...values, content })}
        rows={mode === "treatment" ? 4 : 8}
      />
      {mode === "knowledge" ? (
        <p style={{ margin: 0, fontSize: 12.5, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
          Örnek: tedavi süreci, konaklama, transfer veya sık sorulan bir politikanın kısa özeti.
        </p>
      ) : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: UI_COLORS.danger }}>{error}</p> : null}
      {footer}
    </div>
  );
}

function SuccessFeedback({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(16,185,129,0.1)",
          color: "#10b981",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CheckCircle2 size={48} />
      </div>
      <h3 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, margin: 0 }}>{title}</h3>
      <p style={{ color: UI_COLORS.textSecondary, fontSize: 15, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function TextareaField({
  label,
  placeholder,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={fieldLabel}>{label}</label>
      <textarea
        placeholder={placeholder}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        style={textareaStyle}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = UI_COLORS.brand;
        }}
        onBlur={(event) => {
          event.currentTarget.style.borderColor = UI_COLORS.border;
        }}
      />
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  loading,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, paddingTop: 20, borderTop: `1px solid ${UI_COLORS.border}` }}>
      <Button variant="ghost" onClick={onCancel} disabled={loading}>
        İptal
      </Button>
      <Button onClick={onConfirm} disabled={disabled || loading} style={{ minWidth: 120 }}>
        {loading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="animate-spin" /> Kaydediliyor…
          </span>
        ) : (
          confirmLabel
        )}
      </Button>
    </div>
  );
}

function EntityTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={fieldLabel}>Kayıt Türü</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        {ENTITY_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {(value === "doctor_profile" || value === "treatment_profile") && (
        <p style={{ fontSize: 12, color: UI_COLORS.textMuted, margin: 0, lineHeight: 1.5 }}>
          {value === "doctor_profile"
            ? "Bu kayıt bir doktor profili olarak işlenecek. Doktorun adı, unvanı, uzmanlık alanı ve tedavileri yapılandırılmış veri olarak değerlendirilecektir."
            : "Bu kayıt bir tedavi profili olarak işlenecek. Tedavi adı, tanımı, süre bilgisi, atanan doktorlar ve öncesi/sonrası URL'si yapılandırılmış veri olarak değerlendirilecektir."}
        </p>
      )}
    </div>
  );
}

const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: UI_COLORS.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 12,
  background: UI_COLORS.bgInput,
  border: `1px solid ${UI_COLORS.border}`,
  fontSize: 14.5,
  color: UI_COLORS.textPrimary,
  outline: "none",
  resize: "vertical",
  font: "inherit",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  background: UI_COLORS.bgInput,
  border: `1px solid ${UI_COLORS.border}`,
  fontSize: 14.5,
  color: UI_COLORS.textPrimary,
  outline: "none",
  cursor: "pointer",
};

const sheetOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
};

const sheetPanel: CSSProperties = {
  marginTop: 12,
  width: "100%",
  maxWidth: 560,
  background: UI_COLORS.bgCard,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  border: `1px solid ${UI_COLORS.border}`,
  display: "flex",
  flexDirection: "column",
  height: "calc(100% - 12px)",
  boxShadow: "0 -12px 40px rgba(0,0,0,0.35)",
};

const sheetHeader: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr 72px",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px",
  borderBottom: `1px solid ${UI_COLORS.border}`,
  paddingTop: "max(14px, env(safe-area-inset-top))",
};

const sheetHeaderBtn: CSSProperties = {
  border: 0,
  background: "transparent",
  color: UI_COLORS.textSecondary,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  padding: 8,
};

const sheetFooter: CSSProperties = {
  padding: "12px 16px",
  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
  borderTop: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgCard,
};
