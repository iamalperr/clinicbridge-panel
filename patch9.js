const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

// The new logic block
const strictHandlerLogic = `    /* ====================================================================
       1. STRICT CONFIRMATION INTERCEPTOR (BYPASSES ALL NORMAL CHAT LOGIC)
       ==================================================================== */
    const contextSnap = await adminDb.collection("clinics").doc(actualClinicId).collection("conversationLogs").doc(convId).get();
    let loadedState = "IDLE";
    let loadedDraft = {};
    if (contextSnap.exists) {
        const lData = contextSnap.data();
        if (lData?.appointmentState) loadedState = lData.appointmentState;
        if (lData?.appointmentDraft) loadedDraft = lData.appointmentDraft;
    }

    const isConfirm = isConfirmation(message);
    const positiveConfirmationDetected = isConfirm || msgLower === "evet" || msgLower === "yes";

    console.log("[CONFIRMATION_DEBUG]", {
      traceId,
      conversationId: convId,
      inboundClinicId: clinicId,
      message,
      normalizedMessage: msgLower,
      loadedAppointmentState: loadedState,
      persistedDraftExists: Object.keys(loadedDraft).length > 0,
      persistedDraftFields: Object.keys(loadedDraft).join(","),
      positiveConfirmationDetected
    });

    if (loadedState === "AWAITING_CONFIRMATION" && positiveConfirmationDetected) {
         console.log("[CONFIRMATION_HANDLER_ENTERED]");
         
         // 1. Validate persisted draft
         if (!loadedDraft.patientName) {
             console.error(\`[CONFIRMATION_FAILED] Missing patientName in persisted draft for convId=\${convId}\`);
             await saveAppointmentState(adminDb, actualClinicId, convId, 0, "COLLECTING_NAME", loadedDraft, {});
             return NextResponse.json({ responseType: "CHAT_REPLY", reply: "İşleme devam edebilmem için adınızı ve soyadınızı öğrenebilir miyim?", success: null, appointmentCreated: false, appointmentId: null }, { headers: CORS });
         }
         if (!loadedDraft.patientPhone) {
             console.error(\`[CONFIRMATION_FAILED] Missing patientPhone in persisted draft for convId=\${convId}\`);
             await saveAppointmentState(adminDb, actualClinicId, convId, 0, "COLLECTING_PHONE", loadedDraft, {});
             return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Kliniğimizin sizinle iletişime geçebilmesi için telefon numaranızı öğrenebilir miyim?", success: null, appointmentCreated: false, appointmentId: null }, { headers: CORS });
         }

         // 2. Call and await createAppointment
         try {
             const result = await createAppointment(
                 adminDb,
                 actualClinicId, // Must be the real Firestore doc ID
                 loadedDraft,
                 convId,
                 clinicName,
                 clinicLanguage,
                 clinicWhatsapp
             );

             // 3. Require a real appointmentId
             if (result.success && result.appointmentId) {
                 await saveAppointmentState(adminDb, actualClinicId, convId, 0, "IDLE", {}, {});

                 // 4. Trigger clinic notification
                 let clinicNotificationStatus = "NOT_CONFIGURED";
                 if (clinicData?.notifications?.email?.enabled && clinicData.notifications.email.recipients?.length > 0) {
                     try {
                         const emailRes = await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhooks/email\`, {
                             method: "POST",
                             headers: { "Content-Type": "application/json" },
                             body: JSON.stringify({
                                 type: "new_appointment",
                                 clinicId: actualClinicId,
                                 appointmentId: result.appointmentId
                             })
                         });
                         clinicNotificationStatus = emailRes.ok ? "SENT" : "FAILED";
                     } catch(err) {
                         clinicNotificationStatus = "FAILED";
                     }
                 }

                 // 5. Return strict response
                 return NextResponse.json({
                     responseType: "APPOINTMENT_SUBMISSION_SUCCESS",
                     success: true,
                     appointmentCreated: true,
                     appointmentId: result.appointmentId,
                     databaseInsertSucceeded: true,
                     clinicNotificationStatus,
                     reply: "Teşekkür ederim. Ön randevu talebiniz kliniğimizin değerlendirmesine iletildi. En kısa sürede sizinle iletişime geçilecektir."
                 }, { headers: CORS });

             } else {
                 return NextResponse.json({
                     responseType: "APPOINTMENT_SUBMISSION_FAILED",
                     success: false,
                     appointmentCreated: false,
                     appointmentId: null,
                     databaseInsertSucceeded: false,
                     errorCode: "INSERT_FAILED",
                     reply: "Üzgünüm, ön randevu talebiniz henüz kliniğe iletilemedi."
                 }, { headers: CORS });
             }

         } catch (err: any) {
             return NextResponse.json({
                 responseType: "APPOINTMENT_SUBMISSION_FAILED",
                 success: false,
                 appointmentCreated: false,
                 appointmentId: null,
                 databaseInsertSucceeded: false,
                 errorCode: err.message,
                 reply: "Üzgünüm, ön randevu talebiniz henüz kliniğe iletilemedi."
             }, { headers: CORS });
         }
    } else if (positiveConfirmationDetected) {
         console.log("[CONFIRMATION_HANDLER_BYPASSED]", { reason: "state_not_awaiting_confirmation" });
    }
    /* ==================================================================== */`;

const insertionPoint = `    const messageId = body.messageId || \`msg_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;`;

currentCode = currentCode.replace(insertionPoint, insertionPoint + "\n" + strictHandlerLogic);

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched top of POST.");
