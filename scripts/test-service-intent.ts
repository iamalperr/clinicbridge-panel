import fetch from "node-fetch";

async function run() {
  const clinicId = "ByTnY4VEmBTJxogqCQ7q"; // Istanbul Dis Akademisi
  
  const payload = {
    clinicId,
    message: "Hizmetleriniz nelerdir?",
    language: "tr",
    conversationId: "test_session_123",
    history: []
  };
  
  console.log("Sending query:", payload.message);
  
  const start = Date.now();
  const res = await fetch("http://localhost:3000/api/public/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  const time = Date.now() - start;
  
  console.log(`\nTime: ${time}ms`);
  console.log("Response Type:", data.responseType);
  console.log("Success:", data.success);
  console.log("\n--- LLM REPLY ---");
  console.log(data.reply);
  console.log("-----------------");
  
  if (data.reply.includes("doğrulayamıyorum") || data.reply.includes("Bilinmeyen durum")) {
    console.error("\n❌ TEST FAILED: Escalation fallback triggered.");
    process.exit(1);
  } else {
    console.log("\n✅ TEST PASSED: LLM provided an aggregated response.");
  }
}

run().catch(console.error);
