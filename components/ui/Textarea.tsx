import { TextareaHTMLAttributes, forwardRef } from "react";
import { BaseFormFieldProps, UI_COLORS, UI_COMMON_STYLES, getBorderColor } from "./ui-shared";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, BaseFormFieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, style, containerStyle, className, containerClassName, ...props }, ref) => {
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
        <textarea
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
            minHeight: 100,
            resize: "vertical",
            fontFamily: "inherit",
            ...style
          }}
          {...props}
        />
        {error && (
          <span style={{ fontSize: UI_COMMON_STYLES.errorSize, color: UI_COLORS.danger }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
