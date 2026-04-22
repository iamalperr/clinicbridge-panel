import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function SectionCard({ title, subtitle, icon, action, children, noPadding }: SectionCardProps) {
  return (
    <div style={{
      background: UI_COLORS.bgCard,
      border: `1px solid ${UI_COLORS.border}`,
      borderRadius: UI_COMMON_STYLES.radius,
      marginBottom: 24,
      overflow: "hidden",
    }}>
      {(title || action || icon) && (
        <div style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${UI_COLORS.border}`,
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            {icon && (
              <div style={{ 
                marginTop: 2, 
                color: UI_COLORS.brand, 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                opacity: 0.8
              }}>
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 style={{ 
                  fontSize: 15, 
                  fontWeight: 700, 
                  color: UI_COLORS.textPrimary, 
                  letterSpacing: "-0.2px" 
                }}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p style={{ 
                  fontSize: 12.5, 
                  color: UI_COLORS.textMuted, 
                  marginTop: 4,
                  lineHeight: 1.4
                }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div style={{ marginLeft: 16 }}>{action}</div>}
        </div>
      )}
      <div style={noPadding ? {} : { padding: "24px" }}>
        {children}
      </div>
    </div>
  );
}
