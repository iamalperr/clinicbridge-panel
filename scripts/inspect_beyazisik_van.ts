import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("beyazisik_van_source.html", "utf8");
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

const prices: any[] = [];
$("table tr").each((i, el) => {
    const tds = $(el).find("td");
    if (tds.length >= 2) {
        prices.push({
            name: $(tds[0]).text().replace(/\s+/g, " ").trim(),
            price: $(tds[1]).text().replace(/\s+/g, " ").trim(),
            duration: $(tds[2]).text().replace(/\s+/g, " ").trim(),
        });
    }
});
console.log("Prices in tables Count:", prices.length);
console.log("Sample prices:", prices.slice(0, 5));

const doctors: any[] = [];
$("h4").each((i, el) => {
  const text = $(el).text().replace(/\s+/g, " ").trim();
  if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
      doctors.push(text);
  }
});
console.log("Doctors Count:", doctors.length);
console.log("Doctors:", doctors);
