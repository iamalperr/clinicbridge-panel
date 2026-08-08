/**
 * Sync FeelinHealthy medicalcenter profile prices → agency clinic pricing tab,
 * and services → AI Bilgi Havuzu (knowledgeBase).
 *
 * Usage:
 *   npx tsx scripts/sync-feelinhealthy-prices-services.ts           # dry-run
 *   npx tsx scripts/sync-feelinhealthy-prices-services.ts --apply   # write
 *
 * Safe defaults:
 * - dry-run unless --apply
 * - never deletes clinics
 * - replaces only pricing rows tagged with the same sourceUrl
 * - upserts KB docs by stable title keys
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { getAdminDb } from "../lib/firebase-admin";
import * as admin from "firebase-admin";
import { parsePricesAndServices } from "./utils/browserParser";
import { indexKnowledgeDocument } from "../lib/services/knowledgeDocumentIndexing";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";

const SOURCE_URLS = [
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-camlica",
  "https://feelinhealthy.com/medicalcenter/yeditepe-university-dental-hospital",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-pendik",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-serifali",
  "https://feelinhealthy.com/medicalcenter/lokman-hekim-istanbul-hospital",
  "https://feelinhealthy.com/medicalcenter/beyazisik-sancaktepe-dental-group",
  "https://feelinhealthy.com/medicalcenter/istanbul-dis-akademisi",
  "https://feelinhealthy.com/medicalcenter/intermed-health-group--kadikoy",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bakirkoy",
  "https://feelinhealthy.com/medicalcenter/beyazisik-basaksehir-dental-group",
  "https://feelinhealthy.com/medicalcenter/bht-clinic-istanbul-tema-hastanesi",
  "https://feelinhealthy.com/medicalcenter/orion-surgery-center",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bagcilar",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-fatih",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-mecidiyekoy",
  "https://feelinhealthy.com/medicalcenter/beyazisik-izmir-dental-group",
  "https://feelinhealthy.com/medicalcenter/westdent-clinic",
  "https://feelinhealthy.com/medicalcenter/ozel-ilke-agiz-ve-dis-sagligi-poliklinigi",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-antalya",
  "https://feelinhealthy.com/medicalcenter/memorial-hospital",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bodrum",
  "https://feelinhealthy.com/medicalcenter/beyazisik-marmaris-dental-group",
  "https://feelinhealthy.com/medicalcenter/beyazisik-kocaeli-dental-group",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-ankara",
  "https://feelinhealthy.com/medicalcenter/lokman-hekim-akay-hospital",
  "https://feelinhealthy.com/medicalcenter/lokman-hekim-university-ankara-hospital",
  "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-kayseri",
  "https://feelinhealthy.com/medicalcenter/beyazisik-van-dental-group",
  "https://feelinhealthy.com/medicalcenter/anadolu-medical-center",
  "https://feelinhealthy.com/medicalcenter/neur-on-clinic",
  "https://feelinhealthy.com/medicalcenter/intermed-health-group-nisantasi",
  "https://feelinhealthy.com/medicalcenter/dunyagoz-hospitals-group-etiler",
  "https://feelinhealthy.com/medicalcenter/dunyagoz-atakoy",
  "https://feelinhealthy.com/medicalcenter/dunyagoz-antalya",
];

// Slug aliases when Firestore clinicSlug differs from URL path
const SLUG_ALIASES: Record<string, string[]> = {
  "yeditepe-university-dental-hospital": [
    "yeditepe-university-dental-hospital",
    "yeditepe-dental-hospital",
  ],
  "neur-on-clinic": ["neur-on-clinic", "neuron-clinic", "neur-on"],
  "intermed-health-group--kadikoy": [
    "intermed-health-group--kadikoy",
    "intermed-health-group-kadikoy",
    "intermed-kadikoy",
  ],
  "bht-clinic-istanbul-tema-hastanesi": [
    "bht-clinic-istanbul-tema-hastanesi",
    "bht-clinic-istanbul-tema",
  ],
  "ozel-ilke-agiz-ve-dis-sagligi-poliklinigi": [
    "ozel-ilke-agiz-ve-dis-sagligi-poliklinigi",
    "ozel-ilke",
  ],
  "lokman-hekim-akay-hospital": [
    "lokman-hekim-akay-hospital",
    "lokman-hekim-akay",
  ],
  "lokman-hekim-university-ankara-hospital": [
    "lokman-hekim-university-ankara-hospital",
    "lokman-hekim-university-ankara",
  ],
  "dunyagoz-hospitals-group-etiler": [
    "dunyagoz-hospitals-group-etiler",
    "dunyagoz-etiler",
  ],
};

type PriceRow = {
  treatmentName: string;
  priceGroup: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  duration?: string;
};

type ParsedClinicPage = {
  url: string;
  slug: string;
  h1: string;
  overview: string;
  servicesFromOverview: string[];
  prices: PriceRow[];
  hasPriceSection: boolean;
};

function slugFromUrl(url: string): string {
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "";
}

function normalizeKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchHtml(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent":
            "Mozilla/5.0 (compatible; ClinicBridgeSync/1.0; +https://clinicbridge.ai)",
        },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastErr;
}

function parsePriceAmount(raw: string): { amount: number; currency: string } | null {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text || /^price$/i.test(text)) return null;
  const currency = /€|eur/i.test(text)
    ? "EUR"
    : /\$|usd/i.test(text)
      ? "USD"
      : /£|gbp/i.test(text)
        ? "GBP"
        : /₺|try|tl/i.test(text)
          ? "TRY"
          : "EUR";
  // "1.250,00€" or "1250.00€" or "1,250.00"
  let cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // European: 1.250,00 → 1250.00
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  }
  const amount = parseFloat(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

function extractOverviewServices($: cheerio.CheerioAPI): string[] {
  const services: string[] = [];
  const overviewHeader = $("h3, h2")
    .filter((_, el) => /overview|genel bakış|hakkında/i.test($(el).text()))
    .first();
  if (!overviewHeader.length) return services;

  let curr = overviewHeader.next();
  while (curr.length && !/^H[1-3]$/i.test(curr.prop("tagName") || "")) {
    // bullet-like short lines that look like treatment names
    const text = curr.text().replace(/\s+/g, " ").trim();
    if (
      text &&
      text.length >= 3 &&
      text.length <= 80 &&
      !/clinic hours|monday|opened in|spanning|whether you're|ideally located|discover exceptional|to support international/i.test(
        text
      ) &&
      (/implant|crown|veneer|whitening|x-ray|tomography|bonding|laminate|denture|smile|laser|root|sinus|graft|anesthesia|sedation|cleaning|ortodon|saç|hair|göz|eye|lasik|cataract|rhino|meme|breast|lipo/i.test(
        text
      ) ||
        curr.is("li") ||
        curr.find("li").length > 0)
    ) {
      if (curr.find("li").length) {
        curr.find("li").each((_, li) => {
          const t = $(li).text().replace(/\s+/g, " ").trim();
          if (t && t.length <= 80) services.push(t);
        });
      } else {
        services.push(text);
      }
    }
    curr = curr.next();
  }
  return Array.from(new Set(services));
}

function parseClinicPage(url: string, html: string): ParsedClinicPage {
  const $ = cheerio.load(html);
  const slug = slugFromUrl(url);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();

  // Overview text
  let overview = "";
  const overviewHeader = $("h3, h2")
    .filter((_, el) => /overview|genel bakış/i.test($(el).text()))
    .first();
  if (overviewHeader.length) {
    const chunks: string[] = [];
    let curr = overviewHeader.next();
    while (curr.length && !/^H[1-3]$/i.test(curr.prop("tagName") || "")) {
      const t = curr.text().replace(/\s+/g, " ").trim();
      if (t) chunks.push(t);
      curr = curr.next();
      if (chunks.join(" ").length > 4000) break;
    }
    overview = chunks.join("\n\n").slice(0, 5000);
  }

  const servicesFromOverview = [...extractOverviewServices($)];

  // Prices: walk tables under Prices & Services
  const prices: PriceRow[] = [];
  const hasPriceSection =
    $("h3, h2, h4").filter((_, el) => /prices?\s*(and|&)\s*services|ücret|fiyat/i.test($(el).text()))
      .length > 0;

  let currentGroup = "General";
  // Prefer tables; also capture preceding heading as group
  $("table").each((_, table) => {
    const prevHeading = $(table)
      .prevAll("h4, h3, h2, strong, b")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    // Group name often appears as a first-column header like "İmplant"
    const firstHeaderCell = $(table).find("th, tr").first().text().replace(/\s+/g, " ").trim();
    if (prevHeading && prevHeading.length < 60 && !/price|duration|overview/i.test(prevHeading)) {
      currentGroup = prevHeading;
    }

    $(table)
      .find("tr")
      .each((__, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 2) {
          // header row with group name in first cell sometimes
          const ths = $(tr).find("th");
          if (ths.length >= 1) {
            const maybeGroup = $(ths[0]).text().replace(/\s+/g, " ").trim();
            if (maybeGroup && !/^price$/i.test(maybeGroup) && !/^duration$/i.test(maybeGroup)) {
              if (!/treatment|hizmet/i.test(maybeGroup)) currentGroup = maybeGroup;
            }
          }
          return;
        }
        const name = $(tds[0]).text().replace(/\s+/g, " ").trim();
        const priceRaw = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const duration = tds.length >= 3 ? $(tds[2]).text().replace(/\s+/g, " ").trim() : "";
        if (!name || /^price$/i.test(priceRaw) || /^treatment/i.test(name)) return;

        // Some tables use first column as category header spanning
        const parsed = parsePriceAmount(priceRaw);
        if (!parsed) {
          // If second cell isn't a price, first cell might be category label
          if (!/\d/.test(priceRaw) && name.length < 40) {
            currentGroup = name;
          }
          return;
        }

        // Detect group from nearby caption / first column pattern
        let group = currentGroup;
        // In markdown dump, groups were like | İmplant | Price | Duration | as header
        const headerRow = $(table).find("tr").first();
        const headerFirst = headerRow.find("td, th").first().text().replace(/\s+/g, " ").trim();
        if (headerFirst && !/^price$/i.test(headerFirst) && headerFirst !== name) {
          if (!/duration/i.test(headerFirst) && headerFirst.length < 40) {
            group = headerFirst;
          }
        }

        prices.push({
          treatmentName: name,
          priceGroup: group || "General",
          priceMin: parsed.amount,
          priceMax: parsed.amount,
          currency: parsed.currency,
          duration: duration && !/^duration$/i.test(duration) ? duration : undefined,
        });
      });
  });

  // Deduplicate by treatment name (keep first)
  const seen = new Set<string>();
  const uniquePrices = prices.filter((p) => {
    const k = normalizeKey(p.treatmentName);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Accordion category labels under Prices & Services (often present even when
  // numeric prices are empty / lazy-loaded client-side).
  $(".accordion__item .accordion__button, .accordion__button").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (
      t &&
      t.length >= 3 &&
      t.length <= 100 &&
      !/average costs|get a free quote|book|appointment|doctors/i.test(t)
    ) {
      servicesFromOverview.push(t);
    }
  });

  // Fallback walk: collapsed labels near the Prices & Services heading
  const priceSection = $("h3, h2")
    .filter((_, el) => /prices?\s*(and|&)\s*services|ücret|fiyat/i.test($(el).text()))
    .first();
  if (priceSection.length) {
    let curr = priceSection.next();
    while (curr.length && !/^H[12]$/i.test(curr.prop("tagName") || "")) {
      const t = curr.text().replace(/\s+/g, " ").trim();
      if (
        t &&
        t.length >= 3 &&
        t.length <= 80 &&
        !/average costs|get a free quote|doctors|your health/i.test(t) &&
        !/\d+\.\d{2}\s*€/.test(t)
      ) {
        if (
          /dental|hair|aesthetic|oncology|ivf|cardiology|check-?up|eye|bone marrow|stroke|implant|crown/i.test(
            t
          ) ||
          curr.is("button") ||
          curr.attr("role") === "button"
        ) {
          servicesFromOverview.push(t);
        }
      }
      curr = curr.next();
      if (servicesFromOverview.length > 60) break;
    }
  }

  return {
    url,
    slug,
    h1,
    overview,
    servicesFromOverview: Array.from(new Set(servicesFromOverview)),
    prices: uniquePrices,
    hasPriceSection,
  };
}

async function parseClinicPageWithFallback(url: string): Promise<ParsedClinicPage> {
  const html = await fetchHtml(url);
  let parsed = parseClinicPage(url, html);

  // Only attempt puppeteer when cheerio found a price section but zero rows —
  // skip if we already have accordion service categories (often empty panels).
  if (parsed.prices.length === 0 && parsed.hasPriceSection && parsed.servicesFromOverview.length === 0) {
    console.log(`(cheerio=0 prices, trying puppeteer) `);
    try {
      const browserResult = await parsePricesAndServices(url);
      if (browserResult.rows.length > 0) {
        const categoryServices = Array.from(
          new Set(
            browserResult.rows
              .map((r) => r.sourceCategoryName)
              .filter((n) => n && n !== "Unknown Category")
          )
        );
        parsed = {
          ...parsed,
          prices: browserResult.rows.map((r) => ({
            treatmentName: r.sourceTreatmentName,
            priceGroup: r.sourceCategoryName || "General",
            priceMin: r.numericPrice,
            priceMax: r.numericPrice,
            currency: r.currency || "EUR",
            duration: r.sourceDurationText || undefined,
          })),
          servicesFromOverview: Array.from(
            new Set([...parsed.servicesFromOverview, ...categoryServices])
          ),
          hasPriceSection: true,
        };
      }
    } catch (err: any) {
      console.log(`(puppeteer failed: ${err?.message || err}) `);
    }
  } else if (parsed.prices.length === 0) {
    console.log(`(cheerio=0 prices; accordion services=${parsed.servicesFromOverview.length}, skip puppeteer) `);
  }

  return parsed;
}

type ClinicDoc = {
  id: string;
  clinicSlug?: string;
  clinicName?: string;
  name?: string;
  canonicalSourceUrl?: string;
  profileUrl?: string;
};

function findClinic(
  clinics: ClinicDoc[],
  slug: string,
  url: string
): ClinicDoc | null {
  const aliases = SLUG_ALIASES[slug] || [slug];
  const aliasSet = new Set(aliases.map(normalizeKey));

  for (const c of clinics) {
    const cSlug = normalizeKey(c.clinicSlug || "");
    if (cSlug && aliasSet.has(cSlug)) return c;
    if (c.canonicalSourceUrl === url || c.profileUrl === url) return c;
  }

  // Fuzzy: slug contained in clinicSlug or name
  for (const c of clinics) {
    const cSlug = normalizeKey(c.clinicSlug || "");
    const cName = normalizeKey(c.clinicName || c.name || "");
    for (const a of aliasSet) {
      if (cSlug.includes(a) || a.includes(cSlug) || cName.includes(a.replace(/-/g, ""))) {
        return c;
      }
    }
  }
  return null;
}

async function upsertPricing(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  agencyId: string,
  clinic: ClinicDoc,
  sourceUrl: string,
  rows: PriceRow[],
  apply: boolean
): Promise<{ deleted: number; written: number }> {
  const pricingCol = db
    .collection("agencies")
    .doc(agencyId)
    .collection("clinics")
    .doc(clinic.id)
    .collection("pricing");

  const existing = await pricingCol.get();
  const toDelete = existing.docs.filter((d) => {
    const data = d.data();
    return data.sourceUrl === sourceUrl || data.importBatch === "feelinhealthy-prices-services-sync";
  });

  if (!apply) {
    return { deleted: toDelete.length, written: rows.length };
  }

  // Delete previous sync rows for this source (batched)
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    toDelete.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    const chunk = rows.slice(i, i + 400);
    for (const r of chunk) {
      const ref = pricingCol.doc();
      batch.set(ref, {
        agencyClinicId: clinic.id,
        treatmentName: r.treatmentName,
        subTreatmentName: r.treatmentName,
        treatmentCategoryName: r.priceGroup,
        priceGroup: r.priceGroup,
        priceMin: r.priceMin,
        priceMax: r.priceMax,
        currency: r.currency,
        priceType: "average",
        duration: r.duration || null,
        notes:
          "FeelinHealthy profilindeki ortalama/listelenen fiyattır. Kesin fiyat klinik değerlendirmesi sonrası netleşir.",
        showOnPublicProfile: true,
        allowQuoteRequest: true,
        status: "active",
        sourceUrl,
        importBatch: "feelinhealthy-prices-services-sync",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      written++;
    }
    await batch.commit();
  }

  return { deleted: toDelete.length, written };
}

async function upsertKnowledge(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  agencyId: string,
  clinic: ClinicDoc,
  parsed: ParsedClinicPage,
  apply: boolean
): Promise<{ written: number }> {
  const kbCol = db
    .collection("agencies")
    .doc(agencyId)
    .collection("clinics")
    .doc(clinic.id)
    .collection("knowledgeBase");

  const clinicName = clinic.clinicName || clinic.name || parsed.h1 || parsed.slug;
  const serviceNames = Array.from(
    new Set([
      ...parsed.servicesFromOverview,
      ...parsed.prices.map((p) => p.treatmentName),
    ])
  );

  const docs: Array<{
    title: string;
    category: string;
    content: string;
    priority: "Normal" | "Yüksek";
  }> = [];

  if (serviceNames.length > 0) {
    docs.push({
      title: `${clinicName} Tedaviler ve Hizmetler`,
      category: "Tedaviler",
      priority: "Yüksek",
      content: [
        `${clinicName} için FeelinHealthy profilinden derlenen tedavi/hizmet listesi:`,
        "",
        ...serviceNames.map((s) => `- ${s}`),
        "",
        "Not: Bu liste bilgilendirme amaçlıdır. Uygun tedavi planı klinik değerlendirmesi sonrası belirlenir.",
        `Kaynak: ${parsed.url}`,
      ].join("\n"),
    });
  }

  if (parsed.prices.length > 0) {
    const byGroup = new Map<string, PriceRow[]>();
    for (const p of parsed.prices) {
      const g = p.priceGroup || "General";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(p);
    }
    const lines: string[] = [
      `${clinicName} için FeelinHealthy profilinde listelenen ortalama fiyatlar:`,
      "",
      "Önemli: Bu tutarlar ortalama/listelenen fiyatlardır. Nihai fiyat klinik muayenesi ve değerlendirme sonrası netleşir. Kesin fiyat taahhüdü verilmez.",
      "",
    ];
    for (const [group, rows] of byGroup) {
      lines.push(`## ${group}`);
      for (const r of rows) {
        lines.push(
          `- ${r.treatmentName}: ${r.priceMin} ${r.currency}${r.duration ? ` (${r.duration})` : ""}`
        );
      }
      lines.push("");
    }
    lines.push(`Kaynak: ${parsed.url}`);
    docs.push({
      title: `${clinicName} Fiyatlandırma Notları`,
      category: "Fiyatlandırma Notları",
      priority: "Yüksek",
      content: lines.join("\n"),
    });
  }

  if (parsed.overview && parsed.overview.length > 80) {
    docs.push({
      title: `${clinicName} Klinik Genel Bilgi (FeelinHealthy)`,
      category: "Klinik Genel Bilgi",
      priority: "Normal",
      content: `${parsed.overview}\n\nKaynak: ${parsed.url}`,
    });
  }

  if (!apply) return { written: docs.length };

  let written = 0;
  for (const doc of docs) {
    const existing = await kbCol.where("title", "==", doc.title).limit(1).get();
    const payload = {
      agencyId,
      clinicId: clinic.id,
      title: doc.title,
      category: doc.category,
      language: "TR",
      content: doc.content,
      isActive: true,
      priority: doc.priority,
      sourceUrl: parsed.url,
      importBatch: "feelinhealthy-prices-services-sync",
      // Mark indexing in progress; never leave permanent pending without a job.
      embedding_status: "indexing",
      last_error: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    let ref: admin.firestore.DocumentReference;
    if (existing.empty) {
      ref = await kbCol.add({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      ref = existing.docs[0].ref;
      await ref.set(payload, { merge: true });
    }

    const indexResult = await indexKnowledgeDocument(db, ref.path);
    if (!indexResult.ok) {
      console.warn(`  KB index failed [${doc.title}]: ${indexResult.error}`);
    }
    written++;
  }
  return { written };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`=== FeelinHealthy Prices & Services Sync [${apply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB not initialized. Check .env.local Firebase Admin credentials.");
    process.exit(1);
  }

  const clinicsSnap = await db.collection("agencies").doc(AGENCY_ID).collection("clinics").get();
  const clinics: ClinicDoc[] = clinicsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));
  console.log(`Agency clinics loaded: ${clinics.length}`);
  console.log(`Source URLs: ${SOURCE_URLS.length} (deduped from user list)\n`);

  const summary: Array<Record<string, unknown>> = [];
  let matched = 0;
  let unmatched = 0;
  let totalPrices = 0;
  let totalKb = 0;

  for (const url of SOURCE_URLS) {
    const slug = slugFromUrl(url);
    process.stdout.write(`→ ${slug} ... `);
    try {
      const parsed = await parseClinicPageWithFallback(url);
      const clinic = findClinic(clinics, slug, url);

      if (!clinic) {
        unmatched++;
        console.log(`UNMATCHED (h1="${parsed.h1}", prices=${parsed.prices.length})`);
        summary.push({
          slug,
          status: "unmatched",
          h1: parsed.h1,
          prices: parsed.prices.length,
          services: parsed.servicesFromOverview.length,
        });
        continue;
      }

      matched++;
      const pricingResult = await upsertPricing(
        db,
        AGENCY_ID,
        clinic,
        url,
        parsed.prices,
        apply
      );
      const kbResult = await upsertKnowledge(db, AGENCY_ID, clinic, parsed, apply);
      totalPrices += parsed.prices.length;
      totalKb += kbResult.written;

      console.log(
        `OK clinic=${clinic.clinicName || clinic.id} prices=${parsed.prices.length} (del ${pricingResult.deleted} → write ${pricingResult.written}) kb=${kbResult.written}`
      );
      summary.push({
        slug,
        status: "ok",
        clinicId: clinic.id,
        clinicName: clinic.clinicName,
        prices: parsed.prices.length,
        priceGroups: Array.from(new Set(parsed.prices.map((p) => p.priceGroup))),
        services: Array.from(
          new Set([...parsed.servicesFromOverview, ...parsed.prices.map((p) => p.treatmentName)])
        ).length,
        kbDocs: kbResult.written,
        samplePrices: parsed.prices.slice(0, 3).map((p) => `${p.treatmentName}: ${p.priceMin}${p.currency}`),
      });
    } catch (err: any) {
      console.log(`ERROR ${err?.message || err}`);
      summary.push({ slug, status: "error", error: String(err?.message || err) });
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Total price rows extracted: ${totalPrices}`);
  console.log(`Total KB docs upserted/planned: ${totalKb}`);
  console.log(`Mode: ${apply ? "APPLY (writes committed)" : "DRY-RUN (no writes)"}`);

  const unmatchedRows = summary.filter((s) => s.status === "unmatched");
  if (unmatchedRows.length) {
    console.log("\nUnmatched clinics:");
    for (const u of unmatchedRows) console.log(` - ${u.slug} (h1: ${u.h1})`);
  }

  const zeroPrice = summary.filter((s) => s.status === "ok" && Number(s.prices) === 0);
  if (zeroPrice.length) {
    console.log("\nMatched but no prices parsed (services/overview only):");
    for (const z of zeroPrice) console.log(` - ${z.slug} (${z.clinicName})`);
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write pricing + knowledgeBase.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
