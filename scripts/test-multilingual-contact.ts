import fetch from "node-fetch";

async function run() {
  const clinicId = "ByTnY4VEmBTJxogqCQ7q"; // Istanbul Dis Akademisi
  
  const testCases = [
    { name: "TEST A - English WhatsApp", msg: "Can I contact your clinic via WhatsApp?", lang: "en" },
    { name: "TEST B - English Human Support", msg: "I would like to speak with someone from the clinic.", lang: "en" },
    { name: "TEST C - Turkish WhatsApp", msg: "WhatsApp numaranızı alabilir miyim?", lang: "tr" },
    { name: "TEST F - German WhatsApp", msg: "Kann ich Ihre WhatsApp-Nummer bekommen?", lang: "de" },
  ];
  
  for (const tc of testCases) {
    console.log(`\n--- RUNNING ${tc.name} ---`);
    const payload = {
      clinicId,
      message: tc.msg,
      language: tc.lang,
      conversationId: `test_session_${Date.now()}`,
      history: []
    };
    
    const res = await fetch("http://localhost:3000/api/public/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log(`Payload Language: ${tc.lang}`);
    console.log(`Response: ${data.reply}`);
    
    if (tc.lang === "en" && data.reply.includes("535 660 51 37") && data.reply.includes("international patient team")) {
      console.log("✅ TEST PASSED");
    } else if (tc.lang === "tr" && data.reply.includes("533 140 08 70") && data.reply.includes("Elbette.")) {
      console.log("✅ TEST PASSED");
    } else if (tc.lang === "de" && data.reply.includes("535 660 51 37") && data.reply.includes("Natürlich")) {
      console.log("✅ TEST PASSED");
    } else {
      console.log("❌ TEST FAILED", data.reply);
    }
  }
}

run().catch(console.error);
