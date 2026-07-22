import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendSms } from "@/lib/sms/sendSms";
import { sendPatientAppointmentStatusEmail } from "@/lib/appointment-notifications";

interface RouteParams {
  params: Promise<{ clinicId: string; appointmentId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { clinicId, appointmentId } = await params;
    const body = await req.json();
    const { newStatus } = body;

    if (!newStatus) {
      return NextResponse.json({ error: "Missing newStatus" }, { status: 400 });
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

    // 2. Fetch Clinic & Appointment
    const [clinicSnap, apptSnap] = await Promise.all([
      adminDb.collection("clinics").doc(clinicId).get(),
      adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).get()
    ]);

    if (!apptSnap.exists) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const apptData = apptSnap.data()!;
    const clinicData = clinicSnap.data() || {};
    const clinicName = clinicData.name || "Klinik";
    const oldStatus = apptData.status;

    if (oldStatus === newStatus) {
      return NextResponse.json({ success: true, message: "Status unchanged" });
    }

    const patientNotificationSettings = clinicData.patientNotificationSettings || {
      primaryChannel: "email",
      collectEmail: true,
      collectPhone: false
    };
    const primaryChannel = patientNotificationSettings.primaryChannel;

    let notificationResult = null;
    let notificationChannelUsed = "";
    
    // Check if we should trigger a notification
    const shouldNotify = newStatus === "confirmed" || newStatus === "approved" || newStatus === "cancelled" || newStatus === "rejected" || newStatus === "alternative_time_proposed";

    if (shouldNotify) {
      const treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason || "Genel Muayene";
      const date = apptData.preferredDate || apptData.requestedDate || apptData.proposedDate || "";
      const time = apptData.preferredTime || apptData.requestedTime || apptData.proposedTime || "";

      if (primaryChannel === "email" || primaryChannel === "email_and_sms" || primaryChannel === "email_and_whatsapp") {
        notificationChannelUsed = "email";
        if (apptData.patientEmail) {
          notificationResult = await sendPatientAppointmentStatusEmail({
            patientEmail: apptData.patientEmail,
            patientName: apptData.patientName || "Değerli Hastamız",
            clinicName,
            treatment,
            requestedDate: date,
            requestedTime: time,
            status: newStatus,
            appointmentId
          });
        } else {
          notificationResult = { success: false, reason: "no_email", error: "Hastanın e-posta adresi bulunmuyor." };
        }
      } 
      
      // Note: SMS and WhatsApp channels are currently passive as per requirements.
      // If primaryChannel is "sms" or "whatsapp", we do not attempt to send notifications through them.
      if (!notificationChannelUsed && (primaryChannel === "sms" || primaryChannel === "email_and_sms")) {
        // notificationResult = { success: false, skipped: true, reason: "passive_channel", error: "SMS kanalı geçici olarak devre dışıdır." };
        // We will just not set notificationChannelUsed so it behaves as no notification sent, 
        // or we can force email fallback if there's an email.
        
        // Let's force email fallback if SMS is passive but patient has email
        if (apptData.patientEmail) {
          notificationChannelUsed = "email";
          notificationResult = await sendPatientAppointmentStatusEmail({
            patientEmail: apptData.patientEmail,
            patientName: apptData.patientName || "Değerli Hastamız",
            clinicName,
            treatment,
            requestedDate: date,
            requestedTime: time,
            status: newStatus,
            appointmentId
          });
        } else {
          // If they wanted SMS but it's passive, we just skip it quietly.
          notificationChannelUsed = "email"; 
          notificationResult = { success: false, reason: "no_email", error: "Hastanın e-posta adresi bulunmuyor." };
        }
      }
    }

    // 3. Update Appointment Document
    const now = new Date().toISOString();
    const updateData: any = {
      status: newStatus,
      updatedAt: now,
      updatedBy: decodedToken.uid
    };

    if (notificationResult) {
      updateData.patientNotificationStatus = notificationResult.success ? "sent" : ((notificationResult as any).reason === "no_email" || (notificationResult as any).reason === "no_phone" ? "missing_contact" : "failed");
      updateData.notificationSentAt = now;
      updateData.notificationChannel = notificationChannelUsed;
      if (notificationResult.error) updateData.notificationError = notificationResult.error;
    }

    await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update(updateData);

    // 4. Create Notification Log if applicable (for SMS to preserve legacy log, and maybe for Email)
    if (notificationResult && notificationChannelUsed === "sms" && (notificationResult as any).smsType) {
      await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).collection("smsLogs").add({
        type: (notificationResult as any).smsType,
        to: apptData.patientPhone || "",
        message: (notificationResult as any).smsMessage,
        status: notificationResult.success ? "success" : "failed",
        provider: process.env.SMS_PROVIDER || "none",
        error: notificationResult.error || null,
        reason: (notificationResult as any).reason || null,
        createdAt: now,
        triggeredBy: decodedToken.uid,
        oldStatus,
        newStatus
      });
    }

    // 5. Update Conversation Log
    if (apptData.conversationId) {
      const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(apptData.conversationId);
      await logRef.update({
        appointmentStatus: newStatus,
        updatedAt: now
      }).catch(e => console.warn("Failed to update conversation log:", e));
    }

    return NextResponse.json({ 
      success: true, 
      notification: {
        channel: notificationChannelUsed,
        result: notificationResult
      } 
    });
    
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function updateStatusOnly(adminDb: any, clinicId: string, appointmentId: string, newStatus: string, uid: string, convId?: string) {
  const now = new Date().toISOString();
  await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update({
    status: newStatus,
    updatedAt: now,
    updatedBy: uid
  });

  if (convId) {
    await adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId).update({
      appointmentStatus: newStatus,
      updatedAt: now
    }).catch((e: any) => console.warn("Failed to update conversation log:", e));
  }
}
