import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendClinicAppointmentEmail, sendPatientAppointmentEmail } from "@/lib/appointment-notifications";
import { Appointment } from "@/lib/types";

interface RouteParams {
  params: Promise<{ clinicId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { clinicId } = await params;
    const body = await req.json();

    const { patientName, patientPhone, patientEmail, requestedService, requestedDate, requestedTime, notes } = body;

    // Validate required fields
    if (!patientName || !patientPhone || !requestedService || !requestedDate || !requestedTime) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify Authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection("users").where("uid", "==", decodedToken.uid).limit(1).get();
    
    if (userSnap.empty) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }
    
    const userData = userSnap.docs[0].data();
    if (userData.role !== "admin" && userData.clinicId !== clinicId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Fetch Clinic Data
    const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }
    const clinicData = clinicSnap.data()!;
    const clinicName = clinicData.name || "Klinik";

    // Prepare clinic emails
    let clinicEmailsToUse: string[] = [];
    if (clinicData.email) clinicEmailsToUse.push(clinicData.email);
    if (clinicData.notificationEmails && Array.isArray(clinicData.notificationEmails)) {
      clinicEmailsToUse = clinicEmailsToUse.concat(clinicData.notificationEmails);
    }
    clinicEmailsToUse = Array.from(new Set(clinicEmailsToUse)); // remove duplicates

    // 3. Create Appointment Document
    const now = new Date().toISOString();
    const appointmentRef = adminDb.collection("clinics").doc(clinicId).collection("appointments").doc();
    const appointmentId = appointmentRef.id;

    const newAppointment: Partial<Appointment> = {
      id: appointmentId,
      clinicId,
      patientName,
      patientPhone,
      patientPhoneRaw: patientPhone,
      patientEmail: patientEmail || "",
      requestedService,
      requestedDate,
      requestedTime,
      preferredDate: requestedDate,
      preferredTime: requestedTime,
      notes: notes || "Manuel eklendi.",
      source: "manual",
      status: "PENDING_REVIEW",
      createdAt: now,
      updatedAt: now,
      createdBy: decodedToken.uid
    };

    await appointmentRef.set(newAppointment);

    // 4. Send Notifications
    let clinicEmailSent = false;
    let patientEmailSent = false;

    // Clinic Email
    if (clinicEmailsToUse.length > 0) {
      try {
        const result = await sendClinicAppointmentEmail({
          clinicName,
          clinicEmails: clinicEmailsToUse,
          patientName,
          patientPhone,
          patientEmail,
          requestedService,
          requestedDate,
          requestedTime,
          appointmentId,
          notes
        });
        clinicEmailSent = result.success;
      } catch (e: any) {
        console.error("[manual-appointment] Clinic email error:", e.message);
      }
    }

    // Patient Email
    if (patientEmail) {
      try {
        const result = await sendPatientAppointmentEmail({
          clinicName,
          clinicEmails: [patientEmail], // Used as recipient internally
          patientName,
          patientPhone,
          patientEmail,
          requestedService,
          requestedDate,
          requestedTime,
          appointmentId
        });
        patientEmailSent = result.success;
      } catch (e: any) {
        console.error("[manual-appointment] Patient email error:", e.message);
      }
    }

    // Update appointment with notification status
    await appointmentRef.update({
      clinicNotificationStatus: clinicEmailSent ? "SENT" : "FAILED",
      patientNotificationStatusResult: patientEmailSent ? "SENT" : "FAILED",
    });

    return NextResponse.json({ 
      success: true, 
      appointmentId,
      notifications: {
        clinicEmail: clinicEmailSent,
        patientEmail: patientEmailSent
      }
    });

  } catch (error: any) {
    console.error("Error creating manual appointment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
