/**
 * Stages the worker-only LiveKit Cloud build context in workers/voice/.pilot-stage/.
 *
 * - Rebuilds dist, then copies an explicit allowlist (Dockerfile, .dockerignore, manifests,
 *   dist/main.mjs, dist/agent.mjs). Root files, env files and source maps are never staged.
 * - An existing livekit.toml (project subdomain + agent id, no secrets) is preserved so
 *   `lk agent deploy` keeps targeting the same agent.
 * - Fails and removes the stage if any staged file looks like an env file or contains
 *   credential-shaped content. Prints file names and hashes only.
 *
 * Run `lk agent create|deploy` from the stage directory with an explicit `--secrets-file`
 * that lives outside the repository; without it the CLI offers to upload .env/.env.local.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = fileURLToPath(new URL("..", import.meta.url));
const stageDir = join(workerDir, ".pilot-stage");
const PRESERVED = new Set(["livekit.toml"]);
const STAGED_FILES = ["Dockerfile", ".dockerignore", "package.json", "package-lock.json", "dist/main.mjs", "dist/agent.mjs"];
const FORBIDDEN_NAME = /^\.env($|\.)|\.(pem|p12|key)$|service[-_]?account.*\.json$/i;
const FORBIDDEN_CONTENT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bre_[A-Za-z0-9]{24,}/,
];

function listFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

execFileSync(process.execPath, ["build.mjs"], { cwd: workerDir, stdio: "inherit" });

if (existsSync(stageDir)) {
  for (const entry of readdirSync(stageDir)) {
    if (!PRESERVED.has(entry)) rmSync(join(stageDir, entry), { recursive: true, force: true });
  }
}
mkdirSync(join(stageDir, "dist"), { recursive: true });
for (const file of STAGED_FILES) copyFileSync(join(workerDir, file), join(stageDir, file));

const violations = [];
const manifest = [];
for (const full of listFiles(stageDir)) {
  const rel = relative(stageDir, full);
  const name = rel.split("/").pop() ?? rel;
  if (FORBIDDEN_NAME.test(name)) violations.push(`${rel}: forbidden file name`);
  const content = readFileSync(full);
  const text = content.toString("utf8");
  for (const pattern of FORBIDDEN_CONTENT) {
    if (pattern.test(text)) violations.push(`${rel}: credential-shaped content (${pattern.source.slice(0, 24)}…)`);
  }
  manifest.push(`${createHash("sha256").update(content).digest("hex").slice(0, 16)}  ${rel}`);
}

if (violations.length > 0) {
  rmSync(stageDir, { recursive: true, force: true });
  console.error(JSON.stringify({ checkpoint: "VOICE_PILOT_STAGE_REFUSED", violations }));
  process.exit(1);
}

console.log(`Staged ${manifest.length} files in ${relative(process.cwd(), stageDir) || "."}:`);
for (const line of manifest.sort()) console.log(`  ${line}`);
