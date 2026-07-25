const fs = require('fs');

let currentCode = fs.readFileSync('app/api/public/chat/route.ts', 'utf8');

const oldCheck = `// Strip markdown formatting characters (**, *, #) as requested
    reply = reply.replace(/\\*\\*|\\*|#/g, '');`;

const newCheck = `// Strip markdown formatting characters (**, *, #) as requested
    reply = reply.replace(/\\*\\*|\\*|#/g, '');

    // HARD FORBIDDEN PHRASES FOR NORMAL CHAT
    // Normal chat must never claim the appointment was successfully sent.
    const forbiddenClaims = [
      "randevu talebiniz iletildi",
      "kliniğimize ilettim",
      "talebiniz oluşturuldu",
      "randevunuz kaydedildi",
      "başarıyla gönderildi",
      "değerlendirmesine iletildi"
    ];
    
    // We only do this if it's the general LLM flow, which it is here.
    if (forbiddenClaims.some(claim => reply.toLowerCase().includes(claim.toLowerCase()))) {
      console.warn("[FORBIDDEN_CLAIM_INTERCEPTED] LLM tried to claim success without transaction:", reply);
      reply = "Randevu talebiniz henüz sisteme kaydedilmedi. İşlemi tamamlamak için gerekli adımları sürdürüyorum.";
    }`;

currentCode = currentCode.replace(oldCheck, newCheck);

fs.writeFileSync('app/api/public/chat/route.ts', currentCode);
console.log("Patched forbidden claims check.");
