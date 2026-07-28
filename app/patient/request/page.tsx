import { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase-admin";
import { validatePatientRequestViewToken } from "@/lib/services/patientPortalTokenService";
import { headers } from "next/headers";
import { XCircle, Clock, CheckCircle, AlertCircle, Building2, Calendar, Stethoscope, MapPin, Search } from "lucide-react";
import Image from "next/image";

// Ensure this page is not cached and is dynamically rendered
export const dynamic = "force-dynamic";

// Security metadata
export const metadata: Metadata = {
  title: "Request Summary",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default async function PatientRequestPortalPage({
  searchParams,
}: {
  searchParams: { token?: string; lang?: string };
}) {
  const token = searchParams.token;
  const lang = searchParams.lang || "en";
  const isTr = lang === "tr";

  if (!token) {
    return (
      <ErrorScreen 
        title={isTr ? "Geçersiz Bağlantı" : "Invalid Link"}
        message={isTr ? "Bu bağlantı geçerli değil. Lütfen size gönderilen en güncel e-postadaki bağlantıyı kullanın." : "This link is invalid. Please use the link in the most recent email sent to you."}
      />
    );
  }

  const tokenResult = await validatePatientRequestViewToken(token);

  if (!tokenResult.valid) {
    if (tokenResult.error === "expired") {
      return (
        <ErrorScreen 
          title={isTr ? "Süresi Dolmuş Bağlantı" : "Expired Link"}
          message={isTr ? "Bu bağlantının süresi dolmuş. Yeni bir bağlantı talep etmek için ilgili acente ile iletişime geçebilirsiniz." : "This link has expired. Please contact the relevant agency to request a new link."}
        />
      );
    }
    if (tokenResult.error === "revoked") {
      return (
        <ErrorScreen 
          title={isTr ? "Kullanılamayan Bağlantı" : "Unavailable Link"}
          message={isTr ? "Bu bağlantı artık kullanılamıyor." : "This link is no longer available."}
        />
      );
    }
    return (
      <ErrorScreen 
        title={isTr ? "Geçersiz Bağlantı" : "Invalid Link"}
        message={isTr ? "Bu bağlantı geçerli değil. Lütfen size gönderilen en güncel e-postadaki bağlantıyı kullanın." : "This link is invalid. Please use the link in the most recent email sent to you."}
      />
    );
  }

  // Token is valid, fetch data
  const { agencyId, leadId } = tokenResult.data!;
  const adminDb = getAdminDb();
  if (!adminDb) {
    return <ErrorScreen title="System Error" message={isTr ? "Sistem hatası oluştu." : "A system error occurred."} />;
  }

  try {
    const leadSnap = await adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return (
        <ErrorScreen 
          title={isTr ? "Talep Bulunamadı" : "Request Not Found"}
          message={isTr ? "Talep bilgileriniz şu anda görüntülenemiyor. Lütfen daha sonra tekrar deneyin." : "Your request information cannot be displayed right now. Please try again later."}
        />
      );
    }
    const lead = leadSnap.data()!;

    // We do NOT show cancelled leads unless handled safely, but here we just show the general status
    const statusMap: Record<string, any> = {
      "draft": { tr: "Taslak", en: "Draft", color: "#64748b" },
      "created": { tr: "Oluşturuldu", en: "Created", color: "#64748b" },
      "submitted": { tr: "Talep alındı", en: "Request received", color: "#3b82f6" },
      "patient_notified": { tr: "Değerlendiriliyor", en: "Under review", color: "#eab308" },
      "clinic_notified": { tr: "Değerlendiriliyor", en: "Under review", color: "#eab308" },
      "quotes_received": { tr: "Teklifler Alındı", en: "Quotes Received", color: "#10b981" },
      "completed": { tr: "Tamamlandı", en: "Completed", color: "#10b981" },
      "cancelled": { tr: "İptal Edildi", en: "Cancelled", color: "#ef4444" }
    };
    
    // Default safe fallback status if not found
    const displayStatus = statusMap[lead.status] || { tr: "Değerlendiriliyor", en: "Under review", color: "#eab308" };

    const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
    const agency = agencySnap.data() || {};
    const agencyName = agency.name || "ClinicBridge AI";
    const agencyLogo = agency.settings?.logoUrl || null;

    const crSnap = await adminDb.collection("agencies").doc(agencyId).collection("clinic_requests")
      .where("leadId", "==", leadId).get();
    
    const clinicRequests = crSnap.docs.map(d => d.data());
    
    const clinicsData = [];
    for (const cr of clinicRequests.slice(0, 3)) { // Ensure max 3
      const cSnap = await adminDb.collection("clinics").doc(cr.clinicId).get();
      if (cSnap.exists) {
        clinicsData.push({
          name: cSnap.data()?.name || cr.clinicId,
          location: cSnap.data()?.location || null
        });
      } else {
        clinicsData.push({ name: cr.clinicId, location: null });
      }
    }

    const leadReference = `CB-${new Date(lead.createdAt).toISOString().slice(0,10).replace(/-/g, "")}-${leadId.substring(0, 5).toUpperCase()}`;
    const treatmentName = lead.treatmentCategory || (isTr ? "Tedavi talebi" : "Treatment request");
    
    // Add security headers explicitly on this response 
    const headersList = headers();
    
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          
          {/* Header */}
          <div style={{ padding: "24px 32px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {agencyLogo ? (
                <img src={agencyLogo} alt={agencyName} style={{ height: 32, objectFit: "contain" }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold", fontSize: 18 }}>
                  {agencyName.charAt(0)}
                </div>
              )}
              <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 16 }}>{agencyName}</span>
            </div>
          </div>

          <div style={{ padding: "32px" }}>
            <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
              {isTr ? "Talep Özeti" : "Request Summary"}
            </h1>
            <p style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: 15 }}>
              {isTr ? "Talebinizin mevcut durumunu ve seçtiğiniz klinikleri aşağıdan inceleyebilirsiniz." : "You can review the current status of your request and selected clinics below."}
            </p>

            {/* Warning Alert */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, backgroundColor: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", marginBottom: 24 }}>
              <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, color: "#991b1b", fontSize: 14, lineHeight: 1.5 }}>
                <strong>{isTr ? "Önemli:" : "Important:"}</strong> {isTr ? "Bu kayıt kesinleşmiş bir randevu değildir. Klinik veya ilgili ekip değerlendirmesi tamamlandıktan sonra süreçle ilgili ayrıca bilgilendirileceksiniz." : "This is not a confirmed appointment. You will be informed separately after the clinic or relevant team completes its review."}
              </p>
            </div>

            {/* Status & Reference */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>{isTr ? "Durum" : "Status"}</p>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 12, backgroundColor: `${displayStatus.color}20`, color: displayStatus.color, fontSize: 13, fontWeight: 600 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: displayStatus.color }}></div>
                  {isTr ? displayStatus.tr : displayStatus.en}
                </div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>{isTr ? "Referans No" : "Reference No"}</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{leadReference}</p>
              </div>
            </div>

            {/* Request Details */}
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
              {isTr ? "Talep Detayları" : "Request Details"}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Stethoscope size={18} color="#0d9488" />
                </div>
                <div>
                  <p style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b" }}>{isTr ? "Tedavi Talebi" : "Treatment Request"}</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#1e293b" }}>{treatmentName}</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Calendar size={18} color="#0d9488" />
                </div>
                <div>
                  <p style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b" }}>{isTr ? "Oluşturulma Tarihi" : "Date Created"}</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#1e293b" }}>
                    {new Date(lead.createdAt).toLocaleDateString(isTr ? "tr-TR" : "en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>

              {lead.preferredDate && (
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Clock size={18} color="#0d9488" />
                  </div>
                  <div>
                    <p style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b" }}>{isTr ? "Tercih Edilen Zaman" : "Preferred Time"}</p>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#1e293b" }}>
                      {lead.preferredDate} {lead.preferredTime ? `- ${lead.preferredTime}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Clinics */}
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
              {isTr ? "Seçilen Klinikler" : "Selected Clinics"}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {clinicsData.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: "#64748b", fontStyle: "italic" }}>
                  {isTr ? "Klinik seçilmedi." : "No clinic selected."}
                </p>
              ) : (
                clinicsData.map((clinic, idx) => (
                  <div key={idx} style={{ padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#fff", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={20} color="#64748b" />
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{clinic.name}</p>
                      {clinic.location && (
                        <p style={{ margin: 0, fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={12} />
                          {clinic.location}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
          </div>
          
          {/* Footer */}
          <div style={{ padding: "20px 32px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
              {isTr ? "Powered by" : "Powered by"} <strong>ClinicBridge AI</strong>
            </p>
          </div>
          
        </div>
      </div>
    );

  } catch (err) {
    console.error("[PatientRequestPortalPage] Error:", err);
    return <ErrorScreen title="System Error" message={isTr ? "Talep bilgileriniz şu anda görüntülenemiyor. Lütfen daha sonra tekrar deneyin." : "Your request information cannot be displayed right now. Please try again later."} />;
  }
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 400, width: "100%", backgroundColor: "#ffffff", padding: 32, borderRadius: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <XCircle size={32} color="#dc2626" />
        </div>
        <h2 style={{ margin: "0 0 12px 0", fontSize: 20, fontWeight: 600, color: "#0f172a" }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>{message}</p>
      </div>
    </div>
  );
}
