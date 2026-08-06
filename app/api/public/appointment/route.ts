import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, query, where, getDocs,
  serverTimestamp, doc, getDoc,
} from "firebase/firestore";
import {
  sendClinicAppointmentEmail,
} from "@/lib/appointment-notifications";
import {
  resolveClinicTimeZone,
  validateAppointmentDateTime,
} from "@/lib/appointment/appointmentDateTimePolicy";
import { ClinicWorkingHoursResolver } from "@/lib/skills/ClinicWorkingHoursResolver";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function getClientDb() {
  const cfg = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) return null;
  const app = getApps().length > 0 ? getApp() : initializeApp(cfg, "appt-api");
  return getFirestore(app);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      clinicId,
      patientName,
      patientPhone,
      requestedService,
      requestedDate,
      requestedTime,
      originalText,
      conversationId,
      notes,
    } = body;

    /* ── Validation ─────────────────────────────────────────────────────── */
    if (!clinicId)       return NextResponse.json({ error: "clinicId required" },       { status: 400, headers: CORS });
    if (!patientName?.trim()) return NextResponse.json({ error: "patientName required" }, { status: 400, headers: CORS });
    if (!patientPhone?.trim()) return NextResponse.json({ error: "patientPhone required" },{ status: 400, headers: CORS });
    if (!requestedDate?.trim()) return NextResponse.json({ error: "requestedDate required" },{ status: 400, headers: CORS });

    /* ── DB setup ───────────────────────────────────────────────────────── */
    const adminDb  = getAdminDb();
    const clientDb = adminDb ? null : getClientDb();

    let clinicName  = "Klinik";
    let clinicEmail = "";
    let clinicData: any = null;

    /* ── Fetch clinic info ──────────────────────────────────────────────── */
    if (adminDb) {
      const cSnap = await adminDb.collection("clinics").doc(clinicId).get();
      if (cSnap.exists) {
        clinicData = cSnap.data()!;
        clinicName  = clinicData.name ?? "Klinik";
        clinicEmail = clinicData.notificationEmail ?? clinicData.email ?? "";
      }

      // Fallback: get first admin/clinic user email
      if (!clinicEmail) {
        const uSnap = await adminDb.collection("users")
          .where("clinicId", "==", clinicId)
          .limit(3).get();
        clinicEmail = uSnap.docs.map(d => d.data().email).filter(Boolean)[0] ?? "";
      }
    } else if (clientDb) {
      const cSnap = await getDoc(doc(clientDb, "clinics", clinicId));
      if (cSnap.exists()) {
        clinicData = cSnap.data()!;
        clinicName  = clinicData.name ?? "Klinik";
        clinicEmail = clinicData.notificationEmail ?? clinicData.email ?? "";
      }

      if (!clinicEmail) {
        const uSnap = await getDocs(
          query(collection(clientDb, "users"), where("clinicId", "==", clinicId))
        );
        clinicEmail = uSnap.docs.map(d => d.data().email).filter(Boolean)[0] ?? "";
      }
    }

    // Past / hours gate before any write or email
    if (requestedDate && requestedTime) {
      const tz = resolveClinicTimeZone(clinicData);
      const clinicTimeZone = tz.confident ? tz.timeZone : "Europe/Istanbul";
      const hours = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
        clinicId,
        clinicData,
      });
      const policy = validateAppointmentDateTime({
        localDate: requestedDate,
        localTime: requestedTime,
        rawUserInput: originalText || `${requestedDate} ${requestedTime}`,
        clinicTimeZone,
        now: new Date(),
        workingHours: hours.schedule,
        is24_7: hours.is24_7,
        minimumNoticeMinutes: 0,
        locale: "tr",
      });
      if (!policy.ok) {
        return NextResponse.json(
          {
            error: policy.reason || "APPOINTMENT_DATETIME_REJECTED",
            message: policy.message,
            suggestedTimes: policy.suggestions,
            appointmentCreated: false,
          },
          { status: 400, headers: CORS }
        );
      }
    }

    /* ── Duplicate check (same phone + date + time in last 24h) ─────────── */
    const service = (requestedService ?? "Genel Muayene").trim();
    const date    = (requestedDate ?? "").trim();
    const time    = (requestedTime ?? "Belirtilmedi").trim();
    const name    = patientName.trim();
    const phone   = patientPhone.trim();

    if (adminDb) {
      const dupeSnap = await adminDb
        .collection("appointments")
        .where("clinicId", "==", clinicId)
        .where("patientPhone", "==", phone)
        .where("requestedDate", "==", date)
        .where("requestedTime", "==", time)
        .limit(1)
        .get();

      if (!dupeSnap.empty) {
        return NextResponse.json(
          { success: false, duplicate: true, appointmentId: dupeSnap.docs[0].id },
          { headers: CORS }
        );
      }
    } else if (clientDb) {
      const dupeQ = query(
        collection(clientDb, "appointments"),
        where("clinicId",      "==", clinicId),
        where("patientPhone",  "==", phone),
        where("requestedDate", "==", date),
        where("requestedTime", "==", time)
      );
      const dupes = await getDocs(dupeQ);
      if (!dupes.empty) {
        return NextResponse.json(
          { success: false, duplicate: true, appointmentId: dupes.docs[0].id },
          { headers: CORS }
        );
      }
    }

    /* ── Create appointment document ─────────────────────────────────────── */
    const apptData = {
      clinicId,
      patientName:      name,
      patientPhone:     phone,
      service,
      requestedService: service,
      preferredDate:    date,
      requestedDate:    date,
      preferredTime:    time,
      requestedTime:    time,
      status:           "pending",
      source:           "widget",
      originalText:     originalText ?? "",
      conversationId:   conversationId ?? "",
      notes:            notes ?? "",
      notificationStatus: {
        smsToPatient:  "pending",
        emailToClinic: "pending",
      },
      createdAt: serverTimestamp(),
    };

    let appointmentId = "";

    if (adminDb) {
      const ref = await adminDb.collection("appointments").add(apptData);
      appointmentId = ref.id;
    } else if (clientDb) {
      const ref = await addDoc(collection(clientDb, "appointments"), apptData);
      appointmentId = ref.id;
    } else {
      return NextResponse.json({ error: "No database available" }, { status: 500, headers: CORS });
    }

    console.log(`[appointment-create] Created ${appointmentId} for ${name} (${phone}) clinicId=${clinicId}`);

    /* ── Notifications (fire and forget) ────────────────────────────────── */
    const notifResults = { sms: false, email: false };

    // Fetch the notification settings to know what channel we should use
    let notificationSettings = {
      patientAppointmentChannel: "email",
      requireEmail: true,
      requirePhone: false
    };

    if (adminDb) {
      const cSnap = await adminDb.collection("clinics").doc(clinicId).get();
      if (cSnap.exists) {
        notificationSettings = cSnap.data()!.notificationSettings || cSnap.data()!.patientNotificationSettings || notificationSettings;
      }
    } else if (clientDb) {
      const cSnap = await getDoc(doc(clientDb, "clinics", clinicId));
      if (cSnap.exists()) {
        notificationSettings = cSnap.data()!.notificationSettings || cSnap.data()!.patientNotificationSettings || notificationSettings;
      }
    }

    const channelToUse = notificationSettings.patientAppointmentChannel || "email";


    // Email to clinic (always notify the clinic via email regardless of patient channel)
    if (clinicEmail) {
      try {
        const emailResult = await sendClinicAppointmentEmail({
          clinicId,
          clinicName,
          clinicEmails: [clinicEmail],
          patientName:      name,
          patientPhone:     phone,
          requestedService: service,
          requestedDate:    date,
          requestedTime:    time,
          appointmentId,
        });
        notifResults.email = emailResult.success;
        console.log(`[appointment-email] ${emailResult.success ? "OK" : "FAILED"} → ${clinicEmail}`);
      } catch (e: any) {
        console.error("[appointment-email] Error:", e.message);
      }
    } else {
      console.warn(`[appointment-email] No clinic email found for clinicId=${clinicId}`);
    }

    try {
      const statusUpdate = {
        "notificationStatus.smsToPatient":  "skipped",
        "notificationStatus.emailToClinic": notifResults.email  ? "sent" : "failed",
        notificationChannel: channelToUse
      };
      
      if (adminDb) {
        await adminDb.collection("appointments").doc(appointmentId).update(statusUpdate);
      } else if (clientDb) {
        const { updateDoc, doc: firestoreDoc } = await import("firebase/firestore");
        await updateDoc(firestoreDoc(clientDb, "appointments", appointmentId), statusUpdate);
      }
    } catch (e) {
      console.warn("[appointment-create] Could not update notification status", e);
    }

    return NextResponse.json(
      { success: true, appointmentId, smsSent: false, emailSent: notifResults.email },
      { headers: CORS }
    );

  } catch (err: any) {
    console.error("[appointment-create] Error:", err.message ?? err);
    return NextResponse.json({ error: "Appointment creation failed" }, { status: 500, headers: CORS });
  }
}
