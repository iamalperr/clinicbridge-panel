import { SelectHTMLAttributes, forwardRef } from "react";
import { BaseFormFieldProps, UI_COLORS, UI_COMMON_STYLES, getBorderColor } from "./ui-shared";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, BaseFormFieldProps {
  options: { label: string; value: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, style, containerStyle, className, containerClassName, ...props }, ref) => {
    return (
      <div 
        className={containerClassName || className} 
        style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", ...containerStyle }}
      >
        {label && (
          <label style={{ fontSize: UI_COMMON_STYLES.labelSize, fontWeight: 500, color: UI_COLORS.textPrimary }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          style={{
            padding: "10px 14px",
            fontSize: UI_COMMON_STYLES.fontSize,
            borderRadius: UI_COMMON_STYLES.radius,
            border: `1px solid ${getBorderColor(error)}`,
            background: UI_COLORS.bgInput,
            color: UI_COLORS.textPrimary,
            outline: "none",
            transition: UI_COMMON_STYLES.transition,
            appearance: "none",
            WebkitAppearance: "none",
            cursor: "pointer",
            ...style
          }}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <span style={{ fontSize: UI_COMMON_STYLES.errorSize, color: UI_COLORS.danger }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
