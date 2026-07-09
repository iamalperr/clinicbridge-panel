type BadgeVariant =
  | "active" | "inactive" | "trial"
  | "pro" | "starter" | "enterprise"
  | "indexed" | "pending" | "failed"
  | "resolved" | "open" | "escalated"
  // Semantic variants
  | "success" | "info" | "warning" | "danger" | "default"
  // Module-specific variants
  | "module-ai" | "module-widget" | "module-voice" | "module-sms";

const MAP: Record<BadgeVariant, { bg: string; color: string }> = {
  active:        { bg: "var(--badge-active-bg)",     color: "var(--badge-active-fg)" },
  inactive:      { bg: "var(--badge-inactive-bg)",   color: "var(--badge-inactive-fg)" },
  trial:         { bg: "var(--badge-trial-bg)",      color: "var(--badge-trial-fg)" },
  pro:           { bg: "var(--badge-pro-bg)",        color: "var(--badge-pro-fg)" },
  starter:       { bg: "var(--badge-trial-bg)",      color: "var(--badge-trial-fg)" }, // legacy fallback
  enterprise:    { bg: "var(--badge-enterprise-bg)", color: "var(--badge-enterprise-fg)" },
  indexed:       { bg: "var(--badge-active-bg)",     color: "var(--badge-active-fg)" },
  pending:       { bg: "var(--badge-trial-bg)",      color: "var(--badge-trial-fg)" },
  failed:        { bg: "var(--badge-failed-bg)",     color: "var(--badge-failed-fg)" },
  resolved:      { bg: "var(--badge-active-bg)",     color: "var(--badge-active-fg)" },
  open:          { bg: "var(--badge-open-bg)",       color: "var(--badge-open-fg)" },
  escalated:     { bg: "var(--badge-failed-bg)",     color: "var(--badge-failed-fg)" },
  // Module badges — distinct muted tones
  "module-ai":     { bg: "rgba(99,102,241,0.12)",  color: "#818cf8" },
  "module-widget": { bg: "rgba(14,165,233,0.12)",  color: "#38bdf8" },
  "module-voice":  { bg: "rgba(168,85,247,0.12)",  color: "#c084fc" },
  "module-sms":    { bg: "rgba(234,179,8,0.12)",   color: "#facc15" },
  // Semantic variants
  success:         { bg: "var(--badge-active-bg)",     color: "var(--badge-active-fg)" },
  info:            { bg: "var(--badge-open-bg)",       color: "var(--badge-open-fg)" },
  warning:         { bg: "var(--badge-trial-bg)",      color: "var(--badge-trial-fg)" },
  danger:          { bg: "var(--badge-failed-bg)",     color: "var(--badge-failed-fg)" },
  default:         { bg: "var(--badge-inactive-bg)",   color: "var(--badge-inactive-fg)" },
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  dot?: boolean;
}

export default function Badge({ variant, label, dot = false }: BadgeProps) {
  const s = MAP[variant] ?? MAP.inactive;
  const defaultLabel =
    variant === "module-ai"     ? "AI" :
    variant === "module-widget" ? "Widget" :
    variant === "module-voice"  ? "Voice" :
    variant === "module-sms"    ? "SMS" :
    (variant.charAt(0).toUpperCase() + variant.slice(1));
  const text = label ?? defaultLabel;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 99,
      fontSize: 11.5, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />}
      {text}
    </span>
  );
}
