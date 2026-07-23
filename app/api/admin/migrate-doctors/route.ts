import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "123") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  if (!adminDb) return NextResponse.json({ error: "no db" }, { status: 500 });

  const agencyId = "N59KqT1mGfL05h8xKIfi";
  const clinicSlug = "ByTnY4VEmBTJxogqCQ7q";

  // Find the actual clinic doc ID using the slug
  const aClinicsQuery = await adminDb.collection("agencies").doc(agencyId).collection("clinics").where("clinicSlug", "==", clinicSlug).limit(1).get();
  const actualClinicId = aClinicsQuery.empty ? clinicSlug : aClinicsQuery.docs[0].id;

  if (url.searchParams.get("list") === "1") {
    const doctorsRef = adminDb.collection("agencies").doc(agencyId).collection("clinics").doc(actualClinicId).collection("doctors");
    const existing = await doctorsRef.get();
    const docs = existing.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ totalDoctors: docs.length, doctors: docs });
  }

  const doctors = [
    { display_order: 1, title: "Dt.", doctorName: "Ahmet Dörtköşe" },
    { display_order: 2, title: "Dt.", doctorName: "Candan Yavuz" },
    { display_order: 3, title: "Dt.", doctorName: "Neriman Gamze Kırmızıtaş" },
    { display_order: 4, title: "Uzm. Dt.", doctorName: "Emre Bakaç" },
    { display_order: 5, title: "Uzm. Dt.", doctorName: "Sevda Tok" },
    { display_order: 6, title: "Dr.", doctorName: "Deniz Çağlar" },
    { display_order: 7, title: "Dr.", doctorName: "Ezgi Kaya" },
    { display_order: 8, title: "Dr.", doctorName: "Ezgi Yazar" },
    { display_order: 9, title: "Uzm. Dt.", doctorName: "İrem Küçük" }
  ];

  try {
    const doctorsRef = adminDb.collection("agencies").doc(agencyId).collection("clinics").doc(actualClinicId).collection("doctors");
    
    // First, clear existing doctors to avoid duplicates
    const existing = await doctorsRef.get();
    for (const doc of existing.docs) {
      await doc.ref.delete();
    }

    // Insert new doctors
    for (const doc of doctors) {
      await doctorsRef.add({
        ...doc,
        is_active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return NextResponse.json({ success: true, migrated: doctors.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
