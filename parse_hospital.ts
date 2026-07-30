import fs from 'fs';
import * as cheerio from 'cheerio';

const htmlPath = '/Users/yusufalperozgul/.gemini/antigravity-ide/brain/ee0eeea9-5716-4b2d-9b66-dac4cc390aab/.system_generated/steps/7623/content.md';
let html = fs.readFileSync(htmlPath, 'utf8');
const docIndex = html.indexOf('<!DOCTYPE html>');
if (docIndex > -1) {
    html = html.substring(docIndex);
}

const $ = cheerio.load(html);

const data: any = { prices: [], doctors: [] };

$('table.table-4 tbody tr').each((_, el) => {
    const tds = $(el).find('td');
    if (tds.length >= 3) {
        const name = $(tds[0]).text().trim();
        const priceText = $(tds[1]).text().trim();
        const duration = $(tds[2]).text().trim();
        
        const priceMatch = priceText.match(/([\d.]+)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        
        data.prices.push({
            name,
            price,
            currency: 'EUR',
            duration,
            type: 'source_average' // explicitly requested
        });
    }
});

$('div.hotelsCard__content').each((_, el) => {
    const span = $(el).find('h4.hotelsCard__title span');
    if (span.length) {
        const fullText = span.text().trim();
        const parts = fullText.split(',');
        const name = parts[0].trim();
        let specialty = 'Dentist';
        if (parts.length > 1) {
            specialty = parts.slice(1).join(',').trim();
        }
        data.doctors.push({
            fullName: name,
            specialty: specialty
        });
    }
});

console.log(JSON.stringify(data, null, 2));
