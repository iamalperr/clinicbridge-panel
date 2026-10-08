/**
 * Bundles the voice worker to Node ESM.
 *
 * - Local sources and shared ClinicBridge modules (`@/…` via tsconfig paths) are bundled.
 * - Every package import stays external and resolves from workers/voice/node_modules at runtime,
 *   so native LiveKit/Firebase modules are never inlined and firebase-admin stays a single instance.
 * - lib/firebase-admin.ts uses CommonJS `require`; the banner provides a real `require` in ESM.
 */

import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const workerDir = fileURLToPath(new URL(".", import.meta.url));

await build({
  absWorkingDir: workerDir,
  entryPoints: { main: "src/main.ts", agent: "src/agent.ts", runtimeGraph: "src/runtimeGraph.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  tsconfig: "tsconfig.json",
  banner: {
    js: 'import { createRequire as __voiceWorkerCreateRequire } from "node:module";\nconst require = __voiceWorkerCreateRequire(import.meta.url);',
  },
  sourcemap: true,
  logLevel: "info",
});
