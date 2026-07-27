import os
import re

file_path = "app/agency-demo/page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace sendSystemAction
content = content.replace("""  const sendSystemAction = async (type: string, clinicName: string, clinicId: string) => {
    if (aiTyping) return;
    setAiTyping(true);

    try {
      const res = await fetch(`/api/public/agency/feelinhealthy/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type, clinicName, clinicId },""",
"""  const sendSystemAction = async (payload: any) => {
    if (aiTyping) return;
    setAiTyping(true);

    try {
      const res = await fetch(`/api/public/agency/feelinhealthy/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: payload,""")

# Replace actions block
content = content.replace("""                            {/* Actions */}
                            <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                              <button onClick={() => sendSystemAction("clinic_selected", rec.clinicName, rec.clinicId)} style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer" }}>
                                {lang === "tr" ? "Bu Klinikle Devam Et" : "Proceed with this Clinic"}
                              </button>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => sendSystemAction("clinic_info", rec.clinicName, rec.clinicId)} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: "center",
                                  background: C.tealBg, color: C.teal, border: `1px solid ${C.tealBorder}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Daha Fazla Bilgi" : "More Info"}
                                </button>
                                <button onClick={() => sendSystemAction("lead_capture", rec.clinicName, rec.clinicId)} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                  background: C.white, color: C.navy, border: `1px solid ${C.border}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Teklif İste" : "Request Quote"}
                                </button>
                              </div>
                            </div>""",
"""                            {/* Actions */}
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                              {sessionCtx.clinicSelectionMode === "manual" && sessionCtx.clinicSelectionStatus !== "completed" ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  {sessionCtx.selectedClinicIds?.includes(rec.clinicId || rec.id) ? (
                                    <button onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "deselect", clinicId: rec.clinicId || rec.id, clinicName: rec.clinicName, locale: lang })} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.white, color: C.textSec, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                                      {lang === "tr" ? "Seçimi Kaldır" : "Remove Selection"}
                                    </button>
                                  ) : (
                                    <button disabled={sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length >= 3} onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "select", clinicId: rec.clinicId || rec.id, clinicName: rec.clinicName, locale: lang })} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", opacity: sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length >= 3 ? 0.5 : 1 }}>
                                      {lang === "tr" ? "Seç" : "Select"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "select", clinicId: rec.clinicId || rec.id, clinicName: rec.clinicName, locale: lang })} style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer" }}>
                                  {lang === "tr" ? "Bu Klinikle Devam Et" : "Proceed with this Clinic"}
                                </button>
                              )}
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => sendSystemAction({ type: "clinic_info", clinicName: rec.clinicName, clinicId: rec.clinicId || rec.id })} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: "center",
                                  background: C.tealBg, color: C.teal, border: `1px solid ${C.tealBorder}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Daha Fazla Bilgi" : "More Info"}
                                </button>
                                <button onClick={() => sendSystemAction({ type: "lead_capture", clinicName: rec.clinicName, clinicId: rec.clinicId || rec.id })} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                  background: C.white, color: C.navy, border: `1px solid ${C.border}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Teklif İste" : "Request Quote"}
                                </button>
                              </div>
                            </div>""")


# Replace recommendations message additions
content = content.replace("""                        {msg.type === "clinic_recommendations" && (
                          <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", fontStyle: "italic" }}>
                            {lang === "tr" ? "Fiyatlar tahminidir; kesin fiyat klinik değerlendirmesine göre değişebilir." : "Prices are estimates; final pricing depends on clinical evaluation."}
                          </p>
                        )}""",
"""                        {(msg.type === "clinic_recommendations" || msg.type === "clinic_answer") && (
                          <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", fontStyle: "italic", marginTop: 8 }}>
                            {lang === "tr" ? "Fiyatlar tahminidir; kesin fiyat değerlendirmeye göre değişebilir." : "Prices are estimates; final pricing depends on clinical evaluation."}
                          </p>
                        )}
                        
                        {msg.type === "clinic_recommendations" && sessionCtx.clinicSelectionStatus !== "completed" && (
                          <div style={{ marginTop: 16, padding: "16px", background: C.tealBg, borderRadius: 16, border: `1px solid ${C.tealBorder}` }}>
                            <p style={{ fontSize: 13, color: C.navy, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
                              {lang === "tr" 
                                ? `Nasıl ilerlemek istersiniz? (En fazla 3 klinik seçebilirsiniz)` 
                                : `How would you like to proceed? (Max 3 clinics allowed)`}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "automatic" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "automatic" ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "automatic" ? "#fff" : C.teal, border: `1px solid ${sessionCtx.clinicSelectionMode === "automatic" ? "transparent" : C.teal}`, cursor: "pointer", transition: "all 0.2s" }}>
                                {lang === "tr" ? "Tüm uygun kliniklerden teklif al" : "Get offers from all suitable clinics"}
                              </button>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "manual" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "manual" ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "manual" ? "#fff" : C.teal, border: `1px solid ${sessionCtx.clinicSelectionMode === "manual" ? "transparent" : C.teal}`, cursor: "pointer", transition: "all 0.2s" }}>
                                {lang === "tr" ? "Klinikleri tek tek seç" : "Select clinics individually"}
                              </button>
                            </div>
                            
                            {sessionCtx.clinicSelectionMode === "manual" && (
                              <div style={{ marginTop: 16, textAlign: "center", borderTop: `1px solid ${C.tealBorder}`, paddingTop: 16 }}>
                                <p style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 12 }}>
                                  {lang === "tr" ? "Seçilen Klinikler: " : "Selected Clinics: "}
                                  <span style={{ color: C.teal, fontSize: 16 }}>{sessionCtx.selectedClinicIds?.length || 0} / 3</span>
                                </p>
                                {sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length > 0 && (
                                  <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.2)" }}>
                                    {lang === "tr" ? "Seçimi Tamamla ve Devam Et" : "Complete Selection and Continue"}
                                  </button>
                                )}
                              </div>
                            )}

                            {sessionCtx.clinicSelectionMode === "automatic" && (
                              <div style={{ marginTop: 16, textAlign: "center", borderTop: `1px solid ${C.tealBorder}`, paddingTop: 16 }}>
                                <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.2)" }}>
                                  {lang === "tr" ? "Seçimi Onayla ve Devam Et" : "Confirm Selection and Continue"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}""")


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
