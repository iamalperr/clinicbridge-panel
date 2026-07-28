console.log("1. BEFORE loadEnvConfig: ", process.env.TEST_VAR);

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

console.log("2. AFTER loadEnvConfig: ", process.env.TEST_VAR);

import { getAdminDb } from "./lib/firebase-admin";

console.log("3. AFTER IMPORT getAdminDb");
