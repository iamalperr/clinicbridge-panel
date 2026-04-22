"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";

interface BackToDashboardProps {
  label?: string;
  href?: string;
}

export default function BackToDashboard({ 
  label = "Dashboard", 
  href = "/clinics" 
}: BackToDashboardProps) {
  return (
    <Link 
      href={href}
      style={{ 
        display: "inline-flex", 
        alignItems: "center", 
        gap: 4, 
        color: UI_COLORS.textMuted, 
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        transition: UI_COMMON_STYLES.transition,
        width: "fit-content",
        marginBottom: 8
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = UI_COLORS.brand)}
      onMouseLeave={(e) => (e.currentTarget.style.color = UI_COLORS.textMuted)}
    >
      <ChevronLeft size={16} />
      {label}
    </Link>
  );
}
