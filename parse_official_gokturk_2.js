const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('official_gokturk.html', 'utf8');
const $ = cheerio.load(html);

console.log("=== Göktürk Branch Info ===");

const title = $('h1').text().trim();
console.log("Title:", title);

// Often the address is in a specific div or section. Let's look for text containing Göktürk or Eyüpsultan
const textNodes = $('p, span, div, a').map((i, el) => $(el).text().trim()).get();
const address = textNodes.find(t => t.includes('Eyüpsultan') || t.includes('Göktürk Merkez'));
console.log("Found Address Text:", address ? address : "Not found");

const phoneEl = $('a[href^="tel:"]').first();
console.log("Phone:", phoneEl.length ? phoneEl.text().trim() : "Not found");

// Looking for doctors
console.log("\n=== Doctors ===");
// Sometimes doctors are in an h3, h4, or a specific class
$('.doctor-card, .team-member, .staff-member').each((i, el) => {
  const name = $(el).find('h3, h4, .name').text().trim();
  const spec = $(el).find('.specialty, .title, p').text().trim();
  console.log(`- ${name} (${spec})`);
});
// Let's just find anything that says "Dt." or "Dr."
console.log("\n--- Finding anything that looks like a doctor ---");
const docTexts = textNodes.filter(t => t.startsWith('Dt. ') || t.startsWith('Dr. ') || t.startsWith('Uzm.'));
console.log([...new Set(docTexts)].join('\n'));

console.log("\n=== Content ===");
$('p').each((i, el) => {
  const txt = $(el).text().trim();
  if (txt.length > 50) {
    console.log(txt);
  }
});
