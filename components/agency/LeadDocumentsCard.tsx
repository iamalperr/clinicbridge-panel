"use client";

import { useState, useEffect } from "react";
import { File, FileText, Download, Loader2, AlertCircle } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { useI18n } from "@/lib/i18n-context";

interface LeadDocumentsCardProps {
  agencyId: string;
  leadId: string;
}

export default function LeadDocumentsCard({ agencyId, leadId }: LeadDocumentsCardProps) {
  const { language } = useI18n();
  const isTr = language === "tr";
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await fetch(`/api/agency/${agencyId}/leads/${leadId}/documents`);
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        }
      } catch (err) {
        console.error("Failed to fetch documents", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDocuments();
  }, [agencyId, leadId]);

  const handleDownload = async (docId: string, fileName: string) => {
    setDownloadingId(docId);
    try {
      const res = await fetch(`/api/agency/${agencyId}/leads/${leadId}/documents/${docId}/download`);
      if (!res.ok) throw new Error("Download failed");
      
      const { downloadUrl } = await res.json();
      
      // Trigger download via anchor
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert(isTr ? "İndirme başarısız oldu." : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <div style={{
        background: UI_COLORS.bgCard, borderRadius: 14,
        border: `1px solid ${UI_COLORS.border}`, padding: "24px",
        display: "flex", justifyContent: "center"
      }}>
        <Loader2 className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div style={{
      background: UI_COLORS.bgCard, borderRadius: 14,
      border: `1px solid ${UI_COLORS.border}`, padding: "20px 24px",
    }}>
      <h3 style={{
        fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary,
        display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        paddingBottom: 12, borderBottom: `1px solid ${UI_COLORS.border}`,
      }}>
        <FileText size={18} color={UI_COLORS.textMuted} /> 
        {isTr ? "Hasta Belgeleri" : "Patient Documents"}
        <span style={{ fontSize: 12, fontWeight: 500, background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>
          {documents.length}
        </span>
      </h3>

      {documents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: UI_COLORS.textMuted }}>
          <File size={32} style={{ opacity: 0.3, margin: "0 auto 8px" }} />
          <p style={{ fontSize: 13, fontWeight: 500 }}>
            {isTr ? "Henüz belge yüklenmemiş." : "No documents uploaded yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map(doc => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8,
              background: "#f8fafc"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${UI_COLORS.border}` }}>
                  <File size={16} color={UI_COLORS.brand} />
                </div>
                <div style={{ overflow: "hidden" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {doc.sanitizedFileName}
                  </p>
                  <p style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2 }}>
                    {doc.category} • {formatSize(doc.sizeBytes)} • {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(doc.id, doc.sanitizedFileName)}
                disabled={downloadingId === doc.id || doc.status !== "available"}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  background: doc.status === "available" ? "#fff" : "#f1f5f9",
                  border: `1px solid ${UI_COLORS.border}`,
                  fontSize: 12, fontWeight: 600,
                  color: doc.status === "available" ? UI_COLORS.brand : UI_COLORS.textMuted,
                  cursor: doc.status === "available" ? "pointer" : "not-allowed",
                  opacity: downloadingId === doc.id ? 0.7 : 1
                }}
              >
                {downloadingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {isTr ? "İndir" : "Download"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
