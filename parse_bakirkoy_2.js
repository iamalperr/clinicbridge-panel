const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('bakirkoy.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const d1 = text.indexOf('Esad Taha');
const d2 = text.indexOf('Melike Baygın Durak');
const d3 = text.indexOf('Yağmur Ünlü');
const d4 = text.indexOf('Ayça Tenli Kurt');

console.log("D1:", text.substring(d1, d1 + 600));
console.log("D2:", text.substring(d2, d2 + 600));
console.log("D3:", text.substring(d3, d3 + 600));
console.log("D4:", text.substring(d4, d4 + 600));

console.log("\nTEXT CONTINUED:");
const overviewStart = text.indexOf('experienced team of dental professionals');
console.log(text.substring(overviewStart, overviewStart + 1000));
