/**
 * Sync every FeelinHealthy clinic in ClinicBridge Portal with its canonical
 * FeelinHealthy profile page:
 *   1. Doctors        → agencies/{agencyId}/clinics/{clinicId}/doctors
 *      Missing doctors are created; existing doctors get their empty fields
 *      filled from the doctor pop-up (specialty, education, expertise areas,
 *      certifications, languages, experience, photo).
 *   2. Working hours   → agencies/{agencyId}/clinics/{clinicId}/knowledgeBase (AI Bilgi Havuzu)
 *   3. Clinic overview → knowledgeBase (Klinik Genel Bilgi) when absent
 *   4. Doctor summary  → knowledgeBase (Doktorlar) when absent
 *
 * Non-destructive by default: records are only created when absent and existing
 * fields are never overwritten unless --force is passed.
 *
 * Usage:
 *   npx tsx scripts/backfill-clinic-doctors-and-hours.ts                  # dry-run, all FH clinics
 *   npx tsx scripts/backfill-clinic-doctors-and-hours.ts --only camlica   # dry-run, slug filter
 *   npx tsx scripts/backfill-clinic-doctors-and-hours.ts --apply          # write
 *   npx tsx scripts/backfill-clinic-doctors-and-hours.ts --apply --force  # also overwrite existing values
 */

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { getAdminDb } from "../lib/firebase-admin";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc"; // FeelinHealthy
const SOURCE_BASE = "https://feelinhealthy.com/medicalcenter/";

const isApply = process.argv.includes("--apply");
const isForce = process.argv.includes("--force");
const onlyIdx = process.argv.indexOf("--only");
const onlyFilter =
  onlyIdx >= 0 && process.argv[onlyIdx + 1]
    ? String(process.argv[onlyIdx + 1]).trim().toLowerCase()
    : null;

// ─── Parsing helpers ────────────────────────────────────────────────────────

const KNOWN_LANGUAGES = [
  "Turkish",
  "English",
  "German",
  "French",
  "Arabic",
  "Russian",
  "Bulgarian",
  "Spanish",
  "Italian",
  "Dutch",
  "Persian",
  "Farsi",
  "Kurdish",
  "Azerbaijani",
  "Greek",
  "Romanian",
  "Ukrainian",
  "Albanian",
];

const DAY_MAP: Record<string, string> = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

const PLACEHOLDER_RE = /it has not been added yet/i;

/** Association entries that describe a training/membership rather than an expertise. */
const CREDENTIAL_RE =
  /\d{4}|symposium|sempozyum|congress|kongre|course|kurs|training|eğitim|academy|akademi|universit|üniversite|faculty|fakülte|association|derne|chamber|oda[sı]?\b|seminar|semineri|workshop|certificat|sertifika|member|üye|society|institut/i;

// Leading academic / medical titles that belong in the `title` field.
const TITLE_TOKENS = new Set([
  "prof.",
  "prof",
  "doç.",
  "doç",
  "doc.",
  "dr.",
  "dr",
  "op.",
  "op",
  "uzm.",
  "uzm",
  "dt.",
  "dt",
  "dyt.",
  "dyt",
  "md.",
  "md",
  "m.d.",
  "dds",
  "assoc.",
  "assoc",
  "associate",
  "professor",
  "öğr.",
  "öğr",
  "üyesi",
]);

interface ParsedDoctor {
  name: string; // clean person name (title stripped, title-cased)
  title: string; // Prof. Dr., Op. Dr., Dt. ...
  specialty: string; // Endodontics, Neurosurgery, ...
  education: string; // multi-line education text
  expertiseAreas: string[];
  certifications: string[];
  languages: string[];
  experienceYears: number | null;
  photoUrl: string;
}

interface ParsedProfile {
  title: string;
  overviewText: string;
  clinicHours: string;
  clinicLanguages: string[];
  doctors: ParsedDoctor[];
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function normalizeName(raw: string): string {
  return raw
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(dr|dt|prof|op|uzm|doc|doç|md|dds)\.?\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCaseTr(raw: string): string {
  // Only re-case tokens that are fully uppercase (e.g. "CAN SART" → "Can Sart");
  // leave already mixed-case names untouched.
  return raw
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      if (/\p{Ll}/u.test(w)) return w;
      const lower = w.toLocaleLowerCase("tr");
      return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
}

/** Split a FeelinHealthy display name into { title, name, specialty }. */
function splitDoctorName(rawDisplay: string): {
  title: string;
  name: string;
  specialty: string;
} {
  let display = cleanText(rawDisplay)
    // "DT.CAN" / "Op.Dr." glued title dots → add a space after the dot.
    .replace(/\b(dt|dr|op|doç|doc|uzm|prof|dyt|md)\.(?=\p{L})/giu, "$1. ");

  // Role/department follows the first comma or " / " separator.
  let specialty = "";
  const sepMatch = display.match(/\s*(?:,|\/)\s*/);
  if (sepMatch && sepMatch.index !== undefined) {
    specialty = cleanText(display.slice(sepMatch.index + sepMatch[0].length));
    display = cleanText(display.slice(0, sepMatch.index));
  }

  // Trailing titles such as "Savaş Kansoy, M.D. Prof." land in `specialty`;
  // move them back into the title when they are pure credentials.
  if (specialty && /^(m\.?d\.?|prof\.?|dr\.?|ph\.?d\.?)[\s.]*$/i.test(specialty)) {
    specialty = "";
  }

  const words = display.split(/\s+/);
  const titleParts: string[] = [];
  while (words.length > 1 && TITLE_TOKENS.has(words[0].toLocaleLowerCase("tr"))) {
    titleParts.push(words.shift() as string);
  }

  const name = toTitleCaseTr(words.join(" "));
  const title = titleParts
    .map((t) => {
      const lower = t.toLocaleLowerCase("tr");
      return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
  return { title, name, specialty };
}

/**
 * Derive the specialty when it is not part of the display name.
 * FeelinHealthy has no dedicated specialty field: for several clinics the
 * "Education" block holds it (e.g. "Endodontics", or
 * "Istanbul University Faculty of Dentistry / Oral and Maxillofacial Surgery").
 */
function deriveSpecialty(fromName: string, educationItems: string[]): string {
  if (fromName) return fromName;
  if (educationItems.length !== 1) return "";
  const item = educationItems[0];
  const afterSlash = item.includes("/") ? cleanText(item.split("/").pop() as string) : item;
  const isShort = afterSlash.length > 0 && afterSlash.length <= 45;
  const looksLikeSchool = /universit|üniversite|faculty|fakülte|school|okul|hospital|hastane/i.test(
    afterSlash
  );
  const hasYear = /\d{4}/.test(afterSlash);
  if (isShort && !looksLikeSchool && !hasYear) return afterSlash;
  return "";
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.toLocaleLowerCase("tr");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(i);
    }
  }
  return out;
}

/**
 * Parse the doctor pop-ups. Each doctor card opens a pop-up
 * (div.langMenu[data-x="doctorPopupNN"]) whose body is a flat sequence of
 * bold labels (.text-18.fw-500) followed by their values (.text-15).
 */
function parseDoctors($: cheerio.CheerioAPI): ParsedDoctor[] {
  const doctors: ParsedDoctor[] = [];
  const seen = new Set<string>();

  $('div.langMenu[data-x^="doctorPopup"]').each((_i, el) => {
    const $popup = $(el);
    const popupKey = $popup.attr("data-x") || "";
    const rawDisplay = cleanText($popup.find(".text-20.fw-500").first().text());
    if (!rawDisplay) return;

    const fields = new Map<string, string[]>();
    let currentLabel: string | null = null;
    $popup.find(".text-18.fw-500, .text-15").each((_j, node) => {
      const $node = $(node);
      const text = cleanText($node.text());
      if (!text) return;
      const isLabel = ($node.attr("class") || "").includes("text-18");
      if (isLabel) {
        currentLabel = text;
        if (!fields.has(currentLabel)) fields.set(currentLabel, []);
      } else if (currentLabel) {
        if (PLACEHOLDER_RE.test(text)) return;
        fields.get(currentLabel)?.push(text);
      }
    });

    const languageItems = uniq(fields.get("Language") || []);
    const educationItems = uniq(fields.get("Education") || []);
    const associationItems = uniq(fields.get("Associations") || []);
    const experienceItems = fields.get("Experience") || [];

    const { title, name, specialty: specialtyFromName } = splitDoctorName(rawDisplay);
    const key = normalizeName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);

    let experienceYears: number | null = null;
    const expMatch = experienceItems.join(" ").match(/(\d+)\s*Years?/i);
    if (expMatch) experienceYears = parseInt(expMatch[1], 10);

    const languages = languageItems.filter(
      (l) => l.length <= 30 && KNOWN_LANGUAGES.some((k) => k.toLowerCase() === l.toLowerCase())
    );

    // "Associations" mixes memberships/trainings with clinical expertise.
    const certifications = associationItems.filter((a) => CREDENTIAL_RE.test(a));
    const expertiseAreas = associationItems.filter((a) => !CREDENTIAL_RE.test(a));

    const photoUrl =
      $(`a.hotelsCard[data-x-click="${popupKey}"] img`).first().attr("data-src") || "";

    doctors.push({
      name,
      title,
      specialty: deriveSpecialty(specialtyFromName, educationItems),
      education: educationItems.join("\n"),
      expertiseAreas,
      certifications,
      languages,
      experienceYears,
      photoUrl,
    });
  });

  return doctors;
}

function parseClinicHours(bodyText: string): string {
  // Extract structured day → hours lines, ignoring surrounding marketing text.
  const dayRe =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(?:to|-|–|—)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?\s*:\s*(Closed|\d{1,2}[:.]\d{2}\s*[–—-]\s*\d{1,2}[:.]\d{2})/gi;
  const parts: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(bodyText)) !== null) {
    const line = cleanText(m[0]).replace(/\s*:\s*/, ": ");
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      parts.push(line);
    }
    if (parts.length >= 7) break;
  }
  return parts.join("; ");
}

function parseClinicLanguages(bodyText: string): string[] {
  const m = bodyText.match(
    /(?:multilingual assistance in|support (?:is )?available in|languages?:?)\s+([^.]+?)\./i
  );
  const found = new Set<string>();
  if (m) {
    for (const lang of KNOWN_LANGUAGES) {
      if (new RegExp(`\\b${lang}\\b`, "i").test(m[1])) found.add(lang);
    }
  }
  return Array.from(found);
}

function parseOverview($: cheerio.CheerioAPI): string {
  const header = $("h3, h2").filter((_i, el) => /^\s*overview\s*$/i.test($(el).text())).first();
  if (!header.length) return "";
  const parts: string[] = [];
  let cur = header.next();
  let guard = 0;
  while (cur.length && guard < 60) {
    const tag = (cur.prop("tagName") || "").toString().toUpperCase();
    if (tag === "H2" || tag === "H3") break;
    const t = cleanText(cur.text());
    if (t) parts.push(t);
    cur = cur.next();
    guard += 1;
  }
  return cleanText(parts.join(" ")).slice(0, 2000);
}

function parseProfile(html: string): ParsedProfile {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  return {
    title: cleanText($("h1").first().text() || $("title").text()),
    overviewText: parseOverview($),
    clinicHours: parseClinicHours(bodyText),
    clinicLanguages: parseClinicLanguages(bodyText),
    doctors: parseDoctors($),
  };
}

function hoursToTurkish(src: string): string {
  let out = src;
  for (const [en, tr] of Object.entries(DAY_MAP)) {
    out = out.replace(new RegExp(en, "gi"), tr);
  }
  return cleanText(
    out.replace(/\bto\b/gi, "-").replace(/\bClosed\b/gi, "Kapalı").replace(/\band\b/gi, "ve")
  );
}

async function fetchHtml(url: string): Promise<string | null> {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const res = await fetch(url, {
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {
      // retry
    }
    attempt += 1;
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return null;
}

function resolveUrl(data: Record<string, any>): string | null {
  const candidates = [data.canonicalSourceUrl, data.externalSourceUrl, data.sourceUrl].filter(
    Boolean
  ) as string[];
  const direct = candidates.find((u) => /feelinhealthy\.com\/medicalcenter\//i.test(u));
  if (direct) return direct.split("?")[0];
  const slug = data.slug || data.stableKey?.replace(/_/g, "-");
  return slug ? `${SOURCE_BASE}${slug}` : null;
}

// ─── Firestore helpers ──────────────────────────────────────────────────────

interface ExistingDoctor {
  id: string;
  data: Record<string, any>;
}

async function loadExistingDoctors(
  db: Firestore,
  clinicId: string
): Promise<Map<string, ExistingDoctor>> {
  const snap = await db
    .collection("agencies")
    .doc(AGENCY_ID)
    .collection("clinics")
    .doc(clinicId)
    .collection("doctors")
    .get();
  const map = new Map<string, ExistingDoctor>();
  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.doctorName) map.set(normalizeName(String(data.doctorName)), { id: d.id, data });
  });
  return map;
}

async function loadExistingKbCategories(db: Firestore, clinicId: string): Promise<Set<string>> {
  const snap = await db
    .collection("agencies")
    .doc(AGENCY_ID)
    .collection("clinics")
    .doc(clinicId)
    .collection("knowledgeBase")
    .get();
  const set = new Set<string>();
  snap.forEach((d) => {
    const c = d.data()?.category;
    if (c) set.add(String(c));
  });
  return set;
}

function isEmptyValue(v: any): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/** Fields the source can provide, mapped onto the ClinicDoctor shape. */
function doctorFieldsFromSource(d: ParsedDoctor): Record<string, any> {
  const fields: Record<string, any> = {};
  if (d.title) fields.title = d.title;
  if (d.specialty) fields.specialty = d.specialty;
  if (d.education) fields.education = d.education;
  if (d.expertiseAreas.length) fields.expertiseAreas = d.expertiseAreas;
  if (d.certifications.length) fields.certifications = d.certifications;
  if (d.languages.length) fields.supportedLanguages = d.languages;
  if (d.experienceYears != null) fields.experienceYears = d.experienceYears;
  if (d.photoUrl) fields.photoUrl = d.photoUrl;
  return fields;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `=== SYNC CLINIC DOCTORS + HOURS FROM FEELINHEALTHY [${isApply ? "APPLY" : "DRY-RUN"}]${
      isForce ? " [FORCE]" : ""
    } ===\n`
  );

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized. Check Firebase credentials.");
    process.exit(1);
  }

  const clinicsSnap = await db
    .collection("agencies")
    .doc(AGENCY_ID)
    .collection("clinics")
    .get();

  console.log(`FeelinHealthy clinics in portal: ${clinicsSnap.size}\n`);

  let clinicsProcessed = 0;
  let clinicsSkipped = 0;
  let doctorsCreated = 0;
  let doctorsUpdated = 0;
  let kbCreated = 0;
  const fieldFillCount = new Map<string, number>();
  const fetchFailures: string[] = [];

  for (const clinicDoc of clinicsSnap.docs) {
    const clinicId = clinicDoc.id;
    const data = clinicDoc.data() || {};
    const clinicName = String(data.clinicName || data.name || clinicId);
    const url = resolveUrl(data);

    if (!url) {
      clinicsSkipped += 1;
      console.log(`· skip  ${clinicName} — no source URL`);
      continue;
    }
    if (onlyFilter && !url.toLowerCase().includes(onlyFilter)) continue;

    const html = await fetchHtml(url);
    if (!html) {
      clinicsSkipped += 1;
      fetchFailures.push(`${clinicName} (${url})`);
      console.log(`· FAIL  ${clinicName} — fetch failed`);
      continue;
    }

    clinicsProcessed += 1;
    const profile = parseProfile(html);
    const existingDoctors = await loadExistingDoctors(db, clinicId);
    const existingKbCategories = await loadExistingKbCategories(db, clinicId);

    const clinicRef = db
      .collection("agencies")
      .doc(AGENCY_ID)
      .collection("clinics")
      .doc(clinicId);

    const created: string[] = [];
    const updated: string[] = [];
    let order = existingDoctors.size;

    for (const d of profile.doctors) {
      const key = normalizeName(d.name);
      const existing = existingDoctors.get(key);
      const sourceFields = doctorFieldsFromSource(d);

      if (!existing) {
        created.push([d.title, d.name].filter(Boolean).join(" "));
        Object.keys(sourceFields).forEach((f) =>
          fieldFillCount.set(f, (fieldFillCount.get(f) || 0) + 1)
        );
        if (isApply) {
          await clinicRef.collection("doctors").add({
            doctorName: d.name,
            ...sourceFields,
            status: "active",
            showOnPublicProfile: true,
            order: order++,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            sourceUrl: url,
            sourceProfile: "feelinhealthy",
          });
        }
        doctorsCreated += 1;
        continue;
      }

      // Fill only what is missing (unless --force).
      const patch: Record<string, any> = {};
      for (const [field, value] of Object.entries(sourceFields)) {
        if (isForce || isEmptyValue(existing.data[field])) {
          patch[field] = value;
        }
      }
      if (Object.keys(patch).length === 0) continue;

      Object.keys(patch).forEach((f) => fieldFillCount.set(f, (fieldFillCount.get(f) || 0) + 1));
      updated.push(`${d.name} → ${Object.keys(patch).join(", ")}`);
      doctorsUpdated += 1;

      if (isApply) {
        await clinicRef
          .collection("doctors")
          .doc(existing.id)
          .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }

    // Knowledge base records
    const kbToAdd: string[] = [];
    if (profile.clinicHours && !existingKbCategories.has("Çalışma Saatleri")) {
      kbToAdd.push("Çalışma Saatleri");
    }
    if (profile.overviewText && !existingKbCategories.has("Klinik Genel Bilgi")) {
      kbToAdd.push("Klinik Genel Bilgi");
    }
    if (profile.doctors.length > 0 && !existingKbCategories.has("Doktorlar")) {
      kbToAdd.push("Doktorlar");
    }

    console.log(`· ${clinicName}`);
    console.log(
      `    doctors on source: ${profile.doctors.length} | created: ${created.length} | updated: ${updated.length}`
    );
    if (created.length) console.log(`    + ${created.join(", ")}`);
    updated.slice(0, 4).forEach((u) => console.log(`    ~ ${u}`));
    if (updated.length > 4) console.log(`    ~ ... +${updated.length - 4} more`);
    if (kbToAdd.length) console.log(`    KB to add: [${kbToAdd.join(", ")}]`);

    if (isApply) {
      const kbCol = clinicRef.collection("knowledgeBase");
      for (const cat of kbToAdd) {
        let title = "";
        let content = "";
        let language: "TR" | "EN" = "TR";
        if (cat === "Çalışma Saatleri") {
          title = `${clinicName} Çalışma Saatleri`;
          content = `Çalışma saatleri (FeelinHealthy profilinden):\n${hoursToTurkish(
            profile.clinicHours
          )}\n\nKaynak metin: ${profile.clinicHours}`;
        } else if (cat === "Klinik Genel Bilgi") {
          title = `${clinicName} Klinik Genel Bilgi`;
          language = "EN";
          const langNote = profile.clinicLanguages.length
            ? `\n\nSupported languages: ${profile.clinicLanguages.join(", ")}.`
            : "";
          content = `${profile.overviewText}${langNote}`;
        } else if (cat === "Doktorlar") {
          title = `${clinicName} Doktor Kadrosu`;
          content = `Klinik doktor kadrosu (FeelinHealthy profilinden):\n${profile.doctors
            .map((d) => {
              const bits: string[] = [[d.title, d.name].filter(Boolean).join(" ")];
              if (d.specialty) bits.push(d.specialty);
              if (d.experienceYears != null) bits.push(`${d.experienceYears} yıl deneyim`);
              if (d.languages.length) bits.push(`diller: ${d.languages.join(", ")}`);
              if (d.expertiseAreas.length)
                bits.push(`uzmanlık alanları: ${d.expertiseAreas.join(", ")}`);
              return `- ${bits.join(" — ")}`;
            })
            .join("\n")}`;
        }
        await kbCol.add({
          agencyId: AGENCY_ID,
          clinicId,
          title,
          category: cat,
          language,
          content,
          isActive: true,
          priority: "Normal",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          sourceUrl: url,
        });
        kbCreated += 1;
      }
    } else {
      kbCreated += kbToAdd.length;
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Clinics processed:       ${clinicsProcessed}`);
  console.log(`Clinics skipped:         ${clinicsSkipped}`);
  console.log(`Doctors ${isApply ? "created" : "to create"}:  ${doctorsCreated}`);
  console.log(`Doctors ${isApply ? "updated" : "to update"}:  ${doctorsUpdated}`);
  console.log(`KB records ${isApply ? "created" : "to create"}: ${kbCreated}`);
  console.log("\nFields filled:");
  Array.from(fieldFillCount.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([f, c]) => console.log(`  ${c.toString().padStart(4)}  ${f}`));
  if (fetchFailures.length) {
    console.log("\nFetch failures:");
    fetchFailures.forEach((f) => console.log(`  - ${f}`));
  }
  if (!isApply) console.log("\nDry-run only. Re-run with --apply to write changes.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
