/**
 * Password reset flow — security & regression tests (hashed tokens, no Firestore where).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_COLLECTION,
  PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE,
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetLink,
  generateRawResetToken,
  getTrustedAppOrigin,
  hashResetToken,
  isTokenConsumable,
  normalizeResetEmail,
} from "@/lib/auth/passwordReset";
import {
  __resetPasswordResetRateLimitForTests,
  consumePasswordResetRateLimit,
  DEFAULT_FORGOT_PASSWORD_RATE_LIMIT,
} from "@/lib/auth/passwordResetRateLimit";

describe("passwordReset helpers", () => {
  it("normalizes and rejects malformed emails", () => {
    expect(normalizeResetEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(normalizeResetEmail("notanemail")).toBeNull();
    expect(normalizeResetEmail("@x.com")).toBeNull();
    expect(normalizeResetEmail("")).toBeNull();
  });

  it("generates cryptographically long raw tokens and hashes them", () => {
    const a = generateRawResetToken();
    const b = generateRawResetToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    const h = hashResetToken(a);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(hashResetToken(a));
    expect(h).not.toBe(a);
  });

  it("builds reset URL from trusted origin only", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.clinicbridge-ai.com";
    expect(getTrustedAppOrigin()).toBe("https://app.clinicbridge-ai.com");
    const link = buildPasswordResetLink("abcTOKEN");
    expect(link.startsWith("https://app.clinicbridge-ai.com/reset-password?token=")).toBe(true);
    expect(link).not.toContain("evil.com");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("keeps existing 15-minute TTL", () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("isTokenConsumable rejects used/expired", () => {
    const base = {
      userId: "u1",
      email: "a@b.com",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      used: false,
      status: "active" as const,
    };
    expect(isTokenConsumable(base).ok).toBe(true);
    expect(isTokenConsumable({ ...base, used: true, status: "used" }).ok).toBe(false);
    expect(isTokenConsumable({ ...base, expiresAt: Date.now() - 1 }).ok).toBe(false);
  });
});

describe("password reset rate limit", () => {
  beforeEach(() => {
    __resetPasswordResetRateLimitForTests();
  });

  it("allows up to maxAttempts then blocks", () => {
    const key = "fp:1.1.1.1:user@x.com";
    for (let i = 0; i < DEFAULT_FORGOT_PASSWORD_RATE_LIMIT.maxAttempts; i++) {
      expect(consumePasswordResetRateLimit(key).allowed).toBe(true);
    }
    const blocked = consumePasswordResetRateLimit(key);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });
});

describe("POST /api/auth/forgot-password", () => {
  const tokenWrites: Array<{ id: string; data: any }> = [];
  let getUserByEmailImpl: (email: string) => Promise<any>;
  let resendSendImpl: () => Promise<{ data: any; error: any }>;

  beforeEach(() => {
    vi.resetModules();
    __resetPasswordResetRateLimitForTests();
    tokenWrites.length = 0;
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.clinicbridge-ai.com";
    process.env.EMAIL_FROM = "ClinicBridge AI <info@clinicbridge-ai.com>";

    getUserByEmailImpl = async () => {
      const err: any = new Error("not found");
      err.code = "auth/user-not-found";
      throw err;
    };
    resendSendImpl = async () => ({ data: { id: "email_ok" }, error: null });

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminAuth: () => ({
        getUserByEmail: (email: string) => getUserByEmailImpl(email),
      }),
      getAdminDb: () => ({
        collection: (name: string) => {
          expect(name).toBe(PASSWORD_RESET_COLLECTION);
          return {
            doc: (id: string) => ({
              set: async (data: any) => {
                // raw token must never be persisted
                expect(JSON.stringify(data)).not.toMatch(/token/i);
                expect(data.userId).toBeTruthy();
                expect(id).toMatch(/^[a-f0-9]{64}$/);
                tokenWrites.push({ id, data });
              },
            }),
            // Guard: no query API used
            where: () => {
              throw new Error("where() must not be used in password reset");
            },
            add: () => {
              throw new Error("add() must not be used in password reset");
            },
          };
        },
      }),
    }));

    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: () => resendSendImpl(),
        };
      },
    }));
  });

  async function postForgot(email: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ email }),
    });
    const res = await POST(req);
    const body = await res.json();
    return { res, body };
  }

  it("malformed email → 400", async () => {
    const { res, body } = await postForgot("not-an-email");
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/e-posta/i);
  });

  it("unknown email → generic 200 (no token write)", async () => {
    const { res, body } = await postForgot("unknown@example.com");
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe(PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE);
    expect(tokenWrites).toHaveLength(0);
  });

  it("existing email + Resend success → same generic 200", async () => {
    getUserByEmailImpl = async () => ({ uid: "uid_existing", email: "known@example.com" });
    const { res, body } = await postForgot("known@example.com");
    expect(res.status).toBe(200);
    expect(body.message).toBe(PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE);
    expect(tokenWrites).toHaveLength(1);
    expect(tokenWrites[0].data.status).toBe("active");
    expect(tokenWrites[0].data.used).toBe(false);
    expect(tokenWrites[0].data).not.toHaveProperty("token");
  });

  it("Resend failure still returns generic 200 (no enumeration)", async () => {
    getUserByEmailImpl = async () => ({ uid: "uid_existing", email: "known@example.com" });
    resendSendImpl = async () => ({
      data: null,
      error: { name: "validation_error", message: "from domain not verified" },
    });
    const unknown = await postForgot("nouser@example.com");
    // reset modules state for second call with existing user
    const existing = await postForgot("known@example.com");
    expect(unknown.res.status).toBe(200);
    expect(existing.res.status).toBe(200);
    expect(unknown.body.message).toBe(existing.body.message);
  });

  it("missing RESEND_API_KEY → generic 200", async () => {
    delete process.env.RESEND_API_KEY;
    getUserByEmailImpl = async () => ({ uid: "uid_x", email: "x@example.com" });
    const { res, body } = await postForgot("x@example.com");
    expect(res.status).toBe(200);
    expect(body.message).toBe(PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE);
  });

  it("rate limit → 429", async () => {
    for (let i = 0; i < DEFAULT_FORGOT_PASSWORD_RATE_LIMIT.maxAttempts; i++) {
      const r = await postForgot("ratelimit@example.com", { "x-forwarded-for": "9.9.9.9" });
      expect(r.res.status).toBe(200);
    }
    const blocked = await postForgot("ratelimit@example.com", { "x-forwarded-for": "9.9.9.9" });
    expect(blocked.res.status).toBe(429);
    expect(blocked.body.error).toMatch(/Çok fazla deneme/i);
  });
});

describe("POST /api/auth/verify-reset-token", () => {
  const store = new Map<string, any>();

  beforeEach(() => {
    vi.resetModules();
    store.clear();
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: (id: string) => ({
            get: async () => ({
              exists: store.has(id),
              data: () => store.get(id),
              ref: {
                delete: async () => {
                  store.delete(id);
                },
              },
            }),
          }),
          where: () => {
            throw new Error("where() must not be used");
          },
        }),
      }),
    }));
  });

  async function postVerify(token: string) {
    const { POST } = await import("@/app/api/auth/verify-reset-token/route");
    const req = new Request("http://localhost/api/auth/verify-reset-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const res = await POST(req);
    return { res, body: await res.json() };
  }

  it("valid token → email", async () => {
    const raw = generateRawResetToken();
    store.set(hashResetToken(raw), {
      userId: "u1",
      email: "ok@example.com",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      used: false,
      status: "active",
    });
    const { res, body } = await postVerify(raw);
    expect(res.status).toBe(200);
    expect(body.email).toBe("ok@example.com");
  });

  it("invalid / missing document → 400", async () => {
    const { res } = await postVerify(generateRawResetToken());
    expect(res.status).toBe(400);
  });

  it("expired token → 400", async () => {
    const raw = generateRawResetToken();
    store.set(hashResetToken(raw), {
      userId: "u1",
      email: "ok@example.com",
      expiresAt: Date.now() - 1000,
      createdAt: Date.now() - 10_000,
      used: false,
      status: "active",
    });
    const { res } = await postVerify(raw);
    expect(res.status).toBe(400);
  });

  it("used token → 400", async () => {
    const raw = generateRawResetToken();
    store.set(hashResetToken(raw), {
      userId: "u1",
      email: "ok@example.com",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      used: true,
      status: "used",
    });
    const { res } = await postVerify(raw);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/reset-password", () => {
  const store = new Map<string, any>();
  let updateUserCalls: any[] = [];

  beforeEach(() => {
    vi.resetModules();
    store.clear();
    updateUserCalls = [];

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminAuth: () => ({
        updateUser: async (uid: string, data: any) => {
          updateUserCalls.push({ uid, data });
        },
      }),
      getAdminDb: () => ({
        collection: () => ({
          doc: (id: string) => ({
            // used by non-transaction mark/revert paths
            update: async (data: any) => {
              const prev = store.get(id) || {};
              const next = { ...prev };
              for (const [k, v] of Object.entries(data)) {
                if (v && typeof v === "object" && (v as any)._methodName === "FieldValue.delete") {
                  delete next[k];
                } else if (v && typeof v === "object" && typeof (v as any).isEqual === "function") {
                  delete next[k];
                } else {
                  next[k] = v;
                }
              }
              store.set(id, next);
            },
            set: async (data: any, opts?: any) => {
              if (opts?.merge) {
                store.set(id, { ...(store.get(id) || {}), ...data });
              } else {
                store.set(id, data);
              }
            },
          }),
          where: () => {
            throw new Error("where() must not be used");
          },
        }),
        runTransaction: async (fn: any) => {
          const tx = {
            get: async (ref: any) => {
              // Ref is opaque — we pass tokenRef from route; use last touched id via closure
              // Our mock doc() returns objects; transaction get receives tokenRef.
              // We store id on the ref.
              const id = ref.__id;
              return {
                exists: store.has(id),
                data: () => store.get(id),
              };
            },
            update: async (ref: any, data: any) => {
              const id = ref.__id;
              store.set(id, { ...(store.get(id) || {}), ...data });
            },
          };
          return fn(tx);
        },
      }),
    }));

    // Patch collection.doc to tag __id for transaction mock
    // Re-import after mock — enhance mock:
  });

  // More reliable mock: redefine in each test via fresh module mock with id-aware refs
  async function setupResetMocks() {
    vi.resetModules();
    store.clear();
    updateUserCalls = [];

    vi.doMock("firebase-admin/firestore", () => ({
      FieldValue: {
        delete: () => ({ _methodName: "FieldValue.delete" }),
      },
    }));

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminAuth: () => ({
        updateUser: async (uid: string, data: any) => {
          updateUserCalls.push({ uid, data });
        },
      }),
      getAdminDb: () => ({
        collection: () => ({
          doc: (id: string) => {
            const ref: any = {
              __id: id,
              update: async (data: any) => {
                const prev = { ...(store.get(id) || {}) };
                for (const [k, v] of Object.entries(data)) {
                  if (v && typeof v === "object" && (v as any)._methodName === "FieldValue.delete") {
                    delete prev[k];
                  } else {
                    prev[k] = v;
                  }
                }
                store.set(id, prev);
              },
              set: async (data: any, opts?: any) => {
                const cleaned = { ...data };
                for (const [k, v] of Object.entries(cleaned)) {
                  if (v && typeof v === "object" && (v as any)._methodName === "FieldValue.delete") {
                    delete cleaned[k];
                  }
                }
                if (opts?.merge) {
                  const merged = { ...(store.get(id) || {}), ...cleaned };
                  for (const [k, v] of Object.entries(data)) {
                    if (v && typeof v === "object" && (v as any)._methodName === "FieldValue.delete") {
                      delete merged[k];
                    }
                  }
                  store.set(id, merged);
                } else {
                  store.set(id, cleaned);
                }
              },
            };
            return ref;
          },
          where: () => {
            throw new Error("where() must not be used");
          },
        }),
        runTransaction: async (fn: any) => {
          const tx = {
            get: async (ref: any) => ({
              exists: store.has(ref.__id),
              data: () => store.get(ref.__id),
            }),
            update: async (ref: any, data: any) => {
              store.set(ref.__id, { ...(store.get(ref.__id) || {}), ...data });
            },
          };
          return fn(tx);
        },
      }),
    }));
  }

  async function postReset(token: string, newPassword: string) {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const req = new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const res = await POST(req);
    return { res, body: await res.json() };
  }

  it("valid token → password update + consumed; second use rejected", async () => {
    await setupResetMocks();
    const raw = generateRawResetToken();
    const id = hashResetToken(raw);
    store.set(id, {
      userId: "uid_1",
      email: "a@example.com",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      used: false,
      status: "active",
    });

    const first = await postReset(raw, "newpass1");
    expect(first.res.status).toBe(200);
    expect(updateUserCalls).toHaveLength(1);
    expect(updateUserCalls[0].uid).toBe("uid_1");
    expect(store.get(id).status).toBe("used");
    expect(store.get(id).used).toBe(true);

    const second = await postReset(raw, "newpass2");
    expect(second.res.status).toBe(400);
    expect(updateUserCalls).toHaveLength(1);
  });

  it("expired / invalid rejected", async () => {
    await setupResetMocks();
    const raw = generateRawResetToken();
    store.set(hashResetToken(raw), {
      userId: "uid_1",
      email: "a@example.com",
      expiresAt: Date.now() - 1,
      createdAt: Date.now() - 10_000,
      used: false,
      status: "active",
    });
    expect((await postReset(raw, "newpass1")).res.status).toBe(400);
    expect((await postReset(generateRawResetToken(), "newpass1")).res.status).toBe(400);
    expect(updateUserCalls).toHaveLength(0);
  });
});

describe("query regression — no where(email|token) in auth reset routes", () => {
  it("source files do not use Firestore where for email/token", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const root = process.cwd();
    const files = [
      "app/api/auth/forgot-password/route.ts",
      "app/api/auth/verify-reset-token/route.ts",
      "app/api/auth/reset-password/route.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src).not.toMatch(/\.where\(\s*["']email["']/);
      expect(src).not.toMatch(/\.where\(\s*["']token["']/);
      expect(src).not.toMatch(/where\("email"/);
      expect(src).not.toMatch(/where\("token"/);
    }
  });
});
