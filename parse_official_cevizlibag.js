const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('official_cevizlibag.html', 'utf8');
const $ = cheerio.load(html);

console.log("TEXT START:");
console.log($('body').text().replace(/\s+/g, ' ').substring(0, 1500));

console.log("\nDOCTOR NAMES:");
// In Hospitadent site, doctors usually are in some specific class or div. Let's just find h3, h4 or class names containing doctor.
$('h3, h4, .doctor-name, .title').each((i, el) => {
    const text = $(el).text().trim();
    if(text) console.log(text);
});

console.log("\nADDRESS & HOURS:");
console.log($('footer').text().replace(/\s+/g, ' ').substring(0, 500));

const contactInfo = $('.contact-info, .address, .hours').text().replace(/\s+/g, ' ');
if(contactInfo) console.log("Contact info:", contactInfo);
