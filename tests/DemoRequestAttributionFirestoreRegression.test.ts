/**
 * Demo request API — Firestore undefined regression (production incident after 71a6dc0).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/demo-request — attribution must not break Firestore write", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RESEND_API_KEY = "test-resend-key";
  });

  function makeAdminDb(addImpl: (data: any) => Promise<{ id: string }>) {
    return {
      collection: () => ({
        add: addImpl,
      }),
    };
  }

  it("UTM attribution without click ids persists successfully (no undefined)", async () => {
    const writes: any[] = [];
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () =>
        makeAdminDb(async (data) => {
          // Simulate Firestore: reject undefined nested values
          const walk = (v: unknown, path: string) => {
            if (v === undefined) throw new Error(`Firestore undefined at ${path}`);
            if (v && typeof v === "object") {
              for (const [k, nested] of Object.entries(v as object)) {
                walk(nested, `${path}.${k}`);
              }
            }
          };
          walk(data, "doc");
          writes.push(data);
          return { id: "doc_ok" };
        }),
    }));
    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn(async () => ({ data: { id: "email_1" }, error: null })),
        };
      },
    }));

    const { POST } = await import("@/app/api/demo-request/route");
    const req = new Request("http://localhost/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Prod Test",
        clinicName: "Prod Clinic",
        phone: "+905551112233",
        email: "prod@example.com",
        website: "",
        message: "test",
        attribution: {
          firstTouch: {
            source: "google",
            medium: "cpc",
            campaign: "test_attribution",
            landingPage: "/",
            referrer: "",
            capturedAt: "2026-09-21T10:00:00.000Z",
          },
          lastTouch: {
            source: "google",
            medium: "cpc",
            campaign: "test_attribution",
            page: "/",
            referrer: "",
            capturedAt: "2026-09-21T10:00:00.000Z",
          },
          identifiers: {},
          leadSourceLabel: "Google Ads",
          version: 1,
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writes.length).toBe(1);
    expect(writes[0].attribution).toBeTruthy();
    expect(writes[0].leadSourceLabel).toBe("Google Ads");
  });

  it("core demo request without attribution still succeeds", async () => {
    const writes: any[] = [];
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () =>
        makeAdminDb(async (data) => {
          writes.push(data);
          return { id: "doc_core" };
        }),
    }));
    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn(async () => ({ data: { id: "email_2" }, error: null })),
        };
      },
    }));

    const { POST } = await import("@/app/api/demo-request/route");
    const req = new Request("http://localhost/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "No Attr",
        clinicName: "Clinic",
        phone: "555",
        email: "",
        website: "",
        message: "",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(writes[0].attribution).toBeUndefined();
  });

  it("if attribution write somehow fails, core lead is still persisted", async () => {
    let attempt = 0;
    const writes: any[] = [];
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () =>
        makeAdminDb(async (data) => {
          attempt += 1;
          if (attempt === 1 && data.attribution) {
            throw new Error("Cannot use undefined as a Firestore value");
          }
          writes.push(data);
          return { id: `doc_${attempt}` };
        }),
    }));
    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn(async () => ({ data: { id: "email_3" }, error: null })),
        };
      },
    }));
    // Force a bad attribution object past sanitize by mocking sanitize to return undefined props
    vi.doMock("@/lib/attribution", async () => {
      const actual = await vi.importActual<any>("@/lib/attribution");
      return {
        ...actual,
        sanitizeAttributionPayload: () => ({
          firstTouch: { source: "google", medium: "cpc", campaign: "x", landingPage: "/", referrer: "", capturedAt: "t", term: undefined },
          lastTouch: { source: "google", medium: "cpc", campaign: "x", page: "/", referrer: "", capturedAt: "t" },
          identifiers: { gclid: undefined },
          leadSourceLabel: "Google Ads",
          version: 1,
        }),
      };
    });

    const { POST } = await import("@/app/api/demo-request/route");
    const req = new Request("http://localhost/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Retry User",
        clinicName: "Retry Clinic",
        phone: "555",
        email: "r@example.com",
        website: "",
        message: "",
        attribution: { firstTouch: { source: "google" } },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // First attempt may be stripped by stripUndefinedDeep and succeed in one write,
    // OR retry core-only. Either way lead is stored.
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[writes.length - 1].fullName).toBe("Retry User");
  });
});
