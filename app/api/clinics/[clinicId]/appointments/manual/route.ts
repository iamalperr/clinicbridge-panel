import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { createAppointmentAndNotify } from "@/lib/appointment-service";

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

    // Verify Authorization
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

    // Call unified service
    const result = await createAppointmentAndNotify({
      clinicId,
      patientName,
      patientPhone,
      patientEmail,
      requestedService,
      requestedDate,
      requestedTime,
      notes,
      source: "manual",
      status: "PENDING_REVIEW",
      createdBy: decodedToken.uid
    });

    return NextResponse.json({ 
      success: true, 
      appointmentId: result.appointmentId,
      clinicNotificationStatus: result.clinicNotificationStatus
    });

  } catch (error: any) {
    console.error("Error creating manual appointment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
