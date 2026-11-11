/**
 * Clinic-staff WhatsApp notifications (Meta Cloud API).
 * Meta is mocked; no real network and no secret values in assertions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

import {
  DEFAULT_WHATSAPP_GRAPH_VERSION,
  WHATSAPP_TEMPLATE_NAME,
  getWhatsAppSendConfig,
} from "@/lib/services/notifications/whatsapp/config";
import {
  buildPanelLink,
  buildTemplateBodyParams,
  formatPreferredDate,
  isValidE164,
  redactPatientName,
  resolveTemplateLanguage,
  toWhatsAppRecipient,
} from "@/lib/services/notifications/whatsapp/templateParams";
import {
  buildTemplateRequestBody,
  mapMetaErrorCode,
  sendWhatsAppTemplate,
} from "@/lib/services/notifications/whatsapp/WhatsAppCloudProvider";
import {
  buildWhatsAppSettingsUpdate,
  emptyWhatsAppSettings,
} from "@/lib/services/notifications/whatsapp/settings";
import { sendClinicStaffWhatsApp } from "@/lib/services/notifications/whatsapp/sendClinicStaffWhatsApp";
import {
  buildStaffAutoReply,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookChallenge,
  maybeAutoReplyToStaff,
  applyWhatsAppStatusUpdate,
} from "@/lib/services/notifications/whatsapp/webhook";
import { ACTIVE_NOTIFICATION_CHANNELS, normalizeLegacyChannel } from "@/lib/services/channelPolicyService";
import { sendSms } from "@/lib/sms/sendSms";

type FetchMock = ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>;

function mockFetch(handler: (input: string, init?: RequestInit) => Promise<Response>): FetchMock {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(handler);
}

const ENV_KEYS = [
  "WHATSAPP_NOTIFICATIONS_ENABLED",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "SMS_PROVIDER",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
});

describe("template params", () => {
  it("builds the Meta request shape with body params in order", () => {
    const body = buildTemplateRequestBody("905321112233", WHATSAPP_TEMPLATE_NAME, "tr", [
      "Ahmet Y.",
      "İmplant",
      "12 Kasım 2026",
      "https://app.clinicbridge-ai.com/clinics/c1/appointments?appointmentId=a1",
    ]);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "905321112233",
      type: "template",
      template: {
        name: "new_appointment_request",
        language: { code: "tr" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ahmet Y." },
              { type: "text", text: "İmplant" },
              { type: "text", text: "12 Kasım 2026" },
              {
                type: "text",
                text: "https://app.clinicbridge-ai.com/clinics/c1/appointments?appointmentId=a1",
              },
            ],
          },
        ],
      },
    });
  });

  it("redacts the patient name to first name + last initial only", () => {
    expect(redactPatientName("Ahmet Can Yılmaz", "tr")).toBe("Ahmet Y.");
    expect(redactPatientName("Jane Doe", "en")).toBe("Jane D.");
    expect(redactPatientName("Tek", "tr")).toBe("Tek");
    expect(redactPatientName("Ahmet 5551234567", "tr")).toBe("Ahmet");
    expect(redactPatientName("hasta@ornek.com", "tr")).toBe("-");
    expect(redactPatientName("", "en")).toBe("-");
    expect(redactPatientName(null, "en")).toBe("-");
  });

  it("formats preferred dates for the language and drops invalid values", () => {
    expect(formatPreferredDate("2026-11-12", "14:30", "tr")).toMatch(/2026/);
    expect(formatPreferredDate("2026-11-12", "14:30", "tr")).toContain("14:30");
    expect(formatPreferredDate("not-a-date", "10:00", "en")).toBe("-");
    expect(formatPreferredDate(undefined, undefined, "en")).toBe("-");
  });

  it("never puts health notes, phone or email into the four params", () => {
    const params = buildTemplateBodyParams({
      language: "tr",
      patientName: "Ayşe Demir",
      treatment: "Diş eti iltihabı ve ağrı",
      preferredDate: "2026-11-12",
      preferredTime: "09:00",
      panelLink: "https://app.clinicbridge-ai.com/clinics/c1/appointments?appointmentId=a9",
    });
    expect(params).toHaveLength(4);
    expect(params[0]).toBe("Ayşe D.");
    expect(params.join(" ")).not.toMatch(/@|05\d{9}|\+90/);
    expect(params[3]).toContain("/appointments?appointmentId=a9");
  });

  it("rejects invalid E.164 numbers", () => {
    expect(isValidE164("+905321112233")).toBe(true);
    expect(toWhatsAppRecipient("+905321112233")).toBe("905321112233");
    expect(isValidE164("05321112233")).toBe(false);
    expect(isValidE164("+90 532 111 22 33")).toBe(false);
    expect(isValidE164("")).toBe(false);
  });

  it("resolves template language from clinic default, else en", () => {
    expect(resolveTemplateLanguage({ defaultLanguage: "tr" })).toBe("tr");
    expect(resolveTemplateLanguage({ language: "en-US" })).toBe("en");
    expect(resolveTemplateLanguage({ defaultLanguage: "de" })).toBe("en");
    expect(resolveTemplateLanguage(null)).toBe("en");
  });

  it("builds panel deep links for appointments and contact requests", () => {
    expect(
      buildPanelLink({
        baseUrl: "https://app.clinicbridge-ai.com",
        clinicId: "c1",
        kind: "appointment",
        recordId: "a1",
      })
    ).toBe("https://app.clinicbridge-ai.com/clinics/c1/appointments?appointmentId=a1");
    expect(
      buildPanelLink({
        baseUrl: "https://app.clinicbridge-ai.com",
        clinicId: "c1",
        kind: "contact_request",
        conversationId: "sess_1",
      })
    ).toBe("https://app.clinicbridge-ai.com/clinics/c1/logs?conversationId=sess_1");
  });
});

describe("kill switch and Meta errors", () => {
  it("skips when the kill switch is off", () => {
    expect(getWhatsAppSendConfig({}).ok).toBe(false);
    const disabled = getWhatsAppSendConfig({ WHATSAPP_NOTIFICATIONS_ENABLED: "false" });
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) expect(disabled.reason).toBe("disabled");
  });

  it("skips when required env is missing even if enabled", () => {
    const result = getWhatsAppSendConfig({ WHATSAPP_NOTIFICATIONS_ENABLED: "true" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_env");
      expect(result.missing).toEqual(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
    }
  });

  it("defaults the Graph version and maps Meta error codes", () => {
    const ok = getWhatsAppSendConfig({
      WHATSAPP_NOTIFICATIONS_ENABLED: "true",
      WHATSAPP_ACCESS_TOKEN: "tok",
      WHATSAPP_PHONE_NUMBER_ID: "123",
    });
    expect(ok.ok && ok.config.graphVersion).toBe(DEFAULT_WHATSAPP_GRAPH_VERSION);
    expect(mapMetaErrorCode(190)).toBe("auth_failed");
    expect(mapMetaErrorCode(132001)).toBe("template_not_found");
    expect(mapMetaErrorCode(131026)).toBe("recipient_unavailable");
    expect(mapMetaErrorCode(130429)).toBe("rate_limited");
  });

  it("sendWhatsAppTemplate posts the template and returns the message id", async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 })
    );
    const result = await sendWhatsAppTemplate({
      to: "+905321112233",
      templateName: WHATSAPP_TEMPLATE_NAME,
      language: "tr",
      bodyParams: ["Ahmet Y.", "İmplant", "12 Kasım 2026", "https://app.clinicbridge-ai.com/x"],
      config: { accessToken: "tok", phoneNumberId: "pnid", graphVersion: "v25.0" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: "sent", messageId: "wamid.ABC", httpStatus: 200 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/pnid/messages");
    const init = fetchImpl.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
    });
    const posted = JSON.parse(String(init.body));
    expect(posted.template.name).toBe("new_appointment_request");
    expect(posted.template.components[0].parameters).toHaveLength(4);
  });

  it("maps a Meta 132001 response to template_not_found", async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ error: { code: 132001, message: "missing" } }), { status: 400 })
    );
    const result = await sendWhatsAppTemplate({
      to: "+905321112233",
      templateName: WHATSAPP_TEMPLATE_NAME,
      language: "en",
      bodyParams: ["A", "B", "C", "D"],
      config: { accessToken: "tok", phoneNumberId: "pnid", graphVersion: "v25.0" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ status: "failed", errorCode: "template_not_found", metaErrorCode: 132001 });
  });
});

describe("settings validation", () => {
  it("requires opt-in and valid E.164, and preserves prior consent timestamps", () => {
    const previous = emptyWhatsAppSettings("c1");
    previous.recipients = [
      { phone: "+905321112233", optIn: true, optInAt: "2026-01-01T00:00:00.000Z", optInBy: "u1" },
    ];
    const ok = buildWhatsAppSettingsUpdate({
      clinicId: "c1",
      enabled: true,
      recipients: [{ phone: "+905321112233", optIn: true }],
      previous,
      actorUid: "u2",
      now: new Date("2026-11-11T10:00:00.000Z"),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.settings.recipients[0].optInAt).toBe("2026-01-01T00:00:00.000Z");
      expect(ok.settings.recipients[0].optInBy).toBe("u1");
    }

    const missingOptIn = buildWhatsAppSettingsUpdate({
      clinicId: "c1",
      enabled: true,
      recipients: [{ phone: "+905321112233", optIn: false }],
      previous: null,
      actorUid: "u2",
      now: new Date(),
    });
    expect(missingOptIn.ok).toBe(false);
    if (!missingOptIn.ok) expect(missingOptIn.errors[0].code).toBe("opt_in_required");

    const badNumber = buildWhatsAppSettingsUpdate({
      clinicId: "c1",
      enabled: true,
      recipients: [{ phone: "05321112233", optIn: true }],
      previous: null,
      actorUid: "u2",
      now: new Date(),
    });
    expect(badNumber.ok).toBe(false);
    if (!badNumber.ok) expect(badNumber.errors[0].code).toBe("invalid_number");
  });
});

describe("delivery orchestration", () => {
  function fakeDb(settings: Record<string, unknown> | null) {
    const adds: Record<string, unknown>[] = [];
    return {
      adds,
      db: {
        collection: (name: string) => {
          if (name === "clinicWhatsappSettings") {
            return {
              doc: () => ({
                get: async () => ({
                  exists: !!settings,
                  data: () => settings || undefined,
                }),
              }),
            };
          }
          if (name === "whatsappNotifications") {
            return {
              add: async (doc: Record<string, unknown>) => {
                adds.push(doc);
                return { id: `n_${adds.length}` };
              },
            };
          }
          return { doc: () => ({ get: async () => ({ exists: false }) }) };
        },
      } as any,
    };
  }

  it("skips silently when the kill switch is off", async () => {
    const { db } = fakeDb({
      enabled: true,
      recipients: [{ phone: "+905321112233", optIn: true, optInAt: "2026-01-01T00:00:00.000Z", optInBy: "u1" }],
    });
    const fetchImpl = mockFetch(async () => new Response("{}", { status: 500 }));
    const result = await sendClinicStaffWhatsApp({
      clinicId: "c1",
      kind: "appointment",
      patientName: "Ahmet Yılmaz",
      treatment: "İmplant",
      preferredDate: "2026-11-12",
      db,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("skipped");
    expect(result.results[0].reason).toBe("kill_switch");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends when enabled and stores the outbound message id without patient PII", async () => {
    process.env.WHATSAPP_NOTIFICATIONS_ENABLED = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "pnid";
    const { db, adds } = fakeDb({
      enabled: true,
      recipients: [{ phone: "+905321112233", optIn: true, optInAt: "2026-01-01T00:00:00.000Z", optInBy: "u1" }],
    });
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })
    );
    const result = await sendClinicStaffWhatsApp({
      clinicId: "c1",
      clinicData: { defaultLanguage: "tr" },
      kind: "appointment",
      recordId: "a1",
      patientName: "Ahmet Yılmaz",
      treatment: "İmplant",
      preferredDate: "2026-11-12",
      preferredTime: "10:00",
      db,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("sent");
    expect(result.results[0].messageId).toBe("wamid.1");
    expect(adds[0]).toMatchObject({
      messageId: "wamid.1",
      status: "sent",
      clinicId: "c1",
      recipientMasked: "***33",
    });
    // Stored delivery log must not keep the patient display name, notes, email or full E.164.
    expect(JSON.stringify(adds[0])).not.toMatch(/Ahmet Yılmaz|Yılmaz|@|\+905/);
    const posted = JSON.parse(String(fetchImpl.mock.calls[0][1]!.body));
    expect(posted.template.components[0].parameters[0].text).toBe("Ahmet Y.");
  });

  it("Meta failure does not throw and leaves room for email to proceed", async () => {
    process.env.WHATSAPP_NOTIFICATIONS_ENABLED = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "pnid";
    const { db } = fakeDb({
      enabled: true,
      recipients: [{ phone: "+905321112233", optIn: true, optInAt: "2026-01-01T00:00:00.000Z", optInBy: "u1" }],
    });
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ error: { code: 132001 } }), { status: 400 })
    );
    const result = await sendClinicStaffWhatsApp({
      clinicId: "c1",
      kind: "appointment",
      patientName: "Ahmet",
      treatment: "İmplant",
      preferredDate: "2026-11-12",
      db,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("failed");
    expect(result.results[0].errorCode).toBe("template_not_found");
  });
});

describe("webhook", () => {
  it("verifies the GET challenge with the configured token", () => {
    const env = { WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-me" };
    expect(
      verifyWhatsAppWebhookChallenge({
        mode: "subscribe",
        token: "verify-me",
        challenge: "12345",
        env,
      })
    ).toEqual({ ok: true, challenge: "12345" });
    expect(
      verifyWhatsAppWebhookChallenge({
        mode: "subscribe",
        token: "wrong",
        challenge: "12345",
        env,
      }).ok
    ).toBe(false);
  });

  it("accepts a valid signature and rejects a bad one", () => {
    const env = { WHATSAPP_APP_SECRET: "app-secret" };
    const raw = '{"object":"whatsapp_business_account"}';
    const good = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
    expect(verifyWhatsAppSignature(raw, good, env)).toBe(true);
    expect(verifyWhatsAppSignature(raw, "sha256=deadbeef", env)).toBe(false);
    expect(verifyWhatsAppSignature(raw, null, env)).toBe(false);
  });

  it("parses status updates and inbound text", () => {
    const parsed = parseWhatsAppWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1" }],
                messages: [{ from: "905321112233", text: { body: "merhaba" } }],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.statuses).toEqual([{ messageId: "wamid.1", status: "delivered", timestamp: "1", errorCode: undefined }]);
    expect(parsed.inbound).toEqual([{ from: "905321112233", text: "merhaba" }]);
  });

  it("stores a status update against the outbound message id", async () => {
    const set = vi.fn(async () => undefined);
    const db = {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({
              empty: false,
              docs: [{ ref: { set } }],
            }),
          }),
        }),
      }),
    } as any;
    const result = await applyWhatsAppStatusUpdate(db, {
      messageId: "wamid.1",
      status: "read",
      now: new Date("2026-11-11T12:00:00.000Z"),
    });
    expect(result.updated).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "read", statusAt_read: "2026-11-11T12:00:00.000Z" }),
      { merge: true }
    );
  });

  it("auto-replies once per sender per 24h", async () => {
    process.env.WHATSAPP_NOTIFICATIONS_ENABLED = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "pnid";

    const replySet = vi.fn<(doc: { lastAt: string }) => Promise<void>>(async () => undefined);
    let lastAt: string | null = null;
    const db = {
      collection: (name: string) => {
        if (name === "clinicWhatsappSettings") {
          return {
            where: () => ({
              limit: () => ({
                get: async () => ({
                  empty: false,
                  docs: [{ id: "c1" }],
                }),
              }),
            }),
          };
        }
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ defaultLanguage: "tr" }) }),
            }),
          };
        }
        if (name === "whatsappAutoReplies") {
          return {
            doc: () => ({
              get: async () => ({
                exists: !!lastAt,
                data: () => (lastAt ? { lastAt } : undefined),
              }),
              set: async (doc: { lastAt: string }) => {
                lastAt = doc.lastAt;
                return replySet(doc);
              },
            }),
          };
        }
        return {};
      },
    } as any;

    const fetchImpl = mockFetch(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.r1" }] }), { status: 200 }));
    const first = await maybeAutoReplyToStaff({
      db,
      from: "905321112233",
      text: "detay?",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-11-11T12:00:00.000Z"),
    });
    expect(first.status).toBe("sent");
    expect(buildStaffAutoReply("tr", "https://app.clinicbridge-ai.com")).toContain("Bu numara yalnızca bildirim içindir");
    const posted = JSON.parse(String(fetchImpl.mock.calls[0][1]!.body));
    expect(posted.type).toBe("text");
    expect(posted.text.body).toContain("panele girin");

    const second = await maybeAutoReplyToStaff({
      db,
      from: "905321112233",
      text: "yine soruyorum",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-11-11T18:00:00.000Z"),
    });
    expect(second).toEqual({ status: "skipped", reason: "throttled" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("channel policy + SMS honesty", () => {
  it("allows whatsapp on the clinic channel list while still converting patient legacy whatsapp to email", () => {
    expect(ACTIVE_NOTIFICATION_CHANNELS.clinic).toContain("whatsapp");
    expect(normalizeLegacyChannel("whatsapp", true)).toBe("email");
    expect(normalizeLegacyChannel("email_and_whatsapp", true)).toBe("email");
  });

  it("sendSms never reports success when no real provider is sending", async () => {
    const missing = await sendSms({
      to: "+905321112233",
      message: "hi",
      clinicId: "c1",
      appointmentId: "a1",
      type: "reminder",
    });
    expect(missing).toMatchObject({ success: false, reason: "not_configured" });

    process.env.SMS_PROVIDER = "twilio";
    const stub = await sendSms({
      to: "+905321112233",
      message: "hi",
      clinicId: "c1",
      appointmentId: "a1",
      type: "reminder",
    });
    expect(stub.success).toBe(false);
    expect(stub.reason).toBe("not_configured");
  });
});
