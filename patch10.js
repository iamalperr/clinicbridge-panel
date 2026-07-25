const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

const oldConfirmationBlock = `    // STRICT CONFIRMATION HANDLER
    const isConfirm = isConfirmation(message);
    
    // Add definitive route logs
    if (msgLower === "evet" || msgLower === "yes" || isConfirm) {
        console.log("[CONFIRMATION_ROUTE_CHECK]", {
            traceId,
            conversationId: convId,
            appointmentState,
            normalizedMessage: msgLower,
            isPositiveConfirmation: isConfirm,
            persistedDraftFound: Object.keys(appointmentDraft).length > 0
        });
    }

    if (appointmentState === "AWAITING_CONFIRMATION") {
        if (isConfirm) {
            console.log("[CONFIRMATION_HANDLER_ENTERED]");
            console.log(\`[APPOINTMENT_CONFIRMATION_RECEIVED] convId=\${convId} clinicId=\${actualClinicId} state=\${appointmentState} timestamp=\${new Date().toISOString()}\`);

            // 6. VERIFY CLINIC CONTEXT
            if (clinicId && actualClinicId !== clinicId && !isAgencyClinic) {
                console.error(\`[CLINIC_CONTEXT_MISMATCH] convId=\${convId} widgetClinicId=\${clinicId} resolvedClinicId=\${actualClinicId}\`);
                return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Sistemde bir kimlik doğrulama hatası oluştu. Lütfen sayfayı yenileyip tekrar deneyin." }, { headers: CORS });
            }

            // Server-side strict validation. If any required field is missing from the PERSISTED draft, return error.
            if (!appointmentDraft.patientName) {
                console.error(\`[CONFIRMATION_FAILED] Missing patientName in persisted draft for convId=\${convId}\`);
                await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "COLLECTING_NAME", appointmentDraft, { processedMessageIds: [...processedMessageIds, messageId] });
                return NextResponse.json({ responseType: "CHAT_REPLY", reply: "İşleme devam edebilmem için adınızı ve soyadınızı öğrenebilir miyim?" }, { headers: CORS });
            }
            if (!appointmentDraft.patientPhone) {
                console.error(\`[CONFIRMATION_FAILED] Missing patientPhone in persisted draft for convId=\${convId}\`);
                await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "COLLECTING_PHONE", appointmentDraft, { processedMessageIds: [...processedMessageIds, messageId] });
                return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Kliniğimizin sizinle iletişime geçebilmesi için telefon numaranızı öğrenebilir miyim?" }, { headers: CORS });
            }

            // AT THIS POINT, WE HAVE THE FINAL CONFIRMED DRAFT.
            // Insert it into the actual database collection via createAppointment().
            try {
                const result = await createAppointment(
                  adminDb,
                  actualClinicId, // IMPORTANT: Use actualClinicId for DB insertion!
                  appointmentDraft,
                  convId,
                  clinicName,
                  clinicLanguage,
                  clinicWhatsapp
                );

                if (result.success && result.appointmentId) {
                   await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "IDLE", {}, { processedMessageIds: [...processedMessageIds, messageId] });
                   
                   // TRIGGER CLINIC NOTIFICATION EMAIL AFTER SUCCESSFUL INSERT
                   if (clinicData?.notifications?.email?.enabled && clinicData.notifications.email.recipients?.length > 0) {
                      try {
                        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
                        fetch(\`\${baseUrl}/api/webhooks/email\`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            type: "new_appointment",
                            clinicId: actualClinicId,
                            appointmentId: result.appointmentId
                          })
                        }).catch(err => console.error("[widget-chat] Error sending new_appointment webhook:", err));
                      } catch (err) {
                        console.error("[widget-chat] Webhook dispatch failed:", err);
                      }
                   }

                   return NextResponse.json({
                     responseType: "APPOINTMENT_SUBMISSION_SUCCESS",
                     success: true,
                     appointmentCreated: true,
                     databaseInsertSucceeded: true,
                     appointmentId: result.appointmentId,
                     reply: "Teşekkür ederim. Ön randevu talebiniz kliniğimizin değerlendirmesine iletildi. En kısa sürede sizinle iletişime geçilecektir. Bu arada varsa sormak istediğiniz başka bir soru alabilirim."
                   }, { headers: CORS });
                } else {
                   throw new Error("createAppointment failed internally.");
                }
            } catch (err: any) {
                console.error("[APPOINTMENT_DB_INSERT_FAILED]", err);
                return NextResponse.json({
                 responseType: "APPOINTMENT_SUBMISSION_FAILED",
                 reply: "Üzgünüm, ön randevu talebinizi şu anda sisteme kaydederken teknik bir sorun oluştu. Bilgileriniz henüz kliniğe iletilmedi. Lütfen kısa bir süre sonra yeniden deneyin.", 
                 appointmentCreated: false,
                 databaseInsertSucceeded: false,
                 appointmentId: null,
                 errorCode: err.message,
                 success: false
               }, { headers: CORS });
            }
        } else {
            console.log("[CONFIRMATION_HANDLER_BYPASSED]", { reason: "not_positive_confirmation" });
            // It's AWAITING_CONFIRMATION, but they didn't say "evet" or "hayır".
            // Ask for clear confirmation without changing state, preventing fallback to COLLECTING_NAME or IDLE.
            return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Ön randevu talebinizi iletmemi onaylıyor musunuz? (Evet veya Hayır şeklinde yanıtlayabilirsiniz)" }, { headers: CORS });
        }
    } else if (msgLower === "evet" || msgLower === "yes" || isConfirm) {
        console.log("[CONFIRMATION_HANDLER_BYPASSED]", { reason: "state_not_awaiting_confirmation" });
    }`;

currentCode = currentCode.replace(oldConfirmationBlock, "");

// Remove the old CONFIRMATION_DEBUG log that I added, because it's now duplicated in the new interceptor
const oldDebugLog = `    console.log("[CONFIRMATION_DEBUG]", {
      traceId,
      conversationId: convId,
      inboundClinicId: clinicId,
      message,
      normalizedMessage: msgLower,
      loadedAppointmentState: appointmentState,
      persistedDraftExists: Object.keys(appointmentDraft).length > 0,
      persistedDraftFields: Object.keys(appointmentDraft).join(","),
      positiveConfirmationDetected: isConfirm || msgLower === "evet" || msgLower === "yes"
    });

    console.log("[NORMAL_LLM_CALL_STARTED]");`;

currentCode = currentCode.replace(oldDebugLog, `    console.log("[NORMAL_LLM_CALL_STARTED]");`);

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched out old confirmation block.");
