import fetch from "node-fetch";

async function run() {
  const clinicId = "ByTnY4VEmBTJxogqCQ7q"; // Istanbul Dis Akademisi
  
  const testCases = [
    { name: "TEST A - English WhatsApp", msg: "Can I contact your clinic via WhatsApp?", lang: "en" },
    { name: "TEST B - Turkish Contact", msg: "WhatsApp numaranızı alabilir miyim?", lang: "tr" },
    { name: "TEST C - Foreign conversation beginning with ING", msg: "ING", lang: "en" },
    { name: "TEST D - German WhatsApp", msg: "Kann ich Ihre WhatsApp-Nummer bekommen?", lang: "de" },
  ];
  
  for (const tc of testCases) {
    console.log(`\n--- RUNNING ${tc.name} ---`);
    const payload = {
      clinicId,
      message: tc.msg,
      language: tc.lang,
      conversationId: `test_session_${Date.now()}_${Math.random()}`,
      history: []
    };
    
    try {
      const res = await fetch("https://widget.clinicbridge-ai.com/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      console.log(`Payload Language: ${tc.lang}`);
      console.log(`Response: ${data.reply}`);
    } catch (e) {
      console.error(e);
    }
  }
}

run().catch(console.error);
