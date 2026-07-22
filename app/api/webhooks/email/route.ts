import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

// Verify Resend webhook signatures (optional but recommended in production)
// import { Webhook } from 'svix';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Example payload from Resend:
    // {
    //   "type": "email.delivered",
    //   "data": {
    //     "created_at": "2023-04-20T21:49:09.136Z",
    //     "email_id": "4b92b6a2-9a67-4eb9-a2e6-a3672b1d3d63",
    //     "from": "onboarding@resend.dev",
    //     "to": ["user@example.com"],
    //     "subject": "Hello World"
    //   }
    // }

    const { type, data } = payload;
    const emailId = data?.email_id;

    if (!emailId) {
      return NextResponse.json({ success: true, message: 'No email_id found' });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error('[Webhook/Email] Admin DB not initialized');
      return NextResponse.json({ error: 'DB not initialized' }, { status: 500 });
    }

    // Map Resend events to our NotificationStatus
    let status = '';
    switch (type) {
      case 'email.sent':
        status = 'sent';
        break;
      case 'email.delivered':
        status = 'delivered';
        break;
      case 'email.bounced':
        status = 'bounced';
        break;
      case 'email.complained':
        status = 'complained';
        break;
      case 'email.delivery_delayed':
        status = 'retrying';
        break;
      default:
        // Other events like email.clicked or email.opened can be ignored or logged
        return NextResponse.json({ success: true, message: 'Unhandled event type ignored' });
    }

    // Find the corresponding notification event
    const snapshot = await adminDb
      .collection('notification_events')
      .where('provider_message_id', '==', emailId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(`[Webhook/Email] No event found for message_id: ${emailId}`);
      return NextResponse.json({ success: true, message: 'Event not found' });
    }

    const docRef = snapshot.docs[0].ref;
    
    const updateData: any = {
      status,
      updated_at: new Date()
    };

    if (status === 'delivered') {
      updateData.delivered_at = new Date();
    } else if (status === 'bounced' || status === 'complained') {
      updateData.failed_at = new Date();
      updateData.failure_reason = type; // Store the exact reason
    }

    await docRef.update(updateData);
    console.log(`[Webhook/Email] Updated event ${docRef.id} to status ${status}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Webhook/Email] Processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}
