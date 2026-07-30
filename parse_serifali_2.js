const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('serifali.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const d1 = text.indexOf('Zeynep Beyza Kırıştıoğlu');
const d2 = text.indexOf('Esra Melike Akdoğan');

console.log("D1:", text.substring(d1, d1 + 600));
console.log("D2:", text.substring(d2, d2 + 600));

console.log("\nTEXT CONTINUED:");
const overviewStart = text.indexOf('We aim to pro');
console.log(text.substring(overviewStart, overviewStart + 1000));
