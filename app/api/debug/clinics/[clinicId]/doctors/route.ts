import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const resolvedParams = await params;
    const clinicId = resolvedParams.clinicId;
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "no db" }, { status: 500 });
    
    // We assume the debug endpoint allows querying both regular clinics and agency clinics
    // First try normal clinics
    let docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").where("is_active", "==", true).get();
    
    // If empty, try agencies
    if (docsSnap.empty) {
      const agenciesSnap = await adminDb.collection("agencies").get();
      for (const agency of agenciesSnap.docs) {
        let aClinicSnap = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(clinicId).get();
        if (!aClinicSnap.exists) {
          const aClinicsQuery = await adminDb.collection("agencies").doc(agency.id).collection("clinics").where("clinicSlug", "==", clinicId).limit(1).get();
          if (!aClinicsQuery.empty) {
            aClinicSnap = aClinicsQuery.docs[0];
          }
        }
        
        if (aClinicSnap.exists) {
          docsSnap = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(aClinicSnap.id).collection("doctors").where("is_active", "==", true).get();
          break;
        }
      }
    }
    
    if (docsSnap.empty) {
      return NextResponse.json({ totalDoctors: 0, doctors: [] });
    }
    
    let doctors = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
    doctors.sort((a, b) => (a.display_order || a.order || 0) - (b.display_order || b.order || 0));
    
    const payload = doctors.map(d => ({
      displayOrder: d.display_order || d.order || 0,
      professionalTitle: d.title || "",
      fullName: d.doctorName || d.full_name || d.fullName || "",
      specialty: d.specialty || "",
      isActive: d.is_active
    }));
    
    return NextResponse.json({
      intent: "full_doctor_list",
      clinicId: clinicId,
      totalDoctors: payload.length,
      doctors: payload
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
