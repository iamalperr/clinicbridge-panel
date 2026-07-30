const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

const treatments = [];
const prices = [];
const doctors = [];
let hours = '';

$('h3').each((i, el) => {
  const text = $(el).text().trim();
  if (text === 'Treatments') {
    $(el).parent().find('a').each((i, a) => {
      treatments.push($(a).text().trim());
    });
  }
});

// Extract prices from price tables
$('.y-gap-30.pt-20 tr').each((i, tr) => {
  const tds = $(tr).find('td');
  if (tds.length >= 3) {
    const treatment = $(tds[0]).text().trim();
    const duration = $(tds[1]).text().trim();
    const price = $(tds[2]).text().trim();
    if (treatment && price) {
      prices.push({ treatment, duration, price });
    }
  }
});

// Extract doctors
$('.teamCard').each((i, el) => {
  const name = $(el).find('.text-18.lh-15').text().trim();
  const info = [];
  $(el).find('p').each((j, p) => info.push($(p).text().trim()));
  doctors.push({ name, info });
});

console.log(JSON.stringify({ treatments, prices, doctors }, null, 2));
