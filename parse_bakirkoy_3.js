const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('bakirkoy.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const overviewStart = text.indexOf('experienced team of dental professionals');
console.log(text.substring(overviewStart, overviewStart + 2000));
