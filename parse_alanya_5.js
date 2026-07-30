const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

const h4s = [];
$('h4').each((i, el) => {
  h4s.push($(el).text().trim());
});
console.log('H4s:', h4s);

const h5s = [];
$('h5').each((i, el) => {
  h5s.push($(el).text().trim());
});
console.log('H5s:', h5s);
