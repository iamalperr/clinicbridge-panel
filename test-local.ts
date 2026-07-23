import * as http from "http";

const data = JSON.stringify({
  messages: [{ role: "user", content: "Doktorlarınız kimlerdir?" }],
  clinicId: "ByTnY4VEmBTJxogqCQ7q",
  previewMode: true
});

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/public/chat",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "Referer": "http://localhost:3000/agency-demo/medicalcenter/hospitadent-dental-group",
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
