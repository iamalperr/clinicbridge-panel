"use client";

import { useState, useEffect } from "react";
import { Button } from "./Button";
import { UI_COLORS } from "./ui-shared";
import Link from "next/link";

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Sadece browser tarafında çalışır
    const consent = localStorage.getItem("cb-cookie-consent");
    if (!consent) {
      setIsVisible(true);
    } else if (consent === "accepted") {
      // Analytics burada başlatılabilir
      window.dispatchEvent(new CustomEvent("cookie-consent-accepted"));
    }
  }, []);

  if (!isVisible) return null;

  const handleAccept = () => {
    localStorage.setItem("cb-cookie-consent", "accepted");
    setIsVisible(false);
    window.dispatchEvent(new CustomEvent("cookie-consent-accepted"));
  };

  const handleReject = () => {
    localStorage.setItem("cb-cookie-consent", "rejected");
    setIsVisible(false);
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      maxWidth: 380,
      background: UI_COLORS.bgCard,
      border: `1px solid ${UI_COLORS.border}`,
      borderRadius: 16,
      padding: 24,
      boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 16
    }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
          Çerezleri Yönetin
        </h3>
        <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
          Size daha iyi hizmet verebilmek ve platform kullanımını analiz etmek için çerezleri kullanıyoruz.
          Sadece temel çerezleri kabul edebilir veya analitik dahil tüm çerezlere izin verebilirsiniz.
          Detaylı bilgi için <Link href="/kvkk" style={{ color: UI_COLORS.brand, textDecoration: "none" }}>KVKK Metni</Link>'ni inceleyebilirsiniz.
        </p>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button variant="secondary" onClick={handleReject} style={{ flex: 1, padding: "8px" }}>
          Sadece Gerekli
        </Button>
        <Button variant="primary" onClick={handleAccept} style={{ flex: 1, padding: "8px" }}>
          Tümünü Kabul Et
        </Button>
      </div>
    </div>
  );
}
