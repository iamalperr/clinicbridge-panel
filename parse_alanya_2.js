const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

console.log($('body').text().replace(/\s+/g, ' ').substring(0, 2000));
