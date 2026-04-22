"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile, Clinic, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { UserPlus, Search, Shield, Building2, Calendar } from "lucide-react";

import { useI18n } from "@/lib/i18n-context";

export default function UsersPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [newUser, setNewUser] = useState<Partial<UserProfile>>({
    name: "",
    email: "",
    role: "clinicUser",
    status: "active",
    clinicId: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [userSnap, clinicSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), orderBy("email", "asc"))),
        getDocs(collection(db, "clinics"))
      ]);
      
      setUsers(userSnap.docs.map(d => ({ ...d.data() as UserProfile })));
      setClinics(clinicSnap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Clinic, "id"> })));
    } catch (err) {
      console.error("Failed to fetch users/clinics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const handleAddUser = async () => {
    // Validation
    if (!newUser.name || !newUser.email || !newUser.role) {
      setError(t("common.loading") /* Need a generic validation error key really, using placeholder */);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      setError(t("common.search") /* Placeholder */);
      return;
    }

    if (newUser.role === "clinicUser" && !newUser.clinicId) {
      setError(t("users.table.clinic"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const userData = {
        uid: "", // Manually created profiles start with empty UID
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status || "active",
        clinicId: newUser.role === "admin" ? null : newUser.clinicId,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "users"), userData);
      
      setSubmitSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitSuccess(false);
        setNewUser({ name: "", email: "", role: "clinicUser", status: "active", clinicId: "" });
        fetchData();
      }, 1500);
      
    } catch (err) {
      console.error("Failed to add user:", err);
      setError(t("common.loading"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profile?.role !== "admin") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ textAlign: "center" }}>
          <Shield size={48} color={UI_COLORS.danger} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h2 style={{ color: UI_COLORS.textPrimary, marginBottom: 8 }}>{t("auth.accessDenied")}</h2>
          <p style={{ color: UI_COLORS.textSecondary }}>{t("auth.adminOnly")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
      <PageHeader 
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        backHref="/clinics"
        backLabel="Dashboard"
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <UserPlus size={18} style={{ marginRight: 8 }} />
            {t("users.addUser")}
          </Button>
        }
      />

      {/* Controls */}
      <div style={{ marginBottom: 24, display: "flex", gap: 16 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: UI_COLORS.textMuted }} />
          <input 
            placeholder={t("users.searchPlaceholder")} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: "100%", padding: "10px 12px 10px 40px", borderRadius: 10,
              background: "rgba(255, 255, 255, 0.03)", border: `1px solid ${UI_COLORS.border}`,
              fontSize: 13.5, color: UI_COLORS.textPrimary, outline: "none"
            }}
          />
        </div>
      </div>

      {/* User Table */}
      <div style={{ 
        background: UI_COLORS.bgCard, 
        border: `1px solid ${UI_COLORS.border}`, 
        borderRadius: UI_COMMON_STYLES.radius,
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.01)" }}>
              <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase" }}>{t("users.table.user")}</th>
              <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase" }}>{t("users.table.role")}</th>
              <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase" }}>{t("users.table.clinic")}</th>
              <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase" }}>{t("users.table.status")}</th>
              <th style={{ padding: "16px 20px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase" }}>{t("users.table.created")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: "48px", textAlign: "center", color: UI_COLORS.textMuted }}>
                  <div style={{ display: "inline-block", width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
                  <p>{t("common.loading")}</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "48px", textAlign: "center", color: UI_COLORS.textMuted }}>
                  {t("training.empty.noResults")}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, i) => (
                <tr key={u.email} style={{ borderBottom: i === filteredUsers.length - 1 ? "none" : `1px solid ${UI_COLORS.border}`, transition: "background 0.2s" }}>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ 
                        width: 36, height: 36, borderRadius: "50%", 
                        background: UI_COMMON_STYLES.brandGradient, 
                        display: "flex", alignItems: "center", justifyContent: "center", 
                        fontSize: 13, fontWeight: 800, color: "white" 
                      }}>
                        {(u.name?.[0] || u.email[0]).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>{u.name || "Untitled User"}</p>
                        <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: u.role === "admin" ? UI_COLORS.brand : UI_COLORS.textPrimary }}>
                      <Shield size={14} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{u.role === "admin" ? t("users.roles.admin") : t("users.roles.clinicUser")}</span>
                    </div>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: UI_COLORS.textSecondary }}>
                      {u.role === "clinicUser" ? (
                        <>
                          <Building2 size={14} />
                          <span style={{ fontSize: 13 }}>{clinics.find(c => c.id === u.clinicId)?.name || "Unknown Clinic"}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>{t("users.roles.platformWide")}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <Badge variant={u.status === "active" ? "active" : "trial"} label={t(`common.status.${u.status || "active"}`)} dot />
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: UI_COLORS.textMuted }}>
                      <Calendar size={14} />
                      <span style={{ fontSize: 13 }}>New Account</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={t("users.addUser")} 
        width={500}
      >
        {submitSuccess ? (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ 
              width: 56, height: 56, borderRadius: "50%", 
              background: "rgba(16, 185, 129, 0.1)", color: "#10b981",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px"
            }}>
              <Shield size={28} />
            </div>
            <h3 style={{ color: UI_COLORS.textPrimary, marginBottom: 8 }}>{t("training.noteSaved") /* Using generic success */}</h3>
            <p style={{ color: UI_COLORS.textSecondary }}>{t("training.aiInstruction")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input 
              label={t("users.table.user")} 
              placeholder="e.g. Ahmet Yılmaz" 
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
            <Input 
              label="E-posta" 
              type="email"
              placeholder="e.g. email@com" 
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Select 
                label={t("users.table.role")} 
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole, clinicId: e.target.value === "admin" ? "" : newUser.clinicId })}
                options={[
                  { label: t("users.roles.clinicUser"), value: "clinicUser" },
                  { label: t("users.roles.admin"), value: "admin" },
                ]}
              />
              <Select 
                label={t("users.table.status")} 
                value={newUser.status}
                onChange={(e) => setNewUser({ ...newUser, status: e.target.value as UserProfile['status'] })}
                options={[
                  { label: t("common.status.active"), value: "active" },
                  { label: t("common.status.pending"), value: "pending" },
                ]}
              />
            </div>

            {newUser.role === "clinicUser" && (
              <Select 
                label={t("users.table.clinic")} 
                value={newUser.clinicId}
                onChange={(e) => setNewUser({ ...newUser, clinicId: e.target.value })}
                options={[
                  { label: "...", value: "" },
                  ...clinics.map(c => ({ label: c.name, value: c.id }))
                ]}
              />
            )}

            {error && (
              <div style={{ 
                padding: "10px 14px", 
                background: "rgba(239, 68, 68, 0.08)", 
                border: `1px solid ${UI_COLORS.danger}20`,
                borderRadius: 8,
                color: UI_COLORS.danger,
                fontSize: 13,
                fontWeight: 500
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, paddingTop: 18, borderTop: `1px solid ${UI_COLORS.border}` }}>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>{t("common.cancel")}</Button>
              <Button onClick={handleAddUser} disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
