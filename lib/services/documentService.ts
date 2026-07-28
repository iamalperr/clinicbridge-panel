import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { LeadDocument, DocumentCategory, DocumentContextType, DocumentStatus, DocumentScanStatus, DocumentVisibility } from "@/lib/types/agency";
import crypto from "crypto";

// File constraints
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_DOCUMENTS_PER_LEAD = 10;
const MAX_TOTAL_STORAGE_BYTES = 75 * 1024 * 1024; // 75 MB

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export interface DocumentInitParams {
  category: DocumentCategory;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByType: "patient" | "agency_user";
  uploadedByUserId?: string;
  patientAccessTokenId?: string;
}

export async function initializeDocumentUpload(
  agencyId: string,
  leadId: string,
  params: DocumentInitParams
): Promise<{ uploadUrl: string; documentId: string }> {
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) throw new Error("Firebase Admin not initialized");

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(params.mimeType)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  // Validate file size
  const isPdf = params.mimeType === "application/pdf";
  const maxSize = isPdf ? MAX_PDF_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  if (params.sizeBytes > maxSize) {
    throw new Error("FILE_TOO_LARGE");
  }

  const docsRef = db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents");
  
  // Check current limits
  const existingDocsSnap = await docsRef.where("status", "in", ["pending_upload", "uploaded", "processing", "available"]).get();
  if (existingDocsSnap.size >= MAX_DOCUMENTS_PER_LEAD) {
    throw new Error("FILE_COUNT_LIMIT_EXCEEDED");
  }

  let totalSize = 0;
  existingDocsSnap.forEach(doc => {
    totalSize += (doc.data().sizeBytes || 0);
  });
  if (totalSize + params.sizeBytes > MAX_TOTAL_STORAGE_BYTES) {
    throw new Error("TOTAL_STORAGE_LIMIT_EXCEEDED");
  }

  // Sanitize file name
  const sanitizedFileName = params.originalFileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").substring(0, 150);
  const extension = params.originalFileName.split('.').pop()?.substring(0, 10) || "bin";
  
  const newDocRef = docsRef.doc();
  const documentId = newDocRef.id;
  const storageKey = `agency-documents/${agencyId}/${leadId}/${documentId}/${crypto.randomUUID()}.${extension}`;

  const docData: Omit<LeadDocument, "id"> = {
    agencyId,
    leadId,
    contextType: "agency_patient_request",
    uploadedByType: params.uploadedByType,
    uploadedByUserId: params.uploadedByUserId,
    patientAccessTokenId: params.patientAccessTokenId,
    category: params.category,
    originalFileName: params.originalFileName.substring(0, 150),
    sanitizedFileName,
    storageProvider: "firebase_storage",
    storageBucket: storage.bucket().name,
    storageKey,
    mimeType: params.mimeType,
    fileExtension: extension,
    sizeBytes: params.sizeBytes,
    status: "pending_upload",
    scanStatus: "pending",
    visibility: "patient_and_agency",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await newDocRef.set(docData);

  // Generate Signed Upload URL (valid for 15 mins)
  const bucket = storage.bucket();
  const file = bucket.file(storageKey);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType: params.mimeType,
  });

  return { uploadUrl, documentId };
}

export async function completeDocumentUpload(agencyId: string, leadId: string, documentId: string) {
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) throw new Error("Firebase Admin not initialized");

  const docRef = db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents").doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("DOCUMENT_NOT_FOUND");

  const doc = docSnap.data() as LeadDocument;
  
  if (doc.status !== "pending_upload") {
    return; // Already completed or failed
  }

  const bucket = storage.bucket();
  const file = bucket.file(doc.storageKey);
  const [exists] = await file.exists();
  
  if (!exists) {
    await docRef.update({ status: "failed", updatedAt: new Date() });
    throw new Error("STORAGE_OBJECT_NOT_FOUND");
  }

  const [metadata] = await file.getMetadata();
  const actualSize = parseInt(metadata.size, 10);
  
  await docRef.update({
    status: "available",
    scanStatus: "clean", // Mocked successful scan
    sizeBytes: actualSize,
    detectedMimeType: metadata.contentType,
    uploadedAt: new Date(),
    scanCompletedAt: new Date(),
    updatedAt: new Date()
  });
}

export async function getSignedDownloadUrl(agencyId: string, leadId: string, documentId: string) {
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) throw new Error("Firebase Admin not initialized");

  const docSnap = await db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents").doc(documentId).get();
  if (!docSnap.exists) throw new Error("DOCUMENT_NOT_FOUND");

  const doc = docSnap.data() as LeadDocument;
  if (doc.status !== "available" || doc.deletedAt) {
    throw new Error("DOCUMENT_NOT_AVAILABLE");
  }

  const bucket = storage.bucket();
  const file = bucket.file(doc.storageKey);
  
  const [downloadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 15 * 60 * 1000,
    responseDisposition: `attachment; filename="${encodeURIComponent(doc.sanitizedFileName)}"`,
  });

  return downloadUrl;
}

export async function softDeleteDocument(agencyId: string, leadId: string, documentId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin not initialized");

  const docRef = db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents").doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new Error("DOCUMENT_NOT_FOUND");

  await docRef.update({
    status: "deleted",
    deletedAt: new Date(),
    updatedAt: new Date(),
    cleanupStatus: "pending"
  });
}

export async function getPatientDocuments(agencyId: string, leadId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin not initialized");

  const docsSnap = await db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents")
    .where("visibility", "in", ["patient_and_agency"])
    .where("status", "in", ["pending_upload", "processing", "available", "rejected", "failed"])
    .orderBy("createdAt", "desc")
    .get();

  return docsSnap.docs.map(d => d.data() as LeadDocument);
}

export async function getAgencyLeadDocuments(agencyId: string, leadId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin not initialized");

  const docsSnap = await db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).collection("documents")
    .where("status", "in", ["pending_upload", "processing", "available", "rejected", "failed"])
    .orderBy("createdAt", "desc")
    .get();

  return docsSnap.docs.map(d => d.data() as LeadDocument);
}

