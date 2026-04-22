interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  emoji?: string;
}

export default function EmptyState({ title, description, action, emoji = "📭" }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px" }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>{emoji}</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 380, margin: "0 auto 20px" }}>{description}</p>
      )}
      {action}
    </div>
  );
}
