"use client";

import { use, useEffect, useState, useMemo, useCallback } from "react";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { FileText, Plus, Search, Trash2, Edit2, Loader2, CheckCircle2 } from "lucide-react";
import type { TrainingMaterial } from "@/lib/types";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function TrainingPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();

  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [newNote, setNewNote] = useState({ title: "", content: "" });

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "trainingMaterials"),
        where("clinicId", "==", clinicId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingMaterial));
      setMaterials(data);
    } catch (err) {
      console.error("Failed to fetch materials:", err);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    const loadData = () => fetchMaterials();
    loadData();
  }, [clinicId, fetchMaterials]);

  const handleAddNote = async () => {
    if (!newNote.title || !newNote.content) return;

    setIsSubmitting(true);
    try {
      const docData = {
        title: newNote.title,
        content: newNote.content,
        category: "",
        tags: [],
        type: "note",
        status: "learned",
        clinicId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "trainingMaterials"), docData);
      setIsSuccess(true);
      
      setTimeout(() => {
        setIsAddModalOpen(false);
        setIsSuccess(false);
        setNewNote({ title: "", content: "" });
        fetchMaterials();
      }, 1500);
    } catch (err) {
      console.error("Failed to add note:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.actions.delete") + "?")) return;
    try {
      await deleteDoc(doc(db, "trainingMaterials", id));
      setMaterials(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           m.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [materials, searchQuery]);

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Header Area */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
          {t("training.title")}
        </h1>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("training.subtitle")}
        </p>
      </div>

      {/* Main Action Area */}
      <div 
        onClick={() => setIsAddModalOpen(true)}
        style={{ 
          background: UI_COLORS.bgCard, 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: 20, 
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          transition: UI_COMMON_STYLES.transition,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          marginBottom: 40
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = UI_COLORS.brand;
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = UI_COLORS.border;
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ 
            width: 60, height: 60, borderRadius: 16, background: UI_COMMON_STYLES.brandGradient,
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
            boxShadow: "0 8px 16px rgba(99, 102, 241, 0.2)"
          }}>
            <Plus size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 4 }}>
              {t("training.writeNote")}
            </h3>
            <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, fontWeight: 500, maxWidth: 400 }}>
              {t("training.writeNoteSubtitle")}
            </p>
          </div>
        </div>
        
        <Button 
          onClick={(e) => {
            e.stopPropagation();
            setIsAddModalOpen(true);
          }}
          style={{ padding: "12px 24px", borderRadius: 12, fontWeight: 700 }}
        >
          {t("common.actions.add")}
        </Button>
      </div>

      {/* Knowledge Library Section */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.5px" }}>
            {t("training.library")}
          </h2>
          
          <div style={{ position: "relative", width: 300 }}>
            <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: UI_COLORS.textMuted }} />
            <input 
              type="text"
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px 12px 44px", borderRadius: 12,
                background: "rgba(255, 255, 255, 0.03)", border: `1px solid ${UI_COLORS.border}`,
                fontSize: 14, color: UI_COLORS.textPrimary, outline: "none",
                transition: "all 0.2s"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = UI_COLORS.brand}
              onBlur={(e) => e.currentTarget.style.borderColor = UI_COLORS.border}
            />
          </div>
        </div>

        {/* Library Table */}
        <div style={{ 
          background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)"
        }}>
          {loading ? (
            <div style={{ padding: 80, textAlign: "center", color: UI_COLORS.textMuted }}>
              <Loader2 size={40} className="animate-spin" style={{ margin: "0 auto 16px", color: UI_COLORS.brand }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>{t("common.loading")}</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div style={{ padding: "80px 40px", textAlign: "center" }}>
              <div style={{ 
                width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.03)", 
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: UI_COLORS.textMuted
              }}>
                <FileText size={32} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
                {searchQuery ? t("training.empty.noResults") : t("training.empty.title")}
              </h3>
              <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
                {searchQuery ? "" : t("training.empty.description")}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddModalOpen(true)} style={{ borderRadius: 10 }}>
                  {t("training.addInfo")}
                </Button>
              )}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: "rgba(255, 255, 255, 0.02)" }}>
                  <th style={{ padding: "18px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("training.materialName")}
                  </th>
                  <th style={{ padding: "18px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
                    {t("users.table.status") /* Action Label */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((m) => (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.01)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "18px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(99, 102, 241, 0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <FileText size={20} />
                        </div>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>{m.title}</p>
                          <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 2, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.content}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "18px 24px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button 
                          style={{ background: "none", border: "none", color: UI_COLORS.textMuted, cursor: "pointer", padding: 8, borderRadius: 8, transition: "all 0.2s" }} 
                          onMouseEnter={(e) => { e.currentTarget.style.color = UI_COLORS.textPrimary; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }} 
                          onMouseLeave={(e) => { e.currentTarget.style.color = UI_COLORS.textMuted; e.currentTarget.style.background = "none"; }}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(m.id)} 
                          style={{ background: "none", border: "none", color: UI_COLORS.textMuted, cursor: "pointer", padding: 8, borderRadius: 8, transition: "all 0.2s" }} 
                          onMouseEnter={(e) => { e.currentTarget.style.color = UI_COLORS.danger; e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; }} 
                          onMouseLeave={(e) => { e.currentTarget.style.color = UI_COLORS.textMuted; e.currentTarget.style.background = "none"; }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Creation Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => !isSubmitting && setIsAddModalOpen(false)} title={isSuccess ? "" : t("training.addNoteTitle")} width={600}>
        {isSuccess ? (
          <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)" }}>
              <CheckCircle2 size={48} />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("training.noteSaved")}</h3>
            <p style={{ color: UI_COLORS.textSecondary, fontSize: 15 }}>{t("training.aiInstruction")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Input 
              label={t("training.fields.title")} 
              placeholder={t("training.placeholders.title")} 
              value={newNote.title}
              onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
            />
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("training.fields.content")}</label>
              <textarea 
                placeholder={t("training.placeholders.content")}
                value={newNote.content}
                onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                style={{
                  width: "100%", height: 240, padding: 16, borderRadius: 12,
                  background: "rgba(0, 0, 0, 0.2)", border: `1px solid ${UI_COLORS.border}`,
                  fontSize: 14.5, color: UI_COLORS.textPrimary, outline: "none", resize: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = UI_COLORS.brand}
                onBlur={(e) => e.currentTarget.style.borderColor = UI_COLORS.border}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, paddingTop: 20, borderTop: `1px solid ${UI_COLORS.border}` }}>
              <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>{t("common.cancel")}</Button>
              <Button 
                onClick={handleAddNote} 
                disabled={!newNote.title || !newNote.content || isSubmitting}
                style={{ minWidth: 120 }}
              >
                {isSubmitting ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : t("common.save")}
              </Button>
            </div>
          </div>
        )}
        <style>{`
          .animate-spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}</style>
      </Modal>
    </div>
  );
}
