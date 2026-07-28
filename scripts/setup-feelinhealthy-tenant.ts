import * as admin from 'firebase-admin';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load .env.local or .env
const envLocal = path.resolve(process.cwd(), '.env.local');
const envRegular = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envRegular)) {
  dotenv.config({ path: envRegular });
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const certBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  
  if (certBase64) {
    const certJson = Buffer.from(certBase64, 'base64').toString('utf8');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(certJson)),
    });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    throw new Error('No Firebase credentials found');
  }
}

const db = admin.firestore();

const AGENCY_ID = "feelinhealthy";

const TENANT_DATA = {
  id: AGENCY_ID,
  slug: AGENCY_ID,
  displayName: "FeelinHealthy",
  type: "health_tourism_agency",
  status: "active",
  legalContext: "Health tourism agency / medical tourism platform",
  primaryWebsite: "https://feelinhealthy.com/",
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  
  domains: [
    "https://feelinhealthy.com",
    "http://feelinhealthy.com",
    "http://localhost:3000",
    "*.feelinhealthy.com"
  ],
  
  locales: ["en", "tr"],
  reservedLocales: ["de", "fr"],
  
  branding: {
    primaryColor: "#00b2a9", // Default brand color for FeelinHealthy (Teal/Green)
    secondaryColor: "#1e293b",
    accentColor: "#0ea5e9",
  },
  
  privacySettings: {
    enabled: true,
    mode: "kvkk_and_gdpr",
    version: "1.0",
    requiredBeforePersonalData: true,
    consentTextEn: "I have read and agree to the Terms and Conditions and Privacy Policy.",
    consentTextTr: "Kullanım Koşulları ve Gizlilik Politikasını okudum ve onaylıyorum.",
    noticeUrlEn: "https://feelinhealthy.com/privacy-policy",
    noticeUrlTr: "https://feelinhealthy.com/tr/gizlilik-politikasi",
    termsUrlEn: "https://feelinhealthy.com/terms",
    termsUrlTr: "https://feelinhealthy.com/tr/sartlar"
  },
  
  settings: {
    maxClinicsPerTreatmentRequest: 3,
    multiClinicSelectionEnabled: true,
    patientEmailCollectionEnabled: true,
    patientSecurePortalEnabled: true,
    patientDocumentUploadEnabled: true,
    patientDocumentUploadContext: "agency_patient_request",
    doctorEnrichmentEnabled: true,
    emailNotificationsEnabled: true,
    whatsappNotificationsEnabled: false,
    smsNotificationsEnabled: false,
    extendedClinicRequestEnabled: true
  },
  
  agentSettings: {
    name: "FeelinHealthy Assistant",
    role: "Health tourism patient advisor",
    systemPrompt: `You are the digital patient and medical travel assistant of FeelinHealthy.

You help international patients understand available treatment categories, identify suitable clinics, compare verified information, submit preliminary treatment requests and follow their request securely.

You represent FeelinHealthy as a health tourism agency and comparison platform. You do not represent a single clinic or hospital.

You are not a doctor and must not diagnose, interpret medical images, guarantee treatment outcomes or provide unverified prices.

Behaviors:
- Detect the user's language and respond completely in English or Turkish based on their input. Never mix languages.
- Collect the treatment category needed.
- Collect the preferred city or destination.
- Collect patient age and basic necessary details.
- Collect full name, email, and phone number.
- Guide the user to select a maximum of 3 clinics.
- Clearly state that this is a preliminary assessment and does not guarantee the clinics will accept the case.
- Clearly state that updates and results will be communicated via email and the secure patient portal.
- Do NOT ask for medical documents directly in the chat; explain that documents can only be uploaded securely via the Patient Portal *after* the request is created.
- Do NOT promise that documents are automatically shared with clinics without consent.
- Do NOT promise updates via WhatsApp or SMS.
- Do NOT state that an appointment is final or confirmed.`
  },
  
  emailSettings: {
    senderDisplayName: "FeelinHealthy",
    replyTo: "support@feelinhealthy.com"
  },
  
  treatmentCategories: [
    { key: "dental", en: "Dental", tr: "Diş Tedavisi", slug: "dental", active: true, order: 1 },
    { key: "hair_transplant", en: "Hair Transplant", tr: "Saç Ekimi", slug: "hair-transplant", active: true, order: 2 },
    { key: "aesthetic_surgery", en: "Aesthetic, Plastic and Reconstructive Surgery", tr: "Estetik, Plastik ve Rekonstrüktif Cerrahi", slug: "aesthetic-surgery", active: true, order: 3 },
    { key: "stroke_rehab", en: "Stroke Rehabilitation", tr: "İnme Rehabilitasyonu", slug: "stroke-rehabilitation", active: true, order: 4 },
    { key: "oncology", en: "Oncology", tr: "Onkoloji", slug: "oncology", active: true, order: 5 },
    { key: "ivf", en: "IVF / In Vitro Fertilization", tr: "Tüp Bebek (IVF)", slug: "ivf", active: true, order: 6 },
    { key: "cardiology", en: "Cardiology and Cardiovascular Surgery", tr: "Kardiyoloji ve Kalp Damar Cerrahisi", slug: "cardiology", active: true, order: 7 },
    { key: "check_up", en: "Check-Up", tr: "Check-Up", slug: "check-up", active: true, order: 8 },
    { key: "eye_treatments", en: "Eye Treatments", tr: "Göz Tedavisi", slug: "eye-treatments", active: true, order: 9 },
    { key: "bone_marrow", en: "Bone Marrow and Stem Cell Transplantation", tr: "Kemik İliği ve Kök Hücre Nakli", slug: "bone-marrow", active: true, order: 10 }
  ],
  
  locations: [
    { country: "Turkey", city: "Istanbul", en: "Istanbul", tr: "İstanbul", slug: "istanbul", active: true, order: 1 },
    { country: "Turkey", city: "Antalya", en: "Antalya", tr: "Antalya", slug: "antalya", active: true, order: 2 },
    { country: "Turkey", city: "Izmir", en: "Izmir", tr: "İzmir", slug: "izmir", active: true, order: 3 },
    { country: "Turkey", city: "Mugla", citySub: "Fethiye", en: "Fethiye", tr: "Fethiye", slug: "fethiye", active: true, order: 4 }
  ]
};

async function run() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  console.log(`\n======================================================`);
  console.log(` CLINICBRIDGE AI - FEELINHEALTHY TENANT SETUP SCRIPT`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (No changes will be saved)' : 'APPLY (Writing to production database)'}`);
  console.log(`======================================================\n`);

  try {
    const agencyRef = db.collection('agencies').doc(AGENCY_ID);
    const agencySnap = await agencyRef.get();

    if (agencySnap.exists) {
      console.log(`[INFO] Agency '${AGENCY_ID}' already exists. Updating missing fields idempotently...`);
      const existingData = agencySnap.data();
      
      // Preserve created at
      const dataToSave = {
        ...TENANT_DATA,
        createdAt: existingData?.createdAt || TENANT_DATA.createdAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (isApply) {
        await agencyRef.set(dataToSave, { merge: true });
        console.log(`[SUCCESS] Agency '${AGENCY_ID}' updated successfully.`);
      } else {
        console.log(`[DRY-RUN] Would update agency '${AGENCY_ID}' with new settings.`);
      }
    } else {
      console.log(`[INFO] Agency '${AGENCY_ID}' not found. Creating new tenant...`);
      
      if (isApply) {
        await agencyRef.set(TENANT_DATA);
        console.log(`[SUCCESS] Agency '${AGENCY_ID}' created successfully.`);
      } else {
        console.log(`[DRY-RUN] Would create new agency '${AGENCY_ID}'.`);
      }
    }

    console.log(`\n--- Setup Report ---`);
    console.log(`Tenant ID: ${AGENCY_ID}`);
    console.log(`Status: ${isApply ? 'Applied' : 'Dry Run'}`);
    console.log(`Domains Configured: ${TENANT_DATA.domains.length}`);
    console.log(`Locales: ${TENANT_DATA.locales.join(', ')}`);
    console.log(`Treatment Categories: ${TENANT_DATA.treatmentCategories.length}`);
    console.log(`Locations: ${TENANT_DATA.locations.length}`);
    console.log(`WhatsApp/SMS Disabled: Yes`);
    
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] Setup failed:`, error);
    process.exit(1);
  }
}

run();
