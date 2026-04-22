"use client";

import React from "react";
import { UI_COLORS } from "./ui-shared";
import BackToDashboard from "./BackToDashboard";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
}: PageHeaderProps) {
  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      gap: 12,
      marginBottom: 32,
      width: "100%"
    }}>
      {backHref && (
        <BackToDashboard href={backHref} label={backLabel} />
      )}

      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 20
      }}>
        <div style={{ flex: "1 1 300px" }}>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            color: UI_COLORS.textPrimary, 
            letterSpacing: "-0.6px",
            lineHeight: 1.2
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ 
              color: UI_COLORS.textSecondary, 
              marginTop: 6, 
              fontSize: 15,
              fontWeight: 500,
              maxWidth: 600
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 12,
            flexWrap: "wrap"
          }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
