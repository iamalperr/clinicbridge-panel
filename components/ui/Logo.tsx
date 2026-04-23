"use client";

import Image from "next/image";
import { UI_COLORS } from "./ui-shared";

interface LogoProps {
  size?: "sm" | "md" | "lg";
}

export default function Logo({ size = "md" }: LogoProps) {
  const iconSize = size === "sm" ? 24 : size === "md" ? 28 : 42;
  const textSize = size === "sm" ? 18 : size === "md" ? 22 : 32;
  const letterSpacing = size === "sm" ? "-0.5px" : size === "md" ? "-0.8px" : "-1.2px";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "sm" ? 8 : size === "md" ? 10 : 14 }}>
      <Image 
        src="/icon.svg" 
        alt="ClinicBridge Icon" 
        width={iconSize} 
        height={iconSize} 
        priority
      />
      <span style={{ 
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
        fontSize: textSize,
        fontWeight: 800,
        letterSpacing: letterSpacing,
        lineHeight: 1,
        display: "flex",
        alignItems: "center"
      }}>
        <span style={{ color: UI_COLORS.textPrimary }}>Clinic</span>
        <span className="text-[#0ea5e9] dark:text-[#38bdf8]">Bridge</span>
      </span>
    </div>
  );
}
