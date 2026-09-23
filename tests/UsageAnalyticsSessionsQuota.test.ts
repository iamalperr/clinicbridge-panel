/**
 * Kullanım Analitiği — quota / cost regression tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANALYTICS_SESSION_WINDOW_MS,
  USER_SESSIONS_QUERY_HARD_LIMIT,
  assertAnalyticsSessionQueryIsBounded,
  buildAnalyticsSessionQueryPlan,
} from "@/lib/services/analytics/userSessionsQuery";

describe("userSessionsQuery plan", () => {
  it("date_window plan is time-bounded and capped (≤500 enrichment reads)", () => {
    const now = 1_700_000_000_000;
    const plan = buildAnalyticsSessionQueryPlan({ now });
    expect(plan.mode).toBe("date_window");
    expect(plan.sinceMs).toBe(now - ANALYTICS_SESSION_WINDOW_MS);
    expect(plan.hardLimit).toBe(USER_SESSIONS_QUERY_HARD_LIMIT);
    expect(plan.hardLimit).toBeLessThanOrEqual(500);
    expect(plan.timeFields).toEqual(["last_activity_at"]);
    expect(() => assertAnalyticsSessionQueryIsBounded(plan)).not.toThrow();
  });

  it("filtered user plan requires user_id Firestore filter", () => {
    const plan = buildAnalyticsSessionQueryPlan({ userIds: ["uid_abc", "doc_xyz"] });
    expect(plan.mode).toBe("user_and_date");
    expect(plan.userIds).toEqual(["uid_abc", "doc_xyz"]);
  });

  it("page-load session enrichment cost does not scale with lifetime collection size", () => {
    const plan = buildAnalyticsSessionQueryPlan({ now: Date.now() });
    const maxEnrichmentReads = plan.hardLimit * plan.timeFields.length;
    expect(maxEnrichmentReads).toBeLessThanOrEqual(500);
    expect(maxEnrichmentReads).toBeLessThan(5091);
    expect(maxEnrichmentReads * 2).toBeLessThan(5000); // even if called twice, still below old page cost
  });
});

describe("analytics architecture — no duplicate session scans on page", () => {
  const root = process.cwd();

  it("usage-analytics page calls unified /api/admin/analytics once", () => {
    const src = readFileSync(join(root, "app/admin/usage-analytics/page.tsx"), "utf8");
    expect(src).toMatch(/\/api\/admin\/analytics/);
    expect(src).not.toMatch(/\/api\/admin\/analytics\/summary/);
    expect(src).not.toMatch(/\/api\/admin\/analytics\/users/);
    expect(src).not.toMatch(/Promise\.all/);
  });

  it("unified route and loaders do not full-scan user_sessions", () => {
    for (const rel of [
      "app/api/admin/analytics/route.ts",
      "lib/services/analytics/loadUsageAnalytics.ts",
      "app/api/admin/analytics/summary/route.ts",
      "app/api/admin/analytics/users/route.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toMatch(/collection\(\s*["']user_sessions["']\s*\)\s*\.get\s*\(/);
    }
  });

  it("truncation is explicit in loader metadata contract", () => {
    const src = readFileSync(
      join(root, "lib/services/analytics/loadUsageAnalytics.ts"),
      "utf8"
    );
    expect(src).toMatch(/sessionStatsPartial/);
    expect(src).toMatch(/summaryReliable/);
    expect(src).toMatch(/truncated/);
  });

  it("UI surfaces truncation and does not paint error as zero KPIs", () => {
    const src = readFileSync(join(root, "app/admin/usage-analytics/page.tsx"), "utf8");
    expect(src).toMatch(/meta\?\.truncated/);
    expect(src).toMatch(/error \? "—"/);
    expect(src).toMatch(/Analitik verileri yüklenemedi/);
  });

  it("export route stays session-scan free and row-capped", () => {
    const src = readFileSync(
      join(root, "app/api/admin/analytics/export/route.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/user_sessions/);
    expect(src).toMatch(/MAX_EXPORT_ROWS/);
  });
});
