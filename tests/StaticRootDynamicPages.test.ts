import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = path.join(process.cwd(), "app");

function collectPages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collectPages(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

function isClientComponent(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\s)*["']use client["']/.test(source);
}

const READS_REQUEST = /\bsearchParams\b|\bheaders\(\)|\bcookies\(\)/;
const FORCE_DYNAMIC = /export const dynamic\s*=\s*["']force-dynamic["']/;

describe("root layout is force-static — request-reading server pages must opt out", () => {
  it("root layout is force-static (precondition for this guard)", () => {
    const layout = readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");
    expect(layout).toMatch(/export const dynamic\s*=\s*["']force-static["']/);
  });

  it("appointment verify page renders per request (token comes from the query string)", () => {
    const page = readFileSync(path.join(APP_DIR, "action/appointment/verify/page.tsx"), "utf8");
    expect(page).toMatch(FORCE_DYNAMIC);
  });

  it("every server page that reads searchParams/headers()/cookies() exports force-dynamic", () => {
    const offenders = collectPages(APP_DIR)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !isClientComponent(source) && READS_REQUEST.test(source) && !FORCE_DYNAMIC.test(source);
      })
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
