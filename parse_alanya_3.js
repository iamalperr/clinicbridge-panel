const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

console.log("PRICES:");
$('table').first().find('tr').each((i, tr) => {
  const tds = $(tr).find('td');
  if (tds.length > 1) {
    const row = [];
    tds.each((j, td) => row.push($(td).text().trim()));
    console.log(row.join(' | '));
  }
});

console.log("\nDOCTORS:");
$('*').filter(function() {
  return $(this).text().trim() === 'Our Medical Staff';
}).parent().parent().find('.col-md-6').each((i, el) => {
    console.log($(el).text().replace(/\s+/g, ' ').trim());
});
