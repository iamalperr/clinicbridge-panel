import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { getAdminDb } from "./lib/firebase-admin";
console.log(process.env.FIREBASE_PROJECT_ID ? "YES" : "NO");
