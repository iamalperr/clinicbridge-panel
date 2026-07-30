const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('official_gokturk.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log("=== Göktürk Branch Info ===");
const addressEl = document.querySelector('.address');
console.log("Address:", addressEl ? addressEl.textContent.trim() : "Not found");

const phoneEl = document.querySelector('a[href^="tel:"]');
console.log("Phone:", phoneEl ? phoneEl.textContent.trim() : "Not found");

const hoursEl = document.querySelectorAll('.opening-hours li');
if (hoursEl.length > 0) {
  console.log("Opening Hours:");
  hoursEl.forEach(el => console.log(" - " + el.textContent.trim()));
} else {
  console.log("Opening Hours: Not found");
}

console.log("\n=== Doctors ===");
const doctorCards = document.querySelectorAll('.doctor-card');
doctorCards.forEach(card => {
  const name = card.querySelector('.doctor-name');
  const title = card.querySelector('.doctor-title');
  console.log(`- ${name ? name.textContent.trim() : 'Unknown Name'} (${title ? title.textContent.trim() : 'Unknown Title'})`);
});

const contentEls = document.querySelectorAll('.branch-content p');
console.log("\n=== Content ===");
contentEls.forEach(el => console.log(el.textContent.trim()));
