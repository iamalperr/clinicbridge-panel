import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "No DB" }, { status: 500 });

    const clinicsSnap = await adminDb.collection("clinics").get();
    
    let totalUpdated = 0;
    let totalChecked = 0;

    for (const clinicDoc of clinicsSnap.docs) {
      const clinicId = clinicDoc.id;
      
      const appointmentsSnap = await adminDb
        .collection("clinics")
        .doc(clinicId)
        .collection("appointments")
        .where("source", "==", "ai_chatbot")
        .get();

      for (const apptDoc of appointmentsSnap.docs) {
        totalChecked++;
        const data = apptDoc.data();
        const convId = data.conversationId;
        if (!convId) continue;

        const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId);
        const logSnap = await logRef.get();

        if (logSnap.exists) {
          const logData = logSnap.data();
          if (logData?.status !== "appointment") {
             await logRef.update({
               status: "appointment",
               appointmentId: apptDoc.id,
               convertedToAppointment: true
             });
             totalUpdated++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalAppointmentsChecked: totalChecked,
      conversationLogsUpdated: totalUpdated
    });

  } catch (error: any) {
    console.error("Sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
