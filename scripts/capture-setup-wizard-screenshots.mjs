/**
 * Captures 390px + 1440px screenshots of the setup wizard fixture.
 * Requires: npm run build && NEXT_PUBLIC_SETUP_FIXTURE=1 npm run start -- -p 3012
 * Then: node scripts/capture-setup-wizard-screenshots.mjs
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const BASE = process.env.SETUP_FIXTURE_URL || "http://127.0.0.1:3012";
const OUT = resolve("tests/screenshots/setup-wizard");

const shots = [
  { name: "step0-empty-390", path: "/setup-wizard-fixture?empty=1&step=0", width: 390, height: 844 },
  { name: "step0-filled-390", path: "/setup-wizard-fixture?step=0", width: 390, height: 844 },
  { name: "step0-add-sheet-390", path: "/setup-wizard-fixture?empty=1&step=0&editor=treatment", width: 390, height: 844 },
  { name: "step0-edit-sheet-390", path: "/setup-wizard-fixture?step=0&editor=edit", width: 390, height: 844 },
  { name: "step1-390", path: "/setup-wizard-fixture?step=1", width: 390, height: 844 },
  { name: "step2-390", path: "/setup-wizard-fixture?step=2", width: 390, height: 844 },
  { name: "step0-filled-1440", path: "/setup-wizard-fixture?step=0", width: 1440, height: 900 },
  { name: "step1-1440", path: "/setup-wizard-fixture?step=1", width: 1440, height: 900 },
  { name: "step2-1440", path: "/setup-wizard-fixture?step=2", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  for (const shot of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector("h1", { timeout: 15000 });
    if (shot.path.includes("editor=")) {
      await page.waitForFunction(
        () => !!document.querySelector('[role="dialog"]') || !!document.querySelector("h2"),
        { timeout: 5000 }
      ).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
    }
    const file = resolve(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", file);
    await page.close();
  }
} finally {
  await browser.close();
}
