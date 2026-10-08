/**
 * Phase 3 Security Steps 1.5 / 5.5 / 5.7 — voice infrastructure collections are server-only,
 * every other path keeps current production behavior (authenticated read/write, anonymous denied).
 *
 * Static model of firestore.rules (no emulator in this repo). Mirrors Firestore's
 * additive semantics: a request is allowed if ANY matching `allow` grants it.
 * Unknown rule conditions or unparseable allow statements throw so rule changes
 * cannot silently bypass the model. Collection-group queries are not modelled.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const RULES_SRC = readFileSync(resolve(__dirname, "..", "firestore.rules"), "utf8");

type Method = "get" | "list" | "create" | "update" | "delete";
const ALL_METHODS: Method[] = ["get", "list", "create", "update", "delete"];

interface AllowRule {
  pattern: string[];
  methods: Set<Method>;
  condition: string;
}

function expandMethods(raw: string): Set<Method> {
  const out = new Set<Method>();
  for (const m of raw.split(",").map((s) => s.trim())) {
    if (m === "read") ["get", "list"].forEach((x) => out.add(x as Method));
    else if (m === "write") ["create", "update", "delete"].forEach((x) => out.add(x as Method));
    else if ((ALL_METHODS as string[]).includes(m)) out.add(m as Method);
    else throw new Error(`Unsupported rule method: ${m}`);
  }
  return out;
}

function parseRules(src: string) {
  const stack: Array<string | null> = [];
  const allows: AllowRule[] = [];
  let pendingAllow: string | null = null;
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    if (pendingAllow !== null || /^allow\s/.test(line)) {
      pendingAllow = pendingAllow === null ? line : `${pendingAllow} ${line}`;
      if (!pendingAllow.endsWith(";")) continue;
      const allow = pendingAllow.match(/^allow\s+([\w,\s]+):\s*if\s+(.+);$/);
      if (!allow) throw new Error(`Unparseable allow statement: ${pendingAllow}`);
      const pattern = stack
        .filter((p): p is string => p !== null)
        .join("")
        .split("/")
        .filter(Boolean);
      allows.push({ pattern, methods: expandMethods(allow[1]), condition: allow[2].trim() });
      pendingAllow = null;
      continue;
    }
    const match = line.match(/^match\s+(\S+)\s*\{$/);
    if (match) {
      stack.push(match[1]);
      continue;
    }
    if (line === "}") {
      stack.pop();
      continue;
    }
    if (line.endsWith("{")) stack.push(null);
  }
  if (pendingAllow !== null) throw new Error(`Unterminated allow statement: ${pendingAllow}`);
  if (stack.length !== 0) throw new Error("Unbalanced rules braces");

  const functions: Record<string, string[]> = {};
  const fnRe = /function\s+(\w+)\((\w+)\)\s*\{\s*return\s+\2\s+in\s+\[([^\]]*)\];\s*\}/g;
  for (const m of src.matchAll(fnRe)) {
    functions[m[1]] = m[3]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
  }
  return { allows, functions };
}

const { allows, functions } = parseRules(RULES_SRC);

function matchPattern(pattern: string[], path: string[]): Record<string, string> | null {
  const bindings: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    const recursive = seg.match(/^\{(\w+)=\*\*\}$/);
    if (recursive) {
      if (i !== pattern.length - 1) throw new Error(`Non-terminal recursive wildcard: ${pattern.join("/")}`);
      bindings[recursive[1]] = path.slice(i).join("/");
      return bindings;
    }
    if (i >= path.length) return null;
    const single = seg.match(/^\{(\w+)\}$/);
    if (single) bindings[single[1]] = path[i];
    else if (seg !== path[i]) return null;
  }
  return pattern.length === path.length ? bindings : null;
}

function evalCondition(condition: string, auth: boolean, bindings: Record<string, string>): boolean {
  return condition.split("&&").every((rawAtom) => {
    const atom = rawAtom.trim();
    if (atom === "true") return true;
    if (atom === "false") return false;
    if (atom === "request.auth != null") return auth;
    const call = atom.match(/^(!)?(\w+)\((\w+)\)$/);
    if (call) {
      const list = functions[call[2]];
      const value = bindings[call[3]];
      if (!list || value === undefined) throw new Error(`Unresolvable rule call: ${atom}`);
      const result = list.includes(value);
      return call[1] ? !result : result;
    }
    throw new Error(`Unsupported rule condition: ${atom}`);
  });
}

function isAllowed(method: Method, docPath: string, auth: boolean): boolean {
  const path = ["databases", "(default)", "documents", ...docPath.split("/")];
  return allows.some((rule) => {
    if (!rule.methods.has(method)) return false;
    const bindings = matchPattern(rule.pattern, path);
    return bindings !== null && evalCondition(rule.condition, auth, bindings);
  });
}

const VOICE_COLLECTIONS = ["voiceNumbers", "voiceCallSessions", "voiceCalls", "voiceRuntimeLeases"] as const;

describe("firestore.rules — voice infrastructure is server-only", () => {
  it("parses rules and the server-only list", () => {
    expect(allows.length).toBeGreaterThan(0);
    expect(functions.isServerOnlyCollection).toEqual([...VOICE_COLLECTIONS]);
  });

  it("contains only the four voice deny blocks plus the authenticated catch-all (no unrelated rules)", () => {
    expect(allows).toHaveLength(VOICE_COLLECTIONS.length + 1);
    const catchAll = allows.filter((rule) => rule.condition !== "false");
    expect(catchAll).toHaveLength(1);
    expect(catchAll[0].pattern.slice(3)).toEqual(["{collectionId}", "{document=**}"]);
    expect(catchAll[0].condition).toBe("request.auth != null && !isServerOnlyCollection(collectionId)");
    expect([...catchAll[0].methods].sort()).toEqual([...ALL_METHODS].sort());
  });

  for (const collection of VOICE_COLLECTIONS) {
    for (const auth of [false, true]) {
      const who = auth ? "authenticated" : "unauthenticated";
      it(`${who} client cannot read or write ${collection}`, () => {
        for (const method of ALL_METHODS) {
          expect(isAllowed(method, `${collection}/doc1`, auth)).toBe(false);
          expect(isAllowed(method, `${collection}/doc1/sub/doc2`, auth)).toBe(false);
        }
      });
    }
  }

  it("has no root recursive catch-all that would re-grant voice paths", () => {
    expect(RULES_SRC).not.toMatch(/match\s+\/\{\w+=\*\*\}\s*\{/);
  });

  it("has no leading recursive (collection-group style) rule that could re-open nested voice paths", () => {
    // Known caveat: without such a rule, generic client collection-group queries that the
    // live root `/{document=**}` rule authorized are no longer authorized. No client code uses them.
    expect(RULES_SRC).not.toMatch(/match\s+\/\{\w+=\*\*\}\//);
  });

  it("every server-only collection has an explicit deny block (documentation of intent)", () => {
    for (const collection of VOICE_COLLECTIONS) {
      expect(RULES_SRC).toMatch(
        new RegExp(`match\\s+/${collection}/\\{document=\\*\\*\\}\\s*\\{\\s*allow read, write: if false;\\s*\\}`)
      );
    }
  });
});

describe("firestore.rules — voiceRuntimeLeases (Step 5.5)", () => {
  const LEASE_DOC = "voiceRuntimeLeases/vc_0123456789abcdef0123456789abcdef";

  it.each(ALL_METHODS)("anonymous %s is denied", (method) => {
    expect(isAllowed(method, LEASE_DOC, false)).toBe(false);
  });

  it.each(ALL_METHODS)("authenticated %s is denied", (method) => {
    expect(isAllowed(method, LEASE_DOC, true)).toBe(false);
  });

  it("nested paths under voiceRuntimeLeases are denied for every method and auth state", () => {
    for (const nested of [`${LEASE_DOC}/history/h1`, `${LEASE_DOC}/a/b/c/d`]) {
      for (const method of ALL_METHODS) {
        expect(isAllowed(method, nested, false)).toBe(false);
        expect(isAllowed(method, nested, true)).toBe(false);
      }
    }
  });

  it("only the exact collection id is protected (similar names keep catch-all behavior)", () => {
    expect(isAllowed("get", "voiceRuntimeLeasesArchive/x", true)).toBe(true);
    expect(isAllowed("get", "clinics/c1/voiceRuntimeLeases/x", true)).toBe(true);
  });
});

/**
 * Live production (project `clinicbridge`) is a single root rule:
 *   match /{document=**} { allow read, write: if request.auth != null; }
 * Every non-voice document path must keep exactly that behavior.
 */
const NON_VOICE_PATHS = [
  "clinics/c1",
  "clinics/c1/conversationLogs/conv1",
  "clinics/c1/conversationLogs/conv1/messages/m1",
  "clinics/c1/appointments/a1",
  "clinics/c1/settings/notifications",
  "users/u1",
  "promptSettings/c1",
  "widgetSettings/c1",
  "trainingMaterials/t1",
  "appointments/a1",
  "patients/p1",
  "agencies/a1",
  "agencies/a1/config/main",
  "agencies/a1/clinics/c1",
  "agencies/a1/clinics/c1/pricing/p1",
  "agencies/a1/leads/l1",
  "agencies/a1/quotes/q1",
  "agency_locations/loc1",
  "knowledge_documents/k1",
  "demoRequests/d1",
  "demoRequests/d1/notes/n1",
  "aiUsage/u1",
  "aiUsageDaily/c1_2026-10-07",
  "aiModelPricing/m1",
] as const;

describe("firestore.rules — production parity for every non-voice path (Step 5.7)", () => {
  for (const path of NON_VOICE_PATHS) {
    it(`authenticated client keeps full read/write on ${path}`, () => {
      for (const method of ALL_METHODS) {
        expect(isAllowed(method, path, true)).toBe(true);
      }
    });

    it(`anonymous client stays denied on ${path}`, () => {
      for (const method of ALL_METHODS) {
        expect(isAllowed(method, path, false)).toBe(false);
      }
    });
  }

  it("anonymous demoRequests create is denied (never deployed; landing page writes via Admin SDK API route)", () => {
    expect(isAllowed("create", "demoRequests/d1", false)).toBe(false);
  });

  it("authenticated demoRequests access (admin list + status update) stays allowed", () => {
    expect(isAllowed("list", "demoRequests/d1", true)).toBe(true);
    expect(isAllowed("update", "demoRequests/d1", true)).toBe(true);
  });

  it("aiUsage, aiUsageDaily, aiModelPricing keep current production authenticated access (not hardened here)", () => {
    for (const collection of ["aiUsage", "aiUsageDaily", "aiModelPricing"]) {
      for (const method of ALL_METHODS) {
        expect(isAllowed(method, `${collection}/x`, true)).toBe(true);
        expect(isAllowed(method, `${collection}/x`, false)).toBe(false);
      }
    }
  });

  it("no rule grants anonymous access anywhere", () => {
    expect(RULES_SRC).not.toMatch(/if\s+true\s*;/);
    for (const rule of allows) {
      expect(rule.condition === "false" || rule.condition.startsWith("request.auth != null")).toBe(true);
    }
  });
});
