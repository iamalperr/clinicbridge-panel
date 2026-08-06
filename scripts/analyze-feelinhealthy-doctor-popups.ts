/**
 * Read-only probe: what does each FeelinHealthy doctor pop-up actually expose?
 *
 * Prints, per clinic, the distinct field labels found inside the doctor pop-up
 * (div.langMenu[data-x^="doctorPopup"]) plus a sample doctor, so we can tell
 * exactly where specialty information lives before backfilling anything.
 *
 * Usage: npx tsx scripts/analyze-feelinhealthy-doctor-popups.ts
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";

const SLUGS = [
  "hospitadent-dental-group-camlica",
  "yeditepe-university-dental-hospital",
  "hospitadent-dental-group-pendik",
  "hospitadent-dental-group-serifali",
  "lokman-hekim-istanbul-hospital",
  "beyazisik-sancaktepe-dental-group",
  "istanbul-dis-akademisi",
  "intermed-health-group--kadikoy",
  "hospitadent-dental-group-bakirkoy",
  "beyazisik-basaksehir-dental-group",
  "bht-clinic-istanbul-tema-hastanesi",
  "orion-surgery-center",
  "hospitadent-dental-group-bagcilar",
  "hospitadent-dental-group-fatih",
  "hospitadent-dental-group-mecidiyekoy",
  "beyazisik-izmir-dental-group",
  "westdent-clinic",
  "ozel-ilke-agiz-ve-dis-sagligi-poliklinigi",
  "hospitadent-dental-group-antalya",
  "memorial-hospital",
  "hospitadent-dental-group-bodrum",
  "beyazisik-marmaris-dental-group",
  "beyazisik-kocaeli-dental-group",
  "hospitadent-dental-group-ankara",
  "lokman-hekim-akay-hospital",
  "lokman-hekim-university-ankara-hospital",
  "hospitadent-dental-group-kayseri",
  "beyazisik-van-dental-group",
  "anadolu-medical-center",
  "neur-on-clinic",
  "intermed-health-group-nisantasi",
  "dunyagoz-hospitals-group-etiler",
  "dunyagoz-atakoy",
  "dunyagoz-antalya",
  "hospitadent-dental-group-alanya",
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function fetchHtml(url: string): Promise<string | null> {
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

async function run() {
  const globalLabels = new Map<string, number>();
  const withSpecialtyLike: string[] = [];

  for (const slug of SLUGS) {
    const html = await fetchHtml(`https://feelinhealthy.com/medicalcenter/${slug}`);
    if (!html) {
      console.log(`\n### ${slug}\n  FETCH FAILED`);
      continue;
    }
    const $ = cheerio.load(html);
    const pops = $('div.langMenu[data-x^="doctorPopup"]');

    // Bold headings inside a pop-up are the field labels.
    const labels = new Map<string, number>();
    pops.each((_i, el) => {
      $(el)
        .find(".text-18.fw-500, .fw-500, strong, b, h5, h6")
        .each((_j, lab) => {
          const t = clean($(lab).text());
          if (!t || t.length > 40) return;
          labels.set(t, (labels.get(t) || 0) + 1);
          globalLabels.set(t, (globalLabels.get(t) || 0) + 1);
        });
    });

    // Card titles sometimes carry the specialty inline (after a comma or slash).
    const cardTitles: string[] = [];
    $("a[data-x-click^='doctorPopup'] h4").each((_i, el) => {
      const t = clean($(el).text());
      if (t) cardTitles.push(t);
    });

    const labelList = Array.from(labels.keys()).sort();
    const specialtyish = labelList.filter((l) =>
      /special|department|branch|uzman|bölüm|title|position|expert/i.test(l)
    );
    if (specialtyish.length) withSpecialtyLike.push(`${slug}: ${specialtyish.join(", ")}`);

    console.log(`\n### ${slug}`);
    console.log(`  popups: ${pops.length} | cards: ${cardTitles.length}`);
    console.log(`  popup labels: [${labelList.join(" | ")}]`);
    if (cardTitles.length) {
      console.log(`  sample card titles:`);
      cardTitles.slice(0, 3).forEach((t) => console.log(`    - ${t}`));
    }
    if (pops.length) {
      console.log(`  sample popup text: ${clean(pops.first().text()).slice(0, 220)}`);
    }
  }

  console.log("\n\n=== GLOBAL POPUP LABELS (label → occurrences) ===");
  Array.from(globalLabels.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([l, c]) => console.log(`  ${c.toString().padStart(4)}  ${l}`));

  console.log("\n=== CLINICS WITH SPECIALTY-LIKE LABELS ===");
  console.log(withSpecialtyLike.length ? withSpecialtyLike.join("\n") : "  (none)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
