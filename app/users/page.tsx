"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
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
import { UserPlus, Search, Shield, Building2, Calendar, Edit2, Trash2, Power, Ban } from "lucide-react";

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
  
  // Action states
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
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
      
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() as UserProfile })));
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
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;

    return users.filter(u => {
      const clinicName = clinics.find(c => c.id === u.clinicId)?.name || "";
      const roleStr = u.role === "admin" ? t("users.roles.admin") : t("users.roles.clinicUser");
      
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        roleStr.toLowerCase().includes(q) ||
        clinicName.toLowerCase().includes(q)
      );
    });
  }, [users, clinics, searchQuery, t]);

  const openAddUser = () => {
    setNewUser({ name: "", email: "", role: "clinicUser", status: "active", clinicId: "" });
    setEditingUserId(null);
    setIsModalOpen(true);
  };

  const openEditUser = (user: UserProfile) => {
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      clinicId: user.clinicId || ""
    });
    setEditingUserId(user.id || null);
    setIsModalOpen(true);
  };

  const toggleUserStatus = async (user: UserProfile) => {
    if (!user.id) return;
    try {
      const newStatus = user.status === "active" ? "pending" : "active";
      await updateDoc(doc(db, "users", user.id), { status: newStatus });
      fetchData(); // Refresh list
    } catch (err) {
      console.error("Failed to toggle user status:", err);
    }
  };

  const confirmDeleteUser = (user: UserProfile) => {
    if (user.email === profile?.email) {
      alert("Kendi hesabınızı silemezsiniz.");
      return;
    }
    const adminCount = users.filter(u => u.role === "admin").length;
    if (user.role === "admin" && adminCount <= 1) {
      alert("Sistemdeki son admin kullanıcıyı silemezsiniz.");
      return;
    }
    setUserToDelete(user);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete?.id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "users", userToDelete.id));
      setUserToDelete(null);
      fetchData();
    } catch (err) {
      console.error("Failed to delete user:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddUser = async () => {
    // Validation
    if (!newUser.name || !newUser.email || !newUser.role) {
      setError(t("common.loading") /* Need a generic validation error key really, using placeholder */);
      return;
    }

    if (newUser.role === "clinicUser" && !newUser.clinicId) {
      setError(t("users.table.clinic"));
      return;
    }

    if (editingUserId) {
      setIsSubmitting(true);
      setError(null);
      try {
        const userData = {
          name: newUser.name,
          role: newUser.role,
          status: newUser.status || "active",
          clinicId: newUser.role === "admin" ? null : newUser.clinicId,
        };
        // Don't update email directly to prevent auth mismatch
        await updateDoc(doc(db, "users", editingUserId), userData);
        
        setSubmitSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          setSubmitSuccess(false);
          fetchData();
        }, 1500);
      } catch (err) {
        console.error("Failed to update user:", err);
        setError(t("common.loading"));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const normalizedEmail = newUser.email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError(t("common.search") /* Placeholder */);
      return;
    }

    if (newUser.role === "clinicUser" && !newUser.clinicId) {
      setError(t("users.table.clinic"));
      return;
    }

    // 1. Frontend State Check (Case-insensitive)
    const isDuplicateLocal = users.some(u => u.email.trim().toLowerCase() === normalizedEmail);
    if (isDuplicateLocal) {
      setError("Bu e-posta adresiyle kayıtlı bir kullanıcı zaten mevcut.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 2. Backend Direct Query Check (To prevent concurrent duplicates)
      const duplicateQuery = query(collection(db, "users"), where("email", "==", normalizedEmail));
      const duplicateSnap = await getDocs(duplicateQuery);
      
      if (!duplicateSnap.empty) {
        setError("Bu e-posta adresiyle kayıtlı bir kullanıcı zaten mevcut.");
        setIsSubmitting(false);
        return;
      }
      const userData = {
        uid: "", // Manually created profiles start with empty UID
        name: newUser.name,
        email: normalizedEmail,
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
          <Button onClick={openAddUser}>
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
            placeholder="İsim, e-posta, rol veya klinik ile ara..." 
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
              <th style={{ padding: "16px 20px", width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: "48px", textAlign: "center", color: UI_COLORS.textMuted }}>
                  <div style={{ display: "inline-block", width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
                  <p>{t("common.loading")}</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "48px", textAlign: "center", color: UI_COLORS.textMuted }}>
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
                  <td style={{ padding: "16px 20px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      <button onClick={() => openEditUser(u)} style={{ background: "transparent", border: "none", color: UI_COLORS.textSecondary, cursor: "pointer", padding: 6, borderRadius: 6 }} title="Düzenle">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => toggleUserStatus(u)} style={{ background: "transparent", border: "none", color: UI_COLORS.textSecondary, cursor: "pointer", padding: 6, borderRadius: 6 }} title={u.status === "active" ? "Pasife Al" : "Aktifleştir"}>
                        {u.status === "active" ? <Ban size={16} /> : <Power size={16} />}
                      </button>
                      <button onClick={() => confirmDeleteUser(u)} style={{ background: "transparent", border: "none", color: UI_COLORS.danger, cursor: "pointer", padding: 6, borderRadius: 6 }} title="Sil">
                        <Trash2 size={16} />
                      </button>
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
              disabled={!!editingUserId} // Prevent changing email on edit to avoid auth issues
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
                {isSubmitting ? t("common.loading") : (editingUserId ? t("common.save") : t("common.save"))}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!userToDelete}
        onClose={() => !isDeleting && setUserToDelete(null)}
        title="Kullanıcıyı Sil"
        width={400}
      >
        <div style={{ padding: "10px 0" }}>
          <p style={{ color: UI_COLORS.textPrimary, fontSize: 14, lineHeight: 1.5 }}>
            <strong>{userToDelete?.name || userToDelete?.email}</strong> kullanıcısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
            <Button variant="ghost" onClick={() => setUserToDelete(null)} disabled={isDeleting}>{t("common.cancel")}</Button>
            <Button onClick={handleDeleteUser} disabled={isDeleting} style={{ background: UI_COLORS.danger, color: "white" }}>
              {isDeleting ? t("common.loading") : "Evet, Sil"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
