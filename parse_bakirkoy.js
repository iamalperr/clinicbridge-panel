const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('bakirkoy.html', 'utf8');
const $ = cheerio.load(html);

console.log("ALL TABLES:");
$('table').each((i, table) => {
  $(table).find('tr').each((j, tr) => {
    const row = [];
    $(tr).find('td').each((k, td) => row.push($(td).text().trim()));
    if(row.length > 0) console.log(row.join(' | '));
  });
});

console.log("\nDOCTOR NAMES:");
$('h4').each((i, el) => {
  console.log($(el).text().trim());
});

console.log("\nTEXT START:");
console.log($('body').text().replace(/\s+/g, ' ').substring(0, 1500));
