async function run() {
  const apiKey = process.env.RESEND_API_KEY || "re_dummykey123";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "no-reply@clinicbridge-ai.com",
      to: ["onur@hotmail.com"],
      subject: "Test",
      html: "<p>Test</p>",
    }),
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Data:", data);
}
run();
