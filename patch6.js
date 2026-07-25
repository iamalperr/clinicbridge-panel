const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

// Replace the strict confirmation handler block
const strictHandlerOld = `// STRICT CONFIRMATION HANDLER
    if (appointmentState === "AWAITING_CONFIRMATION") {
        const isConfirm = isConfirmation(message);
        
        if (isConfirm) {
            console.log(\`[APPOINTMENT_CONFIRMATION_RECEIVED] convId=\${convId} clinicId=\${actualClinicId} state=\${appointmentState} timestamp=\${new Date().toISOString()}\`);`;

const strictHandlerNew = `// STRICT CONFIRMATION HANDLER
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
            console.log(\`[APPOINTMENT_CONFIRMATION_RECEIVED] convId=\${convId} clinicId=\${actualClinicId} state=\${appointmentState} timestamp=\${new Date().toISOString()}\`);`;

currentCode = currentCode.replace(strictHandlerOld, strictHandlerNew);

// Add bypassed log
const elseBlockOld = `} else {
            // It's AWAITING_CONFIRMATION, but they didn't say "evet" or "hayır".
            // Ask for clear confirmation without changing state, preventing fallback to COLLECTING_NAME or IDLE.
            return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Ön randevu talebinizi iletmemi onaylıyor musunuz? (Evet veya Hayır şeklinde yanıtlayabilirsiniz)" }, { headers: CORS });
        }`;

const elseBlockNew = `} else {
            console.log("[CONFIRMATION_HANDLER_BYPASSED]", { reason: "not_positive_confirmation" });
            // It's AWAITING_CONFIRMATION, but they didn't say "evet" or "hayır".
            // Ask for clear confirmation without changing state, preventing fallback to COLLECTING_NAME or IDLE.
            return NextResponse.json({ responseType: "CHAT_REPLY", reply: "Ön randevu talebinizi iletmemi onaylıyor musunuz? (Evet veya Hayır şeklinde yanıtlayabilirsiniz)" }, { headers: CORS });
        }`;

currentCode = currentCode.replace(elseBlockOld, elseBlockNew);

// Also we need to log bypassed if it was a confirmation but state wasn't AWAITING_CONFIRMATION
// We can add it after the if (appointmentState === "AWAITING_CONFIRMATION") block
const endOfIfOld = `}

    // 2. Handle specific collection phases`;

const endOfIfNew = `} else if (msgLower === "evet" || msgLower === "yes" || isConfirm) {
        console.log("[CONFIRMATION_HANDLER_BYPASSED]", { reason: "state_not_awaiting_confirmation" });
    }

    // 2. Handle specific collection phases`;

currentCode = currentCode.replace(endOfIfOld, endOfIfNew);

// Normal LLM Call Started log
const normalLlmOld = `const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;`;

const normalLlmNew = `console.log("[NORMAL_LLM_CALL_STARTED]");
    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;`;

currentCode = currentCode.replace(normalLlmOld, normalLlmNew);

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched route.ts with strict logging.");
