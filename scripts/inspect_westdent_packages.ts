import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("westdent_source.html", "utf8");
const $ = cheerio.load(html);

const packages: any[] = [];
$(".package-card, .promotion-item, [class*='package'], [class*='promotion']").each((i, el) => {
    packages.push($(el).text().replace(/\s+/g, ' ').trim());
});

console.log("Packages Count:", packages.length);
if (packages.length > 0) {
    console.log("Packages (sample):", packages.slice(0, 3));
}
