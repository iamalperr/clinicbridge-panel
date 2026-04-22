import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string | number;
    isUp: boolean;
  };
}

export default function StatCard({ label, value, subtext, icon, trend }: StatCardProps) {
  return (
    <div style={{
      background: UI_COLORS.bgCard,
      border: `1px solid ${UI_COLORS.border}`,
      borderRadius: UI_COMMON_STYLES.radius,
      padding: UI_COMMON_STYLES.cardPadding,
      transition: UI_COMMON_STYLES.transition,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ 
          fontSize: UI_COMMON_STYLES.labelSize, 
          fontWeight: 600, 
          color: UI_COLORS.textSecondary, 
          textTransform: "uppercase", 
          letterSpacing: "0.08em" 
        }}>
          {label}
        </p>
        {icon && <span style={{ color: UI_COLORS.brand, opacity: 0.7 }}>{icon}</span>}
      </div>
      <div style={{ 
        display: "flex", 
        alignItems: "baseline", 
        gap: 12, 
        marginTop: 12 
      }}>
        <p style={{ 
          fontSize: 30, 
          fontWeight: 800, 
          color: UI_COLORS.textPrimary, 
          letterSpacing: "-0.8px", 
          lineHeight: 1 
        }}>
          {value}
        </p>
        
        {trend && (
          <span style={{ 
            fontSize: 13, 
            fontWeight: 700, 
            color: trend.isUp ? "#10b981" : UI_COLORS.danger,
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "2px 6px",
            background: trend.isUp ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            borderRadius: 6
          }}>
            {trend.isUp ? "↑" : "↓"} {trend.value}%
          </span>
        )}
      </div>
      {subtext && (
        <p style={{ 
          fontSize: 12.5, 
          color: UI_COLORS.textMuted, 
          marginTop: 8, 
          fontWeight: 400 
        }}>
          {subtext}
        </p>
      )}
    </div>
  );
}
