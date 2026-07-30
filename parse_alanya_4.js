const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

console.log("ALL TABLES:");
$('table').each((i, table) => {
  $(table).find('tr').each((j, tr) => {
    const row = [];
    $(tr).find('td').each((k, td) => row.push($(td).text().trim()));
    if(row.length > 0) console.log(row.join(' | '));
  });
});

console.log("\nALL DOCTORS/TEAM:");
$('.teamCard__content').each((i, el) => {
    console.log($(el).text().replace(/\s+/g, ' ').trim());
});
