import { ButtonHTMLAttributes, forwardRef } from "react";
import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  fullWidth?: boolean;
  isLoading?: boolean;
}

const BASE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 22px",
  fontSize: 13.5,
  fontWeight: 600,
  borderRadius: UI_COMMON_STYLES.radius,
  cursor: "pointer",
  border: "1px solid transparent",
  transition: UI_COMMON_STYLES.transition,
  outline: "none",
  gap: 8,
  userSelect: "none",
};

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary: {
    background: UI_COLORS.brand,
    color: "white",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)",
  },
  secondary: {
    background: "rgba(255, 255, 255, 0.03)",
    border: `1px solid rgba(255, 255, 255, 0.1)`,
    color: UI_COLORS.textPrimary,
  },
  danger: {
    background: "rgba(239, 68, 68, 0.1)",
    color: UI_COLORS.danger,
  },
  ghost: {
    background: "transparent",
    color: UI_COLORS.textSecondary,
  }
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", fullWidth, style, children, isLoading, disabled, ...props }, ref) => {
    const isReallyDisabled = disabled || isLoading;
    
    return (
      <button
        ref={ref}
        disabled={isReallyDisabled}
        style={{ 
          ...BASE_STYLE, 
          ...VARIANT_STYLES[variant], 
          width: fullWidth ? "100%" : "auto",
          opacity: isReallyDisabled ? 0.6 : 1,
          cursor: isReallyDisabled ? "not-allowed" : "pointer",
          filter: isReallyDisabled ? "grayscale(0.2)" : "none",
          ...style 
        }}
        onMouseEnter={(e) => {
          if (!isReallyDisabled) {
            e.currentTarget.style.filter = "brightness(1.1)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isReallyDisabled) {
            e.currentTarget.style.filter = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
        {...props}
      >
        {isLoading && (
          <div style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }} />
        )}
        {children}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </button>
    );
  }
);

Button.displayName = "Button";
