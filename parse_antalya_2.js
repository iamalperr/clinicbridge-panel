const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('antalya.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const d1 = text.indexOf('Halit Kök');
const d2 = text.indexOf('Fethiye Çağlar Özşahin');
const d3 = text.indexOf('Ali Alper Cander');

console.log("D1:", text.substring(d1, d1 + 600));
console.log("D2:", text.substring(d2, d2 + 600));
console.log("D3:", text.substring(d3, d3 + 600));
