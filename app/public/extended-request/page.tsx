"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, Building2, Stethoscope, Mail, Phone, User } from "lucide-react";

export default function ExtendedRequestPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [data, setData] = useState<{ request: any; prefill: any } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token is missing.");
      setLoading(false);
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`/api/public/extended-request/validate?token=${token}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Validation failed");
        }
        const result = await res.json();
        setData(result);
      } catch (err: any) {
        console.error(err);
        if (err.message.includes("EXPIRED") || err.message.includes("REVOKED")) {
          setError("Bu kayıt bağlantısının süresi dolmuş. Mevcut talebiniz etkilenmemiştir. | This registration link has expired. Your existing request has not been affected.");
        } else if (err.message.includes("COMPLETED")) {
          setSuccess(true); // Already completed
        } else {
          setError("Genişletilmiş kayıt sayfası şu anda açılamıyor. Mevcut talebiniz etkilenmedi. | The extended registration page cannot be opened right now. Your existing request has not been affected.");
        }
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async () => {
    if (!consentChecked || !token) return;
    
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/extended-request/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consentId: "extended_clinic_request" })
      });

      if (!res.ok) {
        throw new Error("Submit failed");
      }

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("An error occurred during submission. Your existing request has not been affected.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 opacity-80" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unavailable</h2>
          <p className="text-gray-600 text-sm">{error.split(" | ")[0]}</p>
          <p className="text-gray-500 text-sm mt-2">{error.split(" | ")[1]}</p>
        </div>
      </div>
    );
  }

  const isTr = data?.request?.locale === "tr";

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isTr ? "Talebiniz Alındı" : "Request Received"}
          </h2>
          <p className="text-gray-600 text-sm">
            {isTr 
              ? "Daha fazla klinik seçeneği talebiniz agency değerlendirmesi için alındı. Mevcut 3 klinikli talebiniz etkilenmedi." 
              : "Your request for more clinic options has been received for agency review. Your existing request with 3 clinics has not been affected."}
          </p>
        </div>
      </div>
    );
  }

  const prefill = data?.prefill;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-lg w-full overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-teal-50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-teal-900">
              {prefill?.agencyName || "Agency Portal"}
            </h1>
            <p className="text-xs font-medium text-teal-700">
              {isTr ? "Genişletilmiş Klinik Talebi" : "Extended Clinic Request"}
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="px-6 py-5 bg-amber-50 border-b border-amber-100">
          <p className="text-sm text-amber-900 font-medium leading-relaxed">
            {isTr 
              ? "Bu form, standart 3 klinik sınırının dışında daha fazla klinik seçeneğinin agency tarafından değerlendirilmesini talep etmenizi sağlar. Bu işlem ek kliniklere otomatik gönderim veya kesinleşmiş randevu anlamına gelmez." 
              : "This form allows you to request an agency review for more clinic options beyond the standard limit of 3 clinics. It does not mean automatic distribution to additional clinics or a confirmed appointment."}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Prefilled Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              {isTr ? "Mevcut Talep Bilgileriniz" : "Your Existing Request Details"}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase">{isTr ? "Ad Soyad" : "Name"}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{prefill?.patientName || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <Stethoscope className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase">{isTr ? "Tedavi" : "Treatment"}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{prefill?.treatmentCategory || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase">{isTr ? "E-posta" : "Email"}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{prefill?.patientEmail || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase">{isTr ? "Telefon" : "Phone"}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{prefill?.patientPhone || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Consent */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500"
                />
              </div>
              <div className="text-sm text-gray-700 leading-snug">
                {isTr 
                  ? "Yukarıdaki bilgilerimin daha fazla klinik alternatifi araştırılması amacıyla agency (ajans) tarafından değerlendirilmesini onaylıyorum. Mevcut 3 klinikli talebimin bu işlemden bağımsız olarak devam edeceğini anlıyorum."
                  : "I consent to my information above being reviewed by the agency to explore more clinic alternatives. I understand my existing request with 3 clinics will continue independently."}
              </div>
            </label>
          </div>

          {/* Actions */}
          <button
            onClick={handleSubmit}
            disabled={!consentChecked || submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              isTr ? "Talebi Gönder" : "Submit Request"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
