import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { notificationService } from "@/lib/services/notifications/NotificationService";
import { mapToCanonicalStatus } from "@/lib/types/appointment";

interface RouteParams {
  params: Promise<{ clinicId: string; appointmentId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  return handleStatusUpdate(req, params);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return handleStatusUpdate(req, params);
}

async function handleStatusUpdate(req: Request, paramsPromise: Promise<{ clinicId: string; appointmentId: string }>) {
  try {
    const { clinicId, appointmentId } = await paramsPromise;
    const body = await req.json();
    const rawReqStatus = body.status || body.newStatus;

    if (!rawReqStatus) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
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
    
    // Robust User Authentication Check
    const userSnap = await adminDb.collection("users").where("uid", "==", decodedToken.uid).limit(1).get();
    let userData = null;
    
    if (userSnap.empty) {
      const docSnap = await adminDb.collection("users").doc(decodedToken.uid).get();
      if (docSnap.exists) {
        userData = docSnap.data();
      }
    } else {
      userData = userSnap.docs[0].data();
    }
    
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }
    
    if (userData.role !== "admin" && userData.clinicId !== clinicId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Map to Canonical Status
    const newStatus = mapToCanonicalStatus(rawReqStatus);

    // 3. Fetch Clinic & Appointment just to verify existence and get old status before transacting
    const apptSnap = await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const apptData = apptSnap.data()!;
    const oldStatus = mapToCanonicalStatus(apptData.status);

    const confirmedDate = body.confirmedDate !== undefined ? (body.confirmedDate ? String(body.confirmedDate).trim() : null) : undefined;
    const confirmedTime = body.confirmedTime !== undefined ? (body.confirmedTime ? String(body.confirmedTime).trim() : null) : undefined;
    const confirmedTimeRange = body.confirmedTimeRange !== undefined ? (body.confirmedTimeRange ? String(body.confirmedTimeRange).trim() : null) : undefined;
    const changeReason = body.changeReason ? String(body.changeReason).trim() : undefined;
    const requestedDate = body.requestedDate !== undefined ? (body.requestedDate ? String(body.requestedDate).trim() : null) : undefined;
    const requestedTime = body.requestedTime !== undefined ? (body.requestedTime ? String(body.requestedTime).trim() : null) : undefined;
    const preferredDate = body.preferredDate !== undefined ? (body.preferredDate ? String(body.preferredDate).trim() : null) : undefined;
    const preferredTime = body.preferredTime !== undefined ? (body.preferredTime ? String(body.preferredTime).trim() : null) : undefined;
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : undefined;

    // 4. Idempotency vs Reschedule/Edit Check
    const isScheduleChanged = 
      (confirmedDate !== undefined && confirmedDate !== (apptData.confirmedDate || null)) ||
      (confirmedTime !== undefined && confirmedTime !== (apptData.confirmedTime || null)) ||
      (requestedDate !== undefined && requestedDate !== (apptData.requestedDate || null)) ||
      (requestedTime !== undefined && requestedTime !== (apptData.requestedTime || null)) ||
      (preferredDate !== undefined && preferredDate !== (apptData.preferredDate || null)) ||
      (preferredTime !== undefined && preferredTime !== (apptData.preferredTime || null)) ||
      (notes !== undefined && notes !== (apptData.notes || null));

    if (oldStatus === newStatus && !isScheduleChanged) {
      return NextResponse.json({ 
        success: true, 
        appointmentUpdated: false,
        unchanged: true,
        status: newStatus,
        emailSent: false
      });
    }

    const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
    const clinicData = clinicSnap.data() || {};
    const tenantId = clinicData.agencyId || clinicId;

    // 5. Invoke NotificationEngine Transaction
    const result = await notificationService.sendAppointmentStatusUpdate({
      tenantId,
      clinicId,
      appointmentId,
      oldStatus,
      newStatus,
      actorUserId: decodedToken.uid,
      confirmedDate,
      confirmedTime,
      confirmedTimeRange,
      changeReason,
      requestedDate,
      requestedTime,
      preferredDate,
      preferredTime,
      notes
    });

    if (!result.success && !result.appointmentUpdated) {
      return NextResponse.json({
        success: false,
        appointmentUpdated: false,
        errorCode: result.errorCode,
        message: result.message
      }, { status: 400 });
    }

    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
