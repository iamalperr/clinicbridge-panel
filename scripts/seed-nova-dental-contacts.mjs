/**
 * Seed Nova Dental Clinic Firestore record with WhatsApp + Telegram.
 * Usage: node scripts/seed-nova-dental-contacts.mjs
 *
 * This sets enableHumanHandoff=true, whatsappNumber, and telegramUsername
 * on the Nova Dental demo clinic so the live-support widget feature can be tested.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually load .env.local
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
  }
}


// Load credentials from individual env vars (same as firebase-admin.ts)
const projectId   = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin credentials in .env.local");
  console.error("   Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

const db = getFirestore();

const CLINIC_ID = "DnOlKzIhPc4agVymYcoH"; // Nova Dental Clinic demo

const updates = {
  enableHumanHandoff: true,
  whatsappNumber: "+18006682536",
  telegramUsername: "https://t.me/novadentalclinic",
  updatedAt: new Date().toISOString(),
};

try {
  await db.collection("clinics").doc(CLINIC_ID).update(updates);
  console.log("✅ Nova Dental Clinic updated:", updates);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
