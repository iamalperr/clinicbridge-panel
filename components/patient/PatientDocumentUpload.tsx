"use client";

import { useState, useEffect } from "react";
import { Upload, X, File, Image as ImageIcon, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface PatientDocumentUploadProps {
  token: string;
  isTr: boolean;
}

interface DocumentInfo {
  id: string;
  category: string;
  sanitizedFileName: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

const CATEGORIES = [
  { id: "dental_xray", tr: "Diş Röntgeni", en: "Dental X-Ray" },
  { id: "medical_image", tr: "Tıbbi Görüntü", en: "Medical Image" },
  { id: "treatment_photo", tr: "Tedavi Fotoğrafı", en: "Treatment Photo" },
  { id: "medical_report", tr: "Sağlık Raporu", en: "Medical Report" },
  { id: "lab_result", tr: "Laboratuvar Sonucu", en: "Lab Result" },
  { id: "other_medical_document", tr: "Diğer Sağlık Belgesi", en: "Other Medical Document" },
];

export default function PatientDocumentUpload({ token, isTr }: PatientDocumentUploadProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  // File selection state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("treatment_photo");

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/public/patient-portal/${token}/documents`);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const isValidType = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type);
      
      if (!isValidType) {
        setError(isTr ? "Sadece JPEG, PNG, WEBP veya PDF yükleyebilirsiniz." : "Only JPEG, PNG, WEBP or PDF allowed.");
        return;
      }
      
      const maxSize = file.type === "application/pdf" ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(isTr ? `Dosya boyutu çok büyük (Max: ${maxSize / (1024*1024)}MB).` : `File too large (Max: ${maxSize / (1024*1024)}MB).`);
        return;
      }

      setError(null);
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !consentChecked) return;
    
    setUploading(true);
    setError(null);

    try {
      // 1. Init
      const initRes = await fetch(`/api/public/patient-portal/${token}/documents/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          originalFileName: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size
        })
      });

      if (!initRes.ok) {
        const errorData = await initRes.json();
        throw new Error(errorData.error || "Init failed");
      }

      const { uploadUrl, documentId } = await initRes.json();

      // 2. Upload to Storage
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile
      });

      if (!uploadRes.ok) {
        throw new Error("Upload to storage failed");
      }

      // 3. Complete
      const completeRes = await fetch(`/api/public/patient-portal/${token}/documents/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId })
      });

      if (!completeRes.ok) {
        throw new Error("Completion failed");
      }

      // Reset & Refresh
      setSelectedFile(null);
      setConsentChecked(false);
      await fetchDocuments();

    } catch (err: any) {
      console.error(err);
      setError(err.message || (isTr ? "Yükleme başarısız oldu." : "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm(isTr ? "Bu belgeyi silmek istediğinize emin misiniz?" : "Are you sure you want to delete this document?")) return;
    
    try {
      const res = await fetch(`/api/public/patient-portal/${token}/documents/${docId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <File className="w-5 h-5 text-teal-600" />
            {isTr ? "Sağlık Belgelerim" : "My Health Documents"}
          </h3>
          <span className="text-xs font-medium bg-teal-100 text-teal-700 px-2 py-1 rounded-full">
            {documents.length} / 10 {isTr ? "belge" : "documents"}
          </span>
        </div>

        <div className="p-6">
          {documents.length > 0 && (
            <div className="mb-8 space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex-shrink-0 w-10 h-10 rounded bg-white border border-gray-200 flex items-center justify-center">
                      {doc.sanitizedFileName.endsWith('.pdf') ? <File className="w-5 h-5 text-red-500" /> : <ImageIcon className="w-5 h-5 text-blue-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate" title={doc.sanitizedFileName}>{doc.sanitizedFileName}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="truncate">{CATEGORIES.find(c => c.id === doc.category)?.[isTr ? 'tr' : 'en']}</span>
                        <span>•</span>
                        <span>{formatSize(doc.sizeBytes)}</span>
                        <span>•</span>
                        <span className={doc.status === 'available' ? 'text-green-600' : 'text-amber-600'}>
                          {doc.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title={isTr ? "Sil" : "Delete"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {documents.length < 10 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isTr ? "Belge Türü" : "Document Type"}
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c[isTr ? 'tr' : 'en']}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isTr ? "Dosya Seç" : "Select File"}
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <div className="w-full h-10 px-3 rounded-lg border border-gray-300 flex items-center justify-between text-sm text-gray-500 bg-white hover:bg-gray-50">
                      <span className="truncate pr-4">{selectedFile ? selectedFile.name : (isTr ? "Dosya seçilmedi" : "No file chosen")}</span>
                      <Upload className="w-4 h-4 flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {selectedFile && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 space-y-4 mt-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-teal-600 focus:ring-teal-600"
                    />
                    <span className="text-sm text-gray-700">
                      {isTr 
                        ? "Yükleyeceğim belgelerin sağlık verilerimi içerdiğini biliyor ve bu verilerin seçtiğim kliniklerle tedavim amacıyla paylaşılmasını onaylıyorum." 
                        : "I understand that the documents I am uploading contain my health data, and I consent to sharing this data with the selected clinics for my treatment."}
                    </span>
                  </label>
                  
                  <button
                    onClick={handleUpload}
                    disabled={!consentChecked || uploading}
                    className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isTr ? "Yükleniyor..." : "Uploading..."}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {isTr ? "Belgeyi Yükle" : "Upload Document"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
             <div className="text-center py-6 text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
               {isTr ? "Maksimum belge sayısına ulaştınız." : "You have reached the maximum document limit."}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
