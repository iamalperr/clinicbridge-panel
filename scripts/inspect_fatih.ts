import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("fatih_source.html", "utf8");
const $ = cheerio.load(html);

const overviewHeader = $("h3:contains('Overview')");
if (overviewHeader.length > 0) {
    let curr = overviewHeader.next();
    const overviewTexts: string[] = [];
    while (curr.length > 0 && curr.prop("tagName") !== "H3") {
        const text = curr.text().trim();
        if (text) {
            overviewTexts.push(text.replace(/\s+/g, " "));
        }
        curr = curr.next();
    }
    console.log("OVERVIEW TEXT:", overviewTexts.join("\n"));
}
