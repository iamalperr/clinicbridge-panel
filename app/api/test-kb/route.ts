import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: Request) {
  const adminDb = getAdminDb();
  if (!adminDb) return NextResponse.json({ error: "no db" });
  
  const clinicId = "ByTnY4VEmBTJxogqCQ7q";
  const tmSnap = await adminDb.collection("agencies").doc("N59KqT1mGfL05h8xKIfi").collection("clinics").doc(clinicId).collection("knowledgeBase").get();
  
  const allDocs = tmSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ total: allDocs.length, docs: allDocs.map(d => ({ title: d.title, content: d.content, category: d.category, type: d.type })) });
}
