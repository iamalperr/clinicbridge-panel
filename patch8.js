const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

const debugStartOld = `    console.log("[NORMAL_LLM_CALL_STARTED]");`;

const debugStartNew = `    console.log("[CONFIRMATION_DEBUG]", {
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

currentCode = currentCode.replace(debugStartOld, debugStartNew);

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched debug logging.");
