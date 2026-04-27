"use client";

import { useState } from "react";
import { User, Bell, Palette, Shield, Lock, LogOut, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Modal from "@/components/ui/Modal";
import { UI_COLORS } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";

export default function SettingsPage() {
  const { profile } = useAuth();
  const { t } = useI18n();

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      setError("Yeni şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yeni şifreler eşleşmiyor.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      
      setSuccess(true);
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setSuccess(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 2000);
    } catch (err: any) {
      console.error("Password change failed:", err);
      if (err.code === "auth/invalid-credential") {
        setError("Mevcut şifreniz hatalı.");
      } else if (err.code === "auth/weak-password") {
        setError("Yeni şifre çok zayıf.");
      } else {
        setError("Şifre güncellenirken bir hata oluştu.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
              onClick={() => {
                setError(null);
                setSuccess(false);
                setIsPasswordModalOpen(true);
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

      {/* Password Change Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => !isSubmitting && !success && setIsPasswordModalOpen(false)} title="Şifre Değiştir" width={450}>
        {success ? (
          <div style={{ padding: "30px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <CheckCircle2 size={32} />
            </div>
            <h3 style={{ color: UI_COLORS.textPrimary, fontSize: 18, marginBottom: 8 }}>Şifre Güncellendi</h3>
            <p style={{ color: UI_COLORS.textSecondary, fontSize: 14 }}>Şifreniz başarıyla değiştirildi.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input 
              label="Mevcut Şifre" 
              type="password" 
              value={currentPassword} 
              onChange={(e) => setCurrentPassword(e.target.value)} 
              placeholder="••••••••"
            />
            <Input 
              label="Yeni Şifre" 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              placeholder="En az 8 karakter"
            />
            <Input 
              label="Yeni Şifre (Tekrar)" 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              placeholder="••••••••"
            />
            
            {error && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.08)", border: `1px solid ${UI_COLORS.danger}20`, borderRadius: 8, color: UI_COLORS.danger, fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, paddingTop: 18, borderTop: `1px solid ${UI_COLORS.border}` }}>
              <Button variant="ghost" onClick={() => setIsPasswordModalOpen(false)} disabled={isSubmitting}>İptal</Button>
              <Button onClick={handlePasswordChange} disabled={!currentPassword || !newPassword || !confirmPassword || isSubmitting} style={{ minWidth: 140 }}>
                {isSubmitting ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" />
                    Kaydediliyor...
                  </div>
                ) : "Şifreyi Güncelle"}
              </Button>
            </div>
          </div>
        )}
        <style>{`
          .animate-spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </Modal>

    </div>
  );
}
