const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('official_gokturk.html', 'utf8');
const $ = cheerio.load(html);

console.log("=== Göktürk Doctors ===");

let doctors = [];
$('.dentist-card, .doctor, .card, .elementor-widget-container').each((i, el) => {
  const text = $(el).text().trim();
  if (text.includes('Dr.') || text.includes('Dt.') || text.includes('Uzm.')) {
     // try to find h3 or h4
     let name = $(el).find('h2, h3, h4, h5, .elementor-heading-title').text().trim();
     if(name && (name.includes('Dr.') || name.includes('Dt.') || name.includes('Uzm.'))) {
         let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
         doctors.push(lines.slice(0, 3).join(' | '));
     }
  }
});

if (doctors.length === 0) {
    // Brute force
    $('h1, h2, h3, h4, h5, p, span, div').each((i, el) => {
        let t = $(el).text().trim();
        if ((t.startsWith('Dr. ') || t.startsWith('Dt. ') || t.startsWith('Uzm.')) && t.length < 50) {
            doctors.push(t);
        }
    });
}

console.log([...new Set(doctors)].join('\n'));
