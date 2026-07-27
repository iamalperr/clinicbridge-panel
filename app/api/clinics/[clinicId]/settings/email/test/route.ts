import { NextResponse } from 'next/server';
import { notificationService } from '@/lib/services/notifications/NotificationService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    const body = await request.json();
    const { tenantId, email } = body;

    if (!email) {
      return NextResponse.json({ error: 'E-posta adresi gereklidir.' }, { status: 400 });
    }

    // In a real implementation we would verify tenant access here
    
    // We will send a generic test email. 
    // sendTransactionalEmail will automatically read from settings/email to apply branding.
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
        <h2 style="color:#6366f1">Klinik E-Posta Ayarları Testi</h2>
        <p>Merhaba,</p>
        <p>Bu bir test e-postasıdır. Eğer bu mesajı görüyorsanız, e-posta gönderim ayarlarınız başarıyla yapılandırılmış demektir.</p>
        <p>Bu mesajı yanıtlayarak (Reply), ayarladığınız "Reply-To" adresinin doğru çalışıp çalışmadığını kontrol edebilirsiniz.</p>
      </div>
    `;

    const result = await notificationService.sendTransactionalEmail({
      tenantId: tenantId || 'legacy',
      clinicId,
      to: email,
      subject: '{clinicName} E-Posta Testi',
      html,
      locale: 'tr',
      notificationType: 'email_settings_test',
    });

    if (result.success && result.emailSent) {
      return NextResponse.json({ success: true, message: 'Test e-postası başarıyla gönderildi.' });
    } else if (result.emailSkipped) {
      return NextResponse.json({ success: false, skipped: true, error: result.message || 'E-posta gönderimi kapalı.' }, { status: 400 });
    } else {
      return NextResponse.json({ success: false, error: result.message || 'E-posta gönderilemedi.' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[TEST_EMAIL_SETTINGS_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Sunucu hatası.' }, { status: 500 });
  }
}
