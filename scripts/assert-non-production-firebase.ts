/**
 * Certification / staging safety guard.
 *
 * Rejects the production Firebase project ID (`clinicbridge`) before any
 * seed / write / live-chat certification script proceeds.
 *
 * Checks every common project-id source used by this repo:
 * - FIREBASE_PROJECT_ID / NEXT_PUBLIC_FIREBASE_PROJECT_ID / GCLOUD_*
 * - project_id embedded in FIREBASE_SERVICE_ACCOUNT_BASE64
 * - project_id embedded in FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
 *
 * Usage (from repo root, with staging env loaded):
 *   npx tsx scripts/assert-non-production-firebase.ts
 *   node --experimental-strip-types scripts/assert-non-production-firebase.ts
 *
 * Does not print secrets. Exits 0 only when a non-production project is set
 * and no credential source embeds production.
 */

const PRODUCTION_PROJECT_IDS = new Set(["clinicbridge"]);

function fail(message: string): never {
  console.error(`[cert-guard] FAIL: ${message}`);
  process.exit(1);
}

function readEnvProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ""
  ).trim();
}

function projectIdFromServiceAccountJson(raw: string, source: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { project_id?: unknown };
    if (typeof parsed.project_id === "string" && parsed.project_id.trim()) {
      return parsed.project_id.trim();
    }
    return null;
  } catch {
    fail(`Could not parse ${source} as JSON. Refusing to continue.`);
  }
}

function collectCredentialProjectIds(): Array<{ source: string; projectId: string }> {
  const found: Array<{ source: string; projectId: string }> = [];

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64) {
    try {
      const decoded = Buffer.from(base64, "base64").toString("utf8");
      const projectId = projectIdFromServiceAccountJson(
        decoded,
        "FIREBASE_SERVICE_ACCOUNT_BASE64"
      );
      if (projectId) {
        found.push({ source: "FIREBASE_SERVICE_ACCOUNT_BASE64", projectId });
      } else {
        fail("FIREBASE_SERVICE_ACCOUNT_BASE64 has no project_id.");
      }
    } catch (err) {
      if (err && typeof err === "object" && "message" in err) {
        // fail() already exited for parse errors above
      }
      fail("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64/JSON.");
    }
  }

  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (keyJson) {
    const projectId = projectIdFromServiceAccountJson(keyJson, "FIREBASE_SERVICE_ACCOUNT_KEY");
    if (projectId) {
      found.push({ source: "FIREBASE_SERVICE_ACCOUNT_KEY", projectId });
    } else {
      fail("FIREBASE_SERVICE_ACCOUNT_KEY has no project_id.");
    }
  }

  return found;
}

function main(): void {
  const envProjectId = readEnvProjectId();
  const credentialProjects = collectCredentialProjectIds();

  if (!envProjectId && credentialProjects.length === 0) {
    fail(
      "No Firebase project ID in env and no service-account credentials found. Set FIREBASE_PROJECT_ID (staging) before certification writes."
    );
  }

  if (envProjectId && PRODUCTION_PROJECT_IDS.has(envProjectId)) {
    fail(
      `Refusing env project "${envProjectId}" — this is production. Use clinicbridge-staging (or another non-prod project).`
    );
  }

  for (const cred of credentialProjects) {
    if (PRODUCTION_PROJECT_IDS.has(cred.projectId)) {
      fail(
        `Refusing ${cred.source}: embedded project_id is production "clinicbridge". Replace with a clinicbridge-staging service account before any write/deploy.`
      );
    }
    if (envProjectId && cred.projectId !== envProjectId) {
      fail(
        `Env project "${envProjectId}" does not match ${cred.source} project_id "${cred.projectId}". Refusing mismatched credentials.`
      );
    }
  }

  const resolved = envProjectId || credentialProjects[0]?.projectId || "";
  if (!resolved || PRODUCTION_PROJECT_IDS.has(resolved)) {
    fail(`Resolved project "${resolved || "(empty)"}" is not a safe non-production target.`);
  }

  console.log(
    `[cert-guard] OK: project="${resolved}" is not production. Safe to continue certification tooling.`
  );
}

main();
