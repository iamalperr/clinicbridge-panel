import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AgencyLocation, KnowledgeDocument, KnowledgeOwnerType } from '@/lib/types/agency';

const LOCATION_COLLECTION = 'agency_locations';
const KNOWLEDGE_COLLECTION = 'knowledge_documents';

/** Ensures valid ownership constraints */
function validateOwnership(tenantId: string, ownerType: KnowledgeOwnerType, ownerId: string | null) {
  if (ownerType === 'agency') {
    if (!ownerId) throw new Error('ownerId is required for agency ownerType');
    if (ownerId !== tenantId) throw new Error('agency ownerId must match tenantId');
  } else if (ownerType === 'clinic') {
    if (!ownerId) throw new Error('ownerId is required for clinic ownerType');
  }
}

// ─── Locations ──────────────────────────────────────────────────────────────

export async function getAgencyLocations(agencyId: string): Promise<AgencyLocation[]> {
  const q = query(
    collection(db, LOCATION_COLLECTION),
    where('agencyId', '==', agencyId),
    orderBy('displayOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgencyLocation));
}

export async function upsertAgencyLocation(location: Partial<AgencyLocation> & { agencyId: string, slug: string }): Promise<string> {
  const docId = `${location.agencyId}_${location.slug}`;
  const docRef = doc(db, LOCATION_COLLECTION, docId);
  const payload = {
    ...location,
    updatedAt: serverTimestamp(),
  };
  
  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    (payload as any).createdAt = serverTimestamp();
  }

  await setDoc(docRef, payload, { merge: true });
  return docId;
}

// ─── Knowledge Documents ────────────────────────────────────────────────────

export async function getKnowledgeDocuments(tenantId: string, ownerType: KnowledgeOwnerType, ownerId: string | null): Promise<KnowledgeDocument[]> {
  validateOwnership(tenantId, ownerType, ownerId);

  let q = query(
    collection(db, KNOWLEDGE_COLLECTION),
    where('tenantId', '==', tenantId),
    where('ownerType', '==', ownerType)
  );
  
  if (ownerId) {
    q = query(q, where('ownerId', '==', ownerId));
  } else {
    q = query(q, where('ownerId', '==', null));
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeDocument));
}

export async function upsertKnowledgeDocument(document: Partial<KnowledgeDocument> & { tenantId: string, ownerType: KnowledgeOwnerType }): Promise<string> {
  validateOwnership(document.tenantId, document.ownerType, document.ownerId || null);
  
  if (document.knowledgeType === 'destination' && !document.locationId) {
    throw new Error('locationId is required for destination knowledgeType');
  }

  const docId = document.id || doc(collection(db, KNOWLEDGE_COLLECTION)).id;
  const docRef = doc(db, KNOWLEDGE_COLLECTION, docId);
  
  const payload = {
    ...document,
    updatedAt: serverTimestamp(),
  };

  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    (payload as any).createdAt = serverTimestamp();
  }

  await setDoc(docRef, payload, { merge: true });
  return docId;
}

export async function deleteKnowledgeDocument(docId: string, tenantId: string): Promise<void> {
  const docRef = doc(db, KNOWLEDGE_COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data()?.tenantId === tenantId) {
    await deleteDoc(docRef);
  } else {
    throw new Error('Unauthorized or document not found');
  }
}
