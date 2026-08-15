/**
 * Certification / staging safety guard.
 *
 * Rejects the production Firebase project ID (`clinicbridge`) before any
 * seed / write / live-chat certification script proceeds.
 *
 * Usage (from repo root, with staging env loaded):
 *   npx tsx scripts/assert-non-production-firebase.ts
 *
 * Does not print secrets. Exits 0 only when a non-production project is set.
 */

const PRODUCTION_PROJECT_IDS = new Set(["clinicbridge"]);

function readProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ""
  ).trim();
}

function main(): void {
  const projectId = readProjectId();
  if (!projectId) {
    console.error(
      "[cert-guard] FAIL: No Firebase project ID in env. Set FIREBASE_PROJECT_ID (staging) before certification writes."
    );
    process.exit(1);
  }
  if (PRODUCTION_PROJECT_IDS.has(projectId)) {
    console.error(
      `[cert-guard] FAIL: Refusing project "${projectId}" — this is production. Use clinicbridge-staging (or another non-prod project).`
    );
    process.exit(1);
  }
  console.log(
    `[cert-guard] OK: project="${projectId}" is not production. Safe to continue certification tooling.`
  );
}

main();
