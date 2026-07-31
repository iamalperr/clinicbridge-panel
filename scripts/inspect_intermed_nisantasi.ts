import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("intermed_nisantasi_source.html", "utf8");
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
        const name = $(tds[0]).text().replace(/\s+/g, " ").trim();
        const price = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const duration = $(tds[2]).text().replace(/\s+/g, " ").trim();
        if (name && price) {
            prices.push({ name, price, duration });
        }
    }
});

let oneEurCount = 0;
let packagePricesCount = 0;

prices.forEach(p => {
    if (p.price === "1.00€") oneEurCount++;
    else if (p.price !== "Price") packagePricesCount++;
});

console.log(`Total table rows: ${prices.length}`);
console.log(`1.00 EUR rows: ${oneEurCount}`);
console.log(`Real priced rows: ${packagePricesCount}`);
if (packagePricesCount > 0) {
    console.log("Sample Real Prices:", prices.filter(p => p.price !== "1.00€" && p.price !== "Price").slice(0, 5));
}

const doctors: any[] = [];
$("h4").each((i, el) => {
  const text = $(el).text().replace(/\s+/g, " ").trim();
  if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
      doctors.push(text);
  }
});
console.log("Doctors Count:", doctors.length);
if (doctors.length > 0) {
    console.log("Sample Doctors:", doctors.slice(0, 3));
}
