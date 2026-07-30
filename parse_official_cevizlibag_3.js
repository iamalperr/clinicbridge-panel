const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('official_cevizlibag.html', 'utf8');
const $ = cheerio.load(html);

const text = $('body').text().replace(/\s+/g, ' ');
const idx = text.indexOf('Burada amacımız, sizleri teknik detay');
if (idx > -1) {
    console.log(text.substring(idx, idx + 2000));
}
