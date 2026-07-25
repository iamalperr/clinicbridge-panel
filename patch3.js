const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

// Replace success response
const successOld = `return NextResponse.json({ reply: successMsg, appointmentCreated: true, appointmentId: appointmentResult.appointmentId }, { headers: CORS });`;
const successNew = `return NextResponse.json({ 
                 responseType: "APPOINTMENT_SUBMISSION_SUCCESS",
                 reply: successMsg, 
                 appointmentCreated: true, 
                 success: true,
                 databaseInsertSucceeded: true,
                 appointmentId: appointmentResult.appointmentId 
               }, { headers: CORS });`;

currentCode = currentCode.replace(successOld, successNew);

// Replace failure response
const failureOld = `return NextResponse.json({ 
                 reply: "Üzgünüm, ön randevu talebinizi şu anda sisteme kaydederken teknik bir sorun oluştu. Bilgileriniz henüz kliniğe iletilmedi. Lütfen kısa bir süre sonra yeniden deneyin.", 
                 appointmentCreated: false,
                 success: false
               }, { headers: CORS });`;
const failureNew = `return NextResponse.json({ 
                 responseType: "APPOINTMENT_SUBMISSION_FAILED",
                 reply: "Üzgünüm, ön randevu talebinizi şu anda sisteme kaydederken teknik bir sorun oluştu. Bilgileriniz henüz kliniğe iletilmedi. Lütfen kısa bir süre sonra yeniden deneyin.", 
                 appointmentCreated: false,
                 databaseInsertSucceeded: false,
                 appointmentId: null,
                 errorCode: err.message,
                 success: false
               }, { headers: CORS });`;

currentCode = currentCode.replace(failureOld, failureNew);

// Now globally add responseType: "CHAT_REPLY" to all other replies?
// It might be easier to do it via regex, but we only strictly need APPOINTMENT_SUBMISSION_SUCCESS.
// The user said: Normal chat: { "responseType": "CHAT_REPLY", "reply": "..." }
// So let's replace all `NextResponse.json({ reply:` with `NextResponse.json({ responseType: "CHAT_REPLY", reply:` 
// EXCEPT where we already have responseType.

currentCode = currentCode.replace(/NextResponse\.json\(\{\s*reply:/g, 'NextResponse.json({ responseType: "CHAT_REPLY", reply:');
currentCode = currentCode.replace(/NextResponse\.json\(\{ duplicate: true,\s*reply:/g, 'NextResponse.json({ responseType: "CHAT_REPLY", duplicate: true, reply:');

// Let's fix our APPOINTMENT_SUBMISSION ones because we might have accidentally changed them if they had `reply:` first.
// Oh, successNew and failureNew both have `responseType: "APPOINTMENT_SUBMISSION_...` first, so they don't match `{\s*reply:`.

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched route.ts");
