import * as admin from 'firebase-admin';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

// Load .env
const envLocal = path.resolve(process.cwd(), '.env.local');
const envRegular = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
else if (fs.existsSync(envRegular)) dotenv.config({ path: envRegular });

if (!admin.apps.length) {
  const certBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (certBase64) {
    const certJson = Buffer.from(certBase64, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(certJson)) });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  } else {
    throw new Error('No Firebase credentials found');
  }
}
const db = admin.firestore();

const AGENCY_ID = "feelinhealthy";
const FILE_PATH = path.resolve(process.cwd(), 'data/imports/feelinhealthy/TEDAVI-BASLIKLARI.xlsx');

function cleanString(str: any): string {
  if (!str) return '';
  let s = String(str).trim();
  s = s.replace(/\u00A0/g, ' '); // Non-breaking space
  s = s.replace(/\s+/g, ' '); // Multiple spaces
  s = s.replace(/\s+\//g, '/').replace(/\/\s+/g, '/'); // Spaces around slash
  s = s.replace(/İnvisalign/g, 'Invisalign');
  s = s.replace(/Cad-CamSystem/gi, 'CAD/CAM System');
  s = s.replace(/^RINOPLASTI$/i, 'Rinoplasti');
  s = s.replace(/^SEPTOPLASTI$/i, 'Septoplasti');
  return s;
}

function generateKey(enStr: string): string {
  if (!enStr) return `key_${Math.random().toString(36).substring(7)}`;
  return enStr
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface TranslationObj {
  en: string;
  tr: string;
  de: string;
  fr: string;
}

interface ParsedRecord {
  type: 'category' | 'group' | 'treatment';
  categoryKey: string;
  groupKey?: string | null;
  key: string;
  translations: TranslationObj;
  status: 'active' | 'draft';
  translationStatus: 'verified_from_agency_document' | 'requires_translation_review';
  source: {
    sheet: string;
    row: number;
    text: string;
  };
  displayOrder: number;
}

async function run() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  console.log(`\n======================================================`);
  console.log(` FEELINHEALTHY TREATMENT CATALOG IMPORT SCRIPT`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (No database changes)' : 'APPLY (Writing to production database)'}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`[ERROR] File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(FILE_PATH);
  const allRecords: ParsedRecord[] = [];
  
  const categoryDefs = [
    { key: 'dental', en: 'Dental', tr: 'Diş Tedavileri' },
    { key: 'hair_transplant', en: 'Hair Transplant', tr: 'Saç Ekimi' },
    { key: 'medical_aesthetics', en: 'Medical Aesthetics', tr: 'Medikal Estetik' },
    { key: 'surgical_procedures', en: 'Surgical Procedures', tr: 'Cerrahi İşlemler' }
  ];
  
  // Add Categories first
  categoryDefs.forEach((cat, index) => {
    allRecords.push({
      type: 'category',
      categoryKey: cat.key,
      key: cat.key,
      translations: { en: cat.en, tr: cat.tr, de: '', fr: '' },
      status: 'active',
      translationStatus: 'verified_from_agency_document',
      source: { sheet: 'SYSTEM', row: 0, text: cat.en },
      displayOrder: (index + 1) * 10
    });
  });

  // Processing logic per sheet
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'Export Summary') continue;
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    
    let currentCategoryKey = '';
    let currentGroupKey: string | null = null;
    let groupOrderCount = 0;
    let treatmentOrderCount = 0;
    
    // Mapping columns per sheet
    let mapEn = 0, mapTr = 1, mapDe = 2, mapFr = 3;
    if (sheetName === 'dental') {
      mapEn = 0; mapTr = 1; mapDe = 2; mapFr = 3;
      currentCategoryKey = 'dental';
    } else if (sheetName === 'saç') {
      mapTr = 0; mapEn = 1; mapDe = 2; mapFr = 3;
      currentCategoryKey = 'hair_transplant';
    } else if (sheetName === 'MEDİKAL ESTETİK') {
      mapTr = 0; mapEn = 1; mapDe = 2; mapFr = 3;
      currentCategoryKey = 'medical_aesthetics';
    } else if (sheetName === 'CERRAHİ İŞLEMLER') {
      mapTr = 0; mapEn = 1; mapDe = 2; mapFr = 3;
      currentCategoryKey = 'surgical_procedures';
    }

    // Iterate over rows
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      // Skip empty rows
      if (!row || row.length === 0 || !row.some(cell => cell !== undefined && cell !== null && cell !== '')) continue;
      
      const enVal = cleanString(row[mapEn]);
      const trVal = cleanString(row[mapTr]);
      const deVal = cleanString(row[mapDe]);
      const frVal = cleanString(row[mapFr]);
      
      // Skip headers / invalid rows
      if (
        enVal.toUpperCase() === 'İNGİLİZCE' || trVal.toUpperCase() === 'İNGİLİZCE' ||
        enVal === 'MEDICAL AESTHETIC' || trVal === 'MEDİKAL ESTETİK' ||
        enVal === 'HAIR TRANSPLANT' || trVal === 'HAIR TRANSPLANT' ||
        enVal === 'SURGICAL PROCEDURES' || trVal === 'CERRAHİ İŞLEMLER'
      ) {
        continue;
      }
      
      if (!enVal && !trVal) continue; // nothing useful

      const isAllCapsEn = enVal && enVal === enVal.toUpperCase() && enVal.length > 3 && !enVal.includes('FUE') && !enVal.includes('DHI');
      const isAllCapsTr = trVal && trVal === trVal.toUpperCase() && trVal.length > 3 && !trVal.includes('FUE') && !trVal.includes('DHI');
      
      // Group detection
      let isGroup = false;
      if (sheetName === 'dental' && isAllCapsEn) isGroup = true;
      if (sheetName === 'CERRAHİ İŞLEMLER' && (isAllCapsTr || isAllCapsEn)) isGroup = true;
      
      // Some known groups from prompt:
      const knownGroups = ['BURUN ESTETİĞİ', 'MEME ESTETİĞİ', 'POPO ESTETİĞİ', 'YÜZ ESTETİĞİ', 'VÜCUT ESTETİĞİ', 'POST BARIATRIK'];
      if (knownGroups.includes(trVal.toUpperCase())) isGroup = true;

      const recordKey = generateKey(enVal || trVal);
      
      if (isGroup) {
        currentGroupKey = recordKey;
        groupOrderCount++;
        allRecords.push({
          type: 'group',
          categoryKey: currentCategoryKey,
          key: recordKey,
          translations: { en: enVal, tr: trVal, de: deVal, fr: frVal },
          status: 'active',
          translationStatus: (deVal && frVal) ? 'requires_translation_review' : 'verified_from_agency_document',
          source: { sheet: sheetName, row: rowIndex + 1, text: enVal || trVal },
          displayOrder: groupOrderCount * 10
        });
      } else {
        treatmentOrderCount++;
        
        let status: 'active' | 'draft' = 'active';
        if (!enVal || !trVal) status = 'draft';
        
        allRecords.push({
          type: 'treatment',
          categoryKey: currentCategoryKey,
          groupKey: currentGroupKey,
          key: recordKey,
          translations: { en: enVal, tr: trVal, de: deVal, fr: frVal },
          status,
          translationStatus: 'requires_translation_review',
          source: { sheet: sheetName, row: rowIndex + 1, text: enVal || trVal },
          displayOrder: treatmentOrderCount * 10
        });
      }
    }
  }

  // Duplicate Check
  const keySet = new Set<string>();
  const duplicateCandidates: any[] = [];
  const uniqueRecords: ParsedRecord[] = [];

  for (const record of allRecords) {
    const globalKey = `${record.type}_${record.categoryKey}_${record.key}`;
    if (keySet.has(globalKey)) {
      duplicateCandidates.push(record);
    } else {
      keySet.add(globalKey);
      uniqueRecords.push(record);
    }
  }

  // --- DRY RUN REPORT ---
  const cats = uniqueRecords.filter(r => r.type === 'category');
  const groups = uniqueRecords.filter(r => r.type === 'group');
  const treatments = uniqueRecords.filter(r => r.type === 'treatment');
  
  console.log(`\n--- Analysis Report ---`);
  console.log(`Categories found: ${cats.length}`);
  console.log(`Groups found: ${groups.length}`);
  console.log(`Treatments found: ${treatments.length}`);
  console.log(`Duplicate Candidates skipped: ${duplicateCandidates.length}`);
  console.log(`Translations to review: ${uniqueRecords.filter(r => r.translationStatus === 'requires_translation_review').length}`);
  
  let validEn = 0, validTr = 0, validDe = 0, validFr = 0;
  uniqueRecords.forEach(r => {
    if (r.translations.en) validEn++;
    if (r.translations.tr) validTr++;
    if (r.translations.de) validDe++;
    if (r.translations.fr) validFr++;
  });
  console.log(`Locale Counts -> EN: ${validEn}, TR: ${validTr}, DE: ${validDe}, FR: ${validFr}`);
  
  if (isDryRun) {
    console.log(`\n[DRY RUN] Operation complete. No data saved.`);
    process.exit(0);
  }

  // --- APPLY TO DB ---
  console.log(`\n--- Applying to Database ---`);
  let updated = 0;
  
  const batch = db.batch();
  
  for (const record of uniqueRecords) {
    let collectionName = '';
    if (record.type === 'category') collectionName = 'agency_treatment_categories';
    else if (record.type === 'group') collectionName = 'agency_treatment_groups';
    else collectionName = 'agency_treatments';
    
    // stable doc id: feelinhealthy_{key}
    const docId = `${AGENCY_ID}_${record.key}`;
    const docRef = db.collection(collectionName).doc(docId);
    
    const payload: any = {
      agencyId: AGENCY_ID,
      key: record.key,
      translations: record.translations,
      status: record.status,
      translationStatus: record.translationStatus,
      displayOrder: record.displayOrder,
      source: record.source,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (record.type !== 'category') {
      payload.categoryKey = record.categoryKey;
    }
    if (record.type === 'treatment' && record.groupKey) {
      payload.groupKey = record.groupKey;
    }
    
    batch.set(docRef, payload, { merge: true });
    updated++; // We merge, treating as updated/created
  }
  
  await batch.commit();
  console.log(`[SUCCESS] Database transaction committed successfully.`);
  console.log(`Total Records Upserted: ${updated}`);
  
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
