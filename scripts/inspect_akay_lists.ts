import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("lokman_hekim_akay_source.html", "utf8");
const $ = cheerio.load(html);

const listItems: string[] = [];
$("li").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) listItems.push(text);
});
console.log("List items count:", listItems.length);
console.log("Sample list items:", listItems.slice(0, 10));

const servicesDivs = $(".services-list, .treatments-list, .departments");
console.log("Found services divs:", servicesDivs.length);
