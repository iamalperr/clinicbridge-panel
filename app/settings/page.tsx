"use client";

import { User, Bell, Palette, Shield, Lock, LogOut, ChevronRight } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { UI_COLORS } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";

export default function SettingsPage() {
  const { profile } = useAuth();
  const { t } = useI18n();

  return (
    <div style={{ 
      flex: 1, 
      overflowY: "auto", 
      padding: "32px 40px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      <div style={{ width: "100%", maxWidth: 880 }}>
        <PageHeader 
          title={t("nav.settings")}
          subtitle={t("settings.subtitle")}
          backHref="/clinics"
          backLabel="Dashboard"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 28 }}>
          
          {/* Profile Section */}
          <SectionCard title="Profil Tercihleri" icon={<User size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                <Input label="Tam Ad" defaultValue={profile?.name || "Admin User"} placeholder="Adınızı girin" />
                <Input label="E-posta Adresi" defaultValue={profile?.email || ""} type="email" placeholder="email@örnek.com" />
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                paddingTop: 12,
                borderTop: `1px solid ${UI_COLORS.border}`
              }}>
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Üyelik Rolü: <strong style={{color: UI_COLORS.brand}}>{profile?.role?.toUpperCase() || "ADMIN"}</strong></p>
                <Button style={{ padding: "10px 24px" }}>Değişiklikleri Kaydet</Button>
              </div>
            </div>
          </SectionCard>

          {/* Appearance Section */}
          <SectionCard title="Görünüm ve Tema" icon={<Palette size={18} />}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "16px 20px",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: 14,
              border: `1px solid ${UI_COLORS.border}`
            }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>Tema Modu</p>
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 4 }}>Panel için aydınlık ve karanlık mod arasında geçiş yapın.</p>
              </div>
              <div style={{ padding: "4px", background: "rgba(0,0,0,0.1)", borderRadius: 12 }}>
                <ThemeToggle />
              </div>
            </div>
          </SectionCard>

          {/* Notifications Section */}
          <SectionCard title="Bildirim Ayarları" icon={<Bell size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { title: "E-posta Bildirimleri", desc: "Sistem kullanım özetlerini günlük olarak alın.", active: true },
                { title: "Güvenlik Uyarıları", desc: "Yeni giriş denemeleri ve yetki değişimlerinde haberdar olun.", active: true },
                { title: "Fatura Hatırlatıcıları", desc: "Klinik deneme süreleri dolduğunda bildirim alın.", active: false },
              ].map((item, i) => (
                <div key={i} style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  padding: "18px 0",
                  borderBottom: i === 2 ? "none" : `1px solid ${UI_COLORS.border}` 
                }}>
                  <div>
                    <p style={{ fontSize: 14.5, fontWeight: 700, color: UI_COLORS.textPrimary }}>{item.title}</p>
                    <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 4 }}>{item.desc}</p>
                  </div>
                  <Button variant="secondary" style={{ fontSize: 13, height: 36 }}>Düzenle</Button>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Security & Access Section */}
          <SectionCard title="Güvenlik ve Erişim" icon={<Shield size={18} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Password Change placeholder */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "16px 18px",
                borderRadius: 12,
                cursor: "pointer",
                transition: "background 0.2s",
                border: `1px solid ${UI_COLORS.border}`
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99, 102, 241, 0.08)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Lock size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>Şifre Değiştir</p>
                    <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2 }}>Hesap güvenliğiniz için şifrenizi düzenli güncelleyin.</p>
                  </div>
                </div>
                <ChevronRight size={18} color={UI_COLORS.textMuted} />
              </div>

              {/* Logout */}
              <div style={{ 
                marginTop: 8,
                padding: "20px",
                borderRadius: 16,
                background: "rgba(239, 68, 68, 0.03)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 700, color: UI_COLORS.danger }}>Oturumu Kapat</p>
                  <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 4 }}>Tüm cihazlarınızdaki erişim güvenli bir şekilde sonlandırılır.</p>
                </div>
                <Button 
                  variant="danger" 
                  onClick={() => signOut(auth)}
                  style={{ 
                    display: "flex", 
                    gap: 8, 
                    alignItems: "center",
                    padding: "10px 20px"
                  }}
                >
                  <LogOut size={16} />
                  Çıkış Yap
                </Button>
              </div>
            </div>
          </SectionCard>

          <p style={{ 
            textAlign: "center", 
            fontSize: 13, 
            color: UI_COLORS.textMuted, 
            marginTop: 12,
            marginBottom: 40,
            fontWeight: 500
          }}>
            ClinicBridge v1.0.4 • Sistem aktif ve tüm servisler çalışıyor.
          </p>
        </div>
      </div>
    </div>
  );
}
