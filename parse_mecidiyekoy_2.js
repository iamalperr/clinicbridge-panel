const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('mecidiyekoy.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const d1 = text.indexOf('Ebru Hattatoğlu');
const d2 = text.indexOf('İsmail Eser Bolat');
const d3 = text.indexOf('Berk Aksoy');
const d4 = text.indexOf('Yiğit Emrah Kurt');

console.log("D1:", text.substring(d1, d1 + 600));
console.log("D2:", text.substring(d2, d2 + 600));
console.log("D3:", text.substring(d3, d3 + 600));
console.log("D4:", text.substring(d4, d4 + 600));

console.log("\nTEXT CONTINUED:");
const overviewStart = text.indexOf('Bonding Applicati');
console.log(text.substring(overviewStart, overviewStart + 1000));
