import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { ClinicEmailSettings } from '@/lib/types/notification';

// GET /api/clinics/[clinicId]/settings/email
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const { clinicId } = await params;
    
    // In a real implementation we would verify tenant access here based on auth token
    
    const settingsRef = adminDb.collection('clinics').doc(clinicId).collection('settings').doc('email');
    const doc = await settingsRef.get();

    if (doc.exists) {
      return NextResponse.json(doc.data());
    } else {
      // Return default/empty state
      const defaultSettings: Partial<ClinicEmailSettings> = {
        clinicId,
        emailEnabled: true,
        senderDisplayName: "",
        replyToEmail: "",
        defaultLocale: "tr",
        emailSignature: ""
      };
      return NextResponse.json(defaultSettings);
    }
  } catch (error: any) {
    console.error('[GET_EMAIL_SETTINGS_ERROR]', error);
    return NextResponse.json({ error: 'Failed to fetch email settings' }, { status: 500 });
  }
}

// POST /api/clinics/[clinicId]/settings/email
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const { clinicId } = await params;
    const body = await request.json();

    // In a real implementation we would verify tenant access here

    const settingsRef = adminDb.collection('clinics').doc(clinicId).collection('settings').doc('email');
    
    const dataToSave: Partial<ClinicEmailSettings> = {
      tenantId: body.tenantId || 'legacy',
      clinicId,
      emailEnabled: typeof body.emailEnabled === 'boolean' ? body.emailEnabled : true,
      senderDisplayName: body.senderDisplayName || "",
      replyToEmail: body.replyToEmail || "",
      defaultLocale: body.defaultLocale || "tr",
      emailSignature: body.emailSignature || "",
      logoUrl: body.logoUrl || "",
      updatedAt: new Date(),
    };

    const doc = await settingsRef.get();
    if (!doc.exists) {
      dataToSave.createdAt = new Date();
    }

    await settingsRef.set(dataToSave, { merge: true });

    return NextResponse.json({ success: true, settings: dataToSave });
  } catch (error: any) {
    console.error('[POST_EMAIL_SETTINGS_ERROR]', error);
    return NextResponse.json({ error: 'Failed to save email settings' }, { status: 500 });
  }
}
