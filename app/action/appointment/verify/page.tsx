import { Suspense } from 'react';
import VerifyActionClient from './VerifyActionClient';
import { tokenService } from '@/lib/services/notifications/TokenService';
import { getAdminDb } from '@/lib/firebase-admin';

interface PageProps {
  searchParams: { token?: string };
}

export default async function VerifyAppointmentActionPage({ searchParams }: PageProps) {
  const token = searchParams.token;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Geçersiz Bağlantı</h2>
          <p className="text-slate-600">Lütfen e-postanızdaki bağlantının tamamını kopyaladığınızdan emin olun.</p>
        </div>
      </div>
    );
  }

  const result = await tokenService.validateAndConsumeToken(token);

  if (!result.valid || !result.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Bağlantı Süresi Dolmuş veya Geçersiz</h2>
          <p className="text-slate-600">{result.error || 'Bu işlem daha önce tamamlanmış veya bağlantının süresi dolmuş.'}</p>
        </div>
      </div>
    );
  }

  const { data } = result;
  
  // Here we update the appointment status based on the action
  const adminDb = getAdminDb();
  let successMsg = "İşleminiz başarıyla tamamlandı.";

  if (adminDb) {
    try {
      const apptRef = adminDb.collection("clinics").doc(data.clinic_id).collection("appointments").doc(data.appointment_id);
      
      if (data.action_type === 'accept_time') {
        await apptRef.update({
          status: 'confirmed',
          updatedAt: new Date().toISOString()
        });
        successMsg = "Randevu saatiniz başarıyla onaylandı. Sizi kliniğimizde görmeyi sabırsızlıkla bekliyoruz.";
      } else if (data.action_type === 'request_alternative') {
        await apptRef.update({
          status: 'alternative_requested',
          updatedAt: new Date().toISOString()
        });
        successMsg = "Farklı bir zaman talebiniz kliniğe iletildi. Klinik ekibimiz en kısa sürede sizinle iletişime geçecektir.";
      }
    } catch (e) {
      console.error("Error updating appointment via action token:", e);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-sm max-w-md w-full text-center border border-slate-100">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Teşekkürler!</h2>
        <p className="text-slate-600 leading-relaxed">
          {successMsg}
        </p>
      </div>
    </div>
  );
}
