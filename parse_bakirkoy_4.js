const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('bakirkoy.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const hStart = text.indexOf('Clinic Hours:');
console.log(text.substring(hStart, hStart + 300));
