import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("lokman_hekim_university_ankara_source.html", "utf8");
const $ = cheerio.load(html);

console.log("TITLE:", $("title").text().trim());
console.log("H1:", $("h1").text().trim() || $(".title").text().trim());

const overviewHeader = $("h3:contains('Overview')");
let overviewTextRaw = "";
if (overviewHeader.length > 0) {
    let curr = overviewHeader.next();
    const overviewTexts: string[] = [];
    while (curr.length > 0 && curr.prop("tagName") !== "H3" && curr.prop("tagName") !== "H2") {
        const text = curr.text().trim();
        if (text) {
            overviewTexts.push(text.replace(/\s+/g, " "));
        }
        curr = curr.next();
    }
    overviewTextRaw = overviewTexts.join(" ");
}
console.log("OVERVIEW LENGTH:", overviewTextRaw.length);

const categories: string[] = [];
$(".category-item, h2, h3").each((i, el) => {
    const txt = $(el).text().trim();
    if (txt) categories.push(txt);
});
console.log("Headings/Categories:", categories.slice(0, 15));

const doctors: any[] = [];
$("h4").each((i, el) => {
  const text = $(el).text().replace(/\s+/g, " ").trim();
  if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
      doctors.push(text);
  }
});
console.log("Doctors Count:", doctors.length);
console.log("Doctors:", doctors.slice(0, 10));

const prices: any[] = [];
$("table tr").each((i, el) => {
    prices.push($(el).text().replace(/\s+/g, " ").trim());
});
console.log("Prices in tables Count:", prices.length);
