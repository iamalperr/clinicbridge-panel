/**
 * Staging-only Firebase env loader for certification seed scripts.
 *
 * - Loads ONLY `.env.staging` by default (never `.env.local`).
 * - Rejects production project `clinicbridge`.
 * - Validates service-account embedded project_id matches staging.
 *
 * Does not print secrets.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

export const STAGING_PROJECT_ID = "clinicbridge-staging";
export const PRODUCTION_PROJECT_ID = "clinicbridge";

function fail(message: string): never {
  console.error(`[staging-env] FAIL: ${message}`);
  process.exit(1);
}

/**
 * Load `.env.staging` into process.env.
 * Explicit override: CLINICBRIDGE_ENV_FILE=/abs/path
 */
export function loadStagingEnvFile(repoRoot: string = process.cwd()): string {
  const override = (process.env.CLINICBRIDGE_ENV_FILE || "").trim();
  const envPath = override
    ? path.resolve(override)
    : path.resolve(repoRoot, ".env.staging");

  if (!fs.existsSync(envPath)) {
    fail(`Missing env file at ${envPath}. Create .env.staging first.`);
  }

  const basename = path.basename(envPath);
  if (basename === ".env.local" || basename === ".env") {
    fail(
      `Refusing to load ${basename}. Staging seeds must use .env.staging (or CLINICBRIDGE_ENV_FILE pointing at a staging-only file).`
    );
  }

  // Clear production-leaning Firebase vars before load so .env.local cannot linger
  // from a parent shell.
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("FIREBASE_") ||
      key.startsWith("NEXT_PUBLIC_FIREBASE_") ||
      key === "GCLOUD_PROJECT" ||
      key === "GOOGLE_CLOUD_PROJECT"
    ) {
      delete process.env[key];
    }
  }

  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    fail(`Failed to load ${envPath}: ${result.error.message}`);
  }

  console.log(`[staging-env] Loaded ${basename} (path kept private).`);
  return envPath;
}

function readProjectIdFromServiceAccountBase64(b64: string): string {
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
      project_id?: string;
    };
    return String(json.project_id || "").trim();
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64/JSON.");
  }
}

/** Assert env + credentials target clinicbridge-staging only. */
export function assertStagingFirebaseTarget(): {
  projectId: string;
  credentialProjectId: string;
} {
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();

  if (!projectId) {
    fail("FIREBASE_PROJECT_ID / NEXT_PUBLIC_FIREBASE_PROJECT_ID missing after staging env load.");
  }
  if (projectId === PRODUCTION_PROJECT_ID) {
    fail(`Refusing production project "${PRODUCTION_PROJECT_ID}".`);
  }
  if (projectId !== STAGING_PROJECT_ID) {
    fail(`Expected project "${STAGING_PROJECT_ID}", got "${projectId}".`);
  }

  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  let credentialProjectId = "";
  if (b64) {
    credentialProjectId = readProjectIdFromServiceAccountBase64(b64);
    if (credentialProjectId === PRODUCTION_PROJECT_ID) {
      fail("Service account embeds production project_id clinicbridge.");
    }
    if (credentialProjectId !== STAGING_PROJECT_ID) {
      fail(
        `Service account project_id "${credentialProjectId}" does not match staging.`
      );
    }
  } else {
    const email = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
    if (email.includes(`@${PRODUCTION_PROJECT_ID}.iam.`)) {
      fail("FIREBASE_CLIENT_EMAIL belongs to production.");
    }
    if (email && !email.includes(`@${STAGING_PROJECT_ID}.iam.`)) {
      fail(`FIREBASE_CLIENT_EMAIL domain is not ${STAGING_PROJECT_ID}.`);
    }
    credentialProjectId = STAGING_PROJECT_ID;
  }

  if (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim() !== STAGING_PROJECT_ID
  ) {
    fail("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not clinicbridge-staging.");
  }

  console.log(
    `[staging-env] OK target project="${projectId}" credential_project="${credentialProjectId}"`
  );
  return { projectId, credentialProjectId };
}

export function loadAndAssertStagingEnv(repoRoot?: string) {
  loadStagingEnvFile(repoRoot);
  return assertStagingFirebaseTarget();
}
