"use client";

import { use, useEffect, useState, useMemo } from "react";
import {
  collection, query, where, addDoc, deleteDoc,
  doc, updateDoc, serverTimestamp, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import KnowledgeEditor, {
  EMPTY_KNOWLEDGE_VALUES,
  type KnowledgeEditorValues,
} from "@/components/clinic/training/KnowledgeEditor";
import { FileText, Plus, Search, Trash2, Edit2, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { TrainingMaterial } from "@/lib/types";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function TrainingPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();

  const [materials, setMaterials]   = useState<TrainingMaterial[]>([]);
  const [loading, setLoading]       = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  /* ── Add / edit editor (shared KnowledgeEditor) ── */
  const [isAddOpen, setIsAddOpen]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddSuccess, setIsAddSuccess] = useState(false);
  const [editTarget, setEditTarget]     = useState<TrainingMaterial | null>(null);
  const [editInitial, setEditInitial]   = useState(EMPTY_KNOWLEDGE_VALUES);
  const [isSaving, setIsSaving]         = useState(false);
  const [isEditSuccess, setIsEditSuccess] = useState(false);
  const [editError, setEditError]       = useState("");

  /* ── Delete confirmation modal ── */
  const [deleteTarget, setDeleteTarget] = useState<TrainingMaterial | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  const [deleteError, setDeleteError]   = useState("");

  /* ── Fetch (Real-time) ── */
  useEffect(() => {
    if (!clinicId) return;
    setLoading(true);
    
    const q = query(
      collection(db, "trainingMaterials"),
      where("clinicId", "==", clinicId),
      orderBy("createdAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingMaterial)));
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch materials:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clinicId]);

  /* ── Add ── */
  const handleAdd = async (values: KnowledgeEditorValues) => {
    if (!values.title || !values.content) return;
    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "trainingMaterials"), {
        title: values.title,
        content: values.content,
        entity_type: values.entity_type || "general",
        category: "", tags: [], type: "note", status: "learned",
        clinicId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        embedding_status: "indexing",
      });

      fetch("/api/admin/embeddings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docPath: `trainingMaterials/${docRef.id}` }),
      }).catch(console.error);

      setIsAddSuccess(true);
      setTimeout(() => {
        setIsAddOpen(false);
        setIsAddSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Failed to add:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Open edit modal ── */
  const openEdit = (m: TrainingMaterial) => {
    setEditTarget(m);
    setEditInitial({
      title: m.title,
      content: m.content,
      entity_type: m.entity_type || "general",
      priceRange: "",
    });
    setIsEditSuccess(false);
    setEditError("");
  };

  /* ── Save edit ── */
  const handleSaveEdit = async (values: KnowledgeEditorValues) => {
    if (!editTarget || !values.title || !values.content) return;
    setIsSaving(true);
    setEditError("");
    try {
      await updateDoc(doc(db, "trainingMaterials", editTarget.id), {
        title: values.title,
        content: values.content,
        entity_type: values.entity_type || "general",
        updatedAt: serverTimestamp(),
        embedding_status: "indexing",
      });

      fetch("/api/admin/embeddings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docPath: `trainingMaterials/${editTarget.id}` }),
      }).catch(console.error);

      setIsEditSuccess(true);
      setTimeout(() => {
        setEditTarget(null);
        setIsEditSuccess(false);
      }, 1500);
    } catch (err: any) {
      setEditError(err?.message ?? "Güncelleme başarısız.");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteDoc(doc(db, "trainingMaterials", deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.message ?? "Silme başarısız.");
    } finally {
      setIsDeleting(false);
    }
  };

  /* ── Reindex All ── */
  const [isReindexing, setIsReindexing] = useState(false);
  const handleReindexAll = async () => {
    if (!window.confirm("Tüm bilgi havuzu kayıtları yapay zeka araması için yeniden indekslenecektir. Bu işlem birkaç dakika sürebilir. Onaylıyor musunuz?")) return;
    setIsReindexing(true);
    try {
      let successCount = 0;
      for (const m of materials) {
        await updateDoc(doc(db, "trainingMaterials", m.id), { embedding_status: "indexing" });
        await fetch("/api/admin/embeddings/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docPath: `trainingMaterials/${m.id}` }),
        });
        successCount++;
      }
      alert(`${successCount} kayıt başarıyla indekslendi.`);
    } catch (err: any) {
      console.error(err);
      alert("İndeksleme sırasında bir hata oluştu.");
    } finally {
      setIsReindexing(false);
    }
  };

  /* ── Retry Indexing for Single Record ── */
  const handleRetryIndex = async (m: TrainingMaterial) => {
    try {
      await updateDoc(doc(db, "trainingMaterials", m.id), {
        embedding_status: "indexing",
        last_error: null
      });
      await fetch("/api/admin/embeddings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docPath: `trainingMaterials/${m.id}` }),
      });
    } catch (err: any) {
      console.error(err);
      alert("Yeniden indeksleme başlatılamadı.");
    }
  };

  const getStatusStyle = (status: string | undefined) => {
    if (status === "indexing" || status === "pending") return { background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" };
    if (status === "failed") return { background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" };
    return { background: "rgba(16, 185, 129, 0.1)", color: "#10b981" };
  };

  const filtered = useMemo(() =>
    materials.filter(m =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
    ), [materials, searchQuery]);

  /* ── Shared styles ── */
  const iconBtn = (_danger = false): React.CSSProperties => ({
    background: "none", border: "none",
    color: UI_COLORS.textMuted, cursor: "pointer",
    padding: 8, borderRadius: 8, transition: "all 0.2s",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
          {t("training.title")}
        </h1>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("training.subtitle")}
        </p>
      </div>

      {/* Add card */}
      <div
        onClick={() => setIsAddOpen(true)}
        style={{
          background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`,
          borderRadius: 20, padding: "24px 32px", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", transition: UI_COMMON_STYLES.transition,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)", marginBottom: 40,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = UI_COLORS.brand; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = UI_COLORS.border; e.currentTarget.style.transform = "translateY(0)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, background: UI_COMMON_STYLES.brandGradient,
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
            boxShadow: "0 8px 16px rgba(99, 102, 241, 0.2)",
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
        <Button onClick={e => { e.stopPropagation(); setIsAddOpen(true); }} style={{ padding: "12px 24px", borderRadius: 12, fontWeight: 700 }}>
          {t("common.actions.add")}
        </Button>
      </div>

      {/* Library */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.5px" }}>
            {t("training.library")}
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
            <Button 
              variant="secondary" 
              onClick={handleReindexAll} 
              disabled={isReindexing || materials.length === 0}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {isReindexing ? "İndeksleniyor..." : "AI Bilgi Havuzunu Yeniden İndeksle"}
            </Button>
            <div style={{ position: "relative", width: 300, maxWidth: "100%" }}>
              <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: UI_COLORS.textMuted }} />
              <input
                type="text" placeholder={t("common.search")} value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%", padding: "12px 16px 12px 44px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)", border: `1px solid ${UI_COLORS.border}`,
                  fontSize: 14, color: UI_COLORS.textPrimary, outline: "none", transition: "all 0.2s",
                }}
                onFocus={e => e.currentTarget.style.borderColor = UI_COLORS.brand}
                onBlur={e => e.currentTarget.style.borderColor = UI_COLORS.border}
              />
            </div>
          </div>
        </div>

        <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
          {loading ? (
            <div style={{ padding: 80, textAlign: "center", color: UI_COLORS.textMuted }}>
              <Loader2 size={40} style={{ margin: "0 auto 16px", color: UI_COLORS.brand, animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: 15, fontWeight: 500 }}>{t("common.loading")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "80px 40px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: UI_COLORS.textMuted }}>
                <FileText size={32} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
                {searchQuery ? t("training.empty.noResults") : t("training.empty.title")}
              </h3>
              <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, maxWidth: 300, margin: "0 auto 24px" }}>
                {searchQuery ? "" : t("training.empty.description")}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddOpen(true)} style={{ borderRadius: 10 }}>
                  {t("training.addInfo")}
                </Button>
              )}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "18px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("training.materialName")}
                  </th>
                  <th style={{ padding: "18px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Durum
                  </th>
                  <th style={{ padding: "18px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.01)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "18px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(99,102,241,0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileText size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>{m.title}</p>
                          <p style={{ fontSize: 13, color: UI_COLORS.textMuted, marginTop: 2, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.content}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "18px 24px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, ...getStatusStyle(m.embedding_status) }}>
                        {m.embedding_status === "indexing" || m.embedding_status === "pending" ? (
                          <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> İndeksleniyor</>
                        ) : m.embedding_status === "failed" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={m.last_error || "Bilinmeyen Hata"}>
                            <AlertTriangle size={14} /> Başarısız
                            <button onClick={() => handleRetryIndex(m)} style={{ marginLeft: 6, background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }} title="Tekrar Dene">
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        ) : (
                          <><CheckCircle2 size={14} /> İndekslendi</>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "18px 24px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {/* Edit button */}
                        <button
                          onClick={() => openEdit(m)}
                          title="Düzenle"
                          style={iconBtn()}
                          onMouseEnter={e => { e.currentTarget.style.color = UI_COLORS.textPrimary; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = UI_COLORS.textMuted; e.currentTarget.style.background = "none"; }}
                        >
                          <Edit2 size={18} />
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => { setDeleteTarget(m); setDeleteError(""); }}
                          title="Sil"
                          style={iconBtn(true)}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = UI_COLORS.textMuted; (e.currentTarget as HTMLElement).style.background = "none"; }}
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

      <KnowledgeEditor
        isOpen={isAddOpen}
        mode="knowledge"
        title={t("training.addNoteTitle")}
        initialValues={EMPTY_KNOWLEDGE_VALUES}
        saving={isSubmitting}
        success={isAddSuccess}
        successTitle={t("training.noteSaved")}
        successSubtitle={t("training.aiInstruction")}
        presentation="auto"
        onClose={() => !isSubmitting && setIsAddOpen(false)}
        onSave={handleAdd}
      />

      <KnowledgeEditor
        isOpen={!!editTarget}
        mode="knowledge"
        title="Bilgiyi Düzenle"
        initialValues={editInitial}
        saving={isSaving}
        success={isEditSuccess}
        successTitle="Bilgi güncellendi"
        successSubtitle="Asistan bu güncellemeyi hemen kullanmaya başlayacak."
        error={editError}
        presentation="auto"
        onClose={() => !isSaving && setEditTarget(null)}
        onSave={handleSaveEdit}
      />

      {/* ═══════ DELETE CONFIRMATION MODAL ═══════ */}
      <Modal isOpen={!!deleteTarget} onClose={() => !isDeleting && setDeleteTarget(null)} title="" width={480}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "8px 0 4px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={30} color="#ef4444" />
          </div>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 10 }}>
              Bilgiyi silmek istiyor musunuz?
            </h3>
            <p style={{ fontSize: 14, color: UI_COLORS.textSecondary, lineHeight: 1.6, maxWidth: 340 }}>
              <strong style={{ color: UI_COLORS.textPrimary }}>"{deleteTarget?.title}"</strong> silindiğinde asistan bu bilgiyi artık cevaplarında kullanamaz. Bu işlem geri alınamaz.
            </p>
          </div>
          {deleteError && <p style={{ fontSize: 13, color: "#ef4444" }}>{deleteError}</p>}
          <div style={{ display: "flex", gap: 12, width: "100%", justifyContent: "center", paddingTop: 8, borderTop: `1px solid ${UI_COLORS.border}` }}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting} style={{ minWidth: 100 }}>
              Vazgeç
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              style={{ minWidth: 120, background: "#ef4444", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
            >
              {isDeleting ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Siliniyor…
                </span>
              ) : "Sil"}
            </Button>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

