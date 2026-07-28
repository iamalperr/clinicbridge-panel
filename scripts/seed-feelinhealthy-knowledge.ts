import * as admin from 'firebase-admin';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

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

const AGENCY_ID = 'feelinhealthy';

const LOCATIONS = [
  { city: 'İstanbul', slug: 'istanbul', countryCode: 'TR' },
  { city: 'Antalya', slug: 'antalya', countryCode: 'TR' },
  { city: 'İzmir', slug: 'izmir', countryCode: 'TR' },
  { city: 'Fethiye', slug: 'fethiye', countryCode: 'TR' }
];

async function seed() {
  const batch = db.batch();

  console.log(`\n======================================================`);
  console.log(` FEELINHEALTHY KNOWLEDGE & DESTINATION SEED`);
  console.log(`======================================================\n`);

  // 1. Seed Locations
  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    const docId = `${AGENCY_ID}_${loc.slug}`;
    const docRef = db.collection('agency_locations').doc(docId);
    
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      city: loc.city,
      slug: loc.slug,
      countryCode: loc.countryCode,
      active: true,
      displayOrder: (i + 1) * 10,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Added Location: ${loc.city}`);
  }

  // 2. Seed Destination Knowledge Documents
  for (const loc of LOCATIONS) {
    const locId = `${AGENCY_ID}_${loc.slug}`;
    const docId = `${AGENCY_ID}_destination_${loc.slug}`;
    const docRef = db.collection('knowledge_documents').doc(docId);
    
    batch.set(docRef, {
      tenantId: AGENCY_ID,
      ownerType: 'agency',
      ownerId: AGENCY_ID,
      knowledgeType: 'destination',
      locationId: locId,
      title: `${loc.city} Health Tourism Destination Guide`,
      locale: 'en',
      sourceType: 'website',
      sourceDomain: 'feelinhealthy.com',
      sourceUrl: `https://feelinhealthy.com/destination/${loc.slug}-health-tourism`,
      status: 'active',
      content: `Extracted content from ${loc.city} health tourism page. (Pending actual scrape/pipeline)`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Added Destination Document for: ${loc.city}`);
  }

  await batch.commit();
  console.log(`\n[SUCCESS] Seed committed successfully.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
