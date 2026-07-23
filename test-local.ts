import * as https from "https";

const data = JSON.stringify({
  messages: [{ role: "user", content: "Doktorlarınız kimlerdir?" }],
  clinicId: "ByTnY4VEmBTJxogqCQ7q",
  previewMode: true
});

const req = https.request(
  {
    hostname: "app.clinicbridge-ai.com",
    port: 443,
    path: "/api/public/chat",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
      "Referer": "https://app.clinicbridge-ai.com/agency-demo/medicalcenter/hospitadent-dental-group",
    },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => console.log("CHAT:", body));
  }
);
req.write(data);
req.end();
