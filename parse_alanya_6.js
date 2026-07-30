const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('alanya.html', 'utf8');
const $ = cheerio.load(html);

$('h4').each((i, el) => {
  const name = $(el).text().trim();
  if (['Gülten Sinanoğlu', 'Serranur Durmuş', 'Ali Sinanoğlu'].includes(name)) {
    console.log("DOCTOR:", name);
    // Go up to the parent card and extract all p tags
    const parent = $(el).closest('.teamCard, .border-light, .rounded-4');
    // or just the container div
    let current = $(el).parent();
    while (current.length && current.find('p').length === 0 && current.text().length < 100) {
      current = current.parent();
    }
    
    current.find('p, li').each((j, p) => {
      console.log($(p).text().replace(/\s+/g, ' ').trim());
    });
    console.log('---');
  }
});
