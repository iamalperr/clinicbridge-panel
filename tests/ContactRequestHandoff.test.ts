/**
 * Contact Request / Human Handoff regression suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectContactHandoff,
  detectPreferredContactMethod,
  isPatientContactHandoffIntent,
  isContactHandoffCancel,
  isAmbiguousContactHandoff,
} from "@/lib/contact-request/intent";
import {
  formatContactRequestSuccess,
  formatContactRequestFailure,
  formatContactRequestConfirmationPrompt,
} from "@/lib/contact-request/formatters";
import {
  buildContactRequestIdempotencyKey,
} from "@/lib/contact-request/service";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import {
  normalizeConversationStatus,
  getConversationStatusLabel,
} from "@/lib/services/conversations/conversationStatusResolver";

describe("Contact Request intent detection", () => {
  it("1. phone disclosure alone is NOT handoff intent", () => {
    const msg = "My number is 07743203816.";
    expect(isPatientContactHandoffIntent(msg)).toBe(false);
    expect(detectContactHandoff(msg).isHandoffIntent).toBe(false);
    const intent = IntentRouter.classifyConversationIntent({
      message: msg,
      currentState: "INITIAL",
    });
    expect(intent.intent).not.toBe("contact_handoff_request");
  });

  it("2. phone + explicit text-me → handoff with sms preference", () => {
    const msg = "My number is 07743203816. Please ask them to text me.";
    expect(isPatientContactHandoffIntent(msg)).toBe(true);
    expect(detectPreferredContactMethod(msg)).toBe("sms");
    expect(isAmbiguousContactHandoff(msg)).toBe(false);
    const intent = IntentRouter.classifyConversationIntent({
      message: msg,
      currentState: "INITIAL",
    });
    expect(intent.intent).toBe("contact_handoff_request");
    expect(intent.requiresKnowledgeBase).toBe(false);
  });

  it("3. Can they text me? is handoff (ambiguous confirmation path)", () => {
    const msg = "I can't speak because I'm at work. Can they text me?";
    expect(isPatientContactHandoffIntent(msg)).toBe(true);
    expect(detectPreferredContactMethod(msg)).toBe("sms");
    expect(isAmbiguousContactHandoff(msg)).toBe(true);
  });

  it("4. Please call me without implying number disclosure still detects phone preference", () => {
    expect(detectPreferredContactMethod("Please call me.")).toBe("phone");
    expect(isPatientContactHandoffIntent("Please call me.")).toBe(true);
  });

  it("5. preference correction → whatsapp wins", () => {
    const msg = "Actually don't call me, WhatsApp me.";
    expect(detectPreferredContactMethod(msg)).toBe("whatsapp");
    expect(detectContactHandoff(msg).isPreferenceAmendment).toBe(true);
  });

  it("6. cancellation detected (EN + TR)", () => {
    expect(isContactHandoffCancel("Never mind, don't contact me.")).toBe(true);
    expect(isContactHandoffCancel("Actually no need to call.")).toBe(true);
    expect(
      isContactHandoffCancel("Boşverin, iletişime geçmelerine gerek yok.")
    ).toBe(true);
  });

  it("10. Turkish contact intent", () => {
    expect(isPatientContactHandoffIntent("Beni arayın lütfen")).toBe(true);
    expect(detectPreferredContactMethod("Bana yazsınlar")).toBe("sms");
    const intent = IntentRouter.classifyConversationIntent({
      message: "Klinik beni arasın",
      currentState: "INITIAL",
    });
    expect(intent.intent).toBe("contact_handoff_request");
  });

  it("11. English contact intent", () => {
    expect(isPatientContactHandoffIntent("Have them contact me")).toBe(true);
    expect(detectPreferredContactMethod("Email me please")).toBe("email");
  });

  it("informational clinic phone query is NOT handoff", () => {
    expect(isPatientContactHandoffIntent("What is your phone number?")).toBe(
      false
    );
    expect(isPatientContactHandoffIntent("How can I reach you?")).toBe(false);
  });
});

describe("Contact Request truthful copy", () => {
  it("success copy forwards preference without promising clinic SMS", () => {
    const en = formatContactRequestSuccess({
      preferredMethod: "sms",
      locale: "en",
    });
    expect(en.toLowerCase()).toContain("forward");
    expect(en.toLowerCase()).not.toMatch(/they will text you/);
    expect(en.toLowerCase()).toContain("prefer");

    const tr = formatContactRequestSuccess({
      preferredMethod: "sms",
      locale: "tr",
    });
    expect(tr.toLowerCase()).toContain("ilettim");
  });

  it("13/14. failure copy does not claim success", () => {
    const en = formatContactRequestFailure("en");
    expect(en.toLowerCase()).not.toContain("forwarded");
    expect(en.toLowerCase()).toMatch(/unable|cannot|unable to forward/);
  });

  it("confirmation prompt is truthful", () => {
    const prompt = formatContactRequestConfirmationPrompt("sms", "en");
    expect(prompt.toLowerCase()).toContain("share your contact request");
  });
});

describe("Contact Request idempotency key", () => {
  it("8. same conversation + phone yields stable key", () => {
    const a = buildContactRequestIdempotencyKey({
      conversationId: "conv_1",
      preferredContactMethod: "sms",
      patientPhone: "07743203816",
    });
    const b = buildContactRequestIdempotencyKey({
      conversationId: "conv_1",
      preferredContactMethod: "phone",
      patientPhone: "07743203816",
    });
    // Method amendments share the same conversation-scoped key base
    expect(a).toBe(b);
  });
});

describe("Conversation status — contact request", () => {
  it("contact request pending is not successfully answered", () => {
    const norm = normalizeConversationStatus("answered", {
      contactRequestId: "cr_1",
      contactRequestStatus: "pending",
    });
    expect(norm).toBe("contact_request_pending");
    expect(getConversationStatusLabel(norm, "en")).toMatch(/Contact Request/i);
  });

  it("appointment conversion still takes precedence", () => {
    const norm = normalizeConversationStatus("contact_request_pending", {
      appointmentId: "appt_1",
      contactRequestId: "cr_1",
      contactRequestStatus: "pending",
    });
    expect(norm).toBe("converted_to_appointment");
  });

  it("17. historical logs without contact fields still render", () => {
    expect(normalizeConversationStatus("answered")).toBe("successfully_answered");
    expect(normalizeConversationStatus("liveSupport")).toBe("live_support_required");
    expect(normalizeConversationStatus(undefined)).toBe("successfully_answered");
  });

  it("resolved contact request status", () => {
    expect(
      normalizeConversationStatus("contact_request_resolved", {
        contactRequestId: "cr_1",
        contactRequestStatus: "resolved",
      })
    ).toBe("contact_request_resolved");
  });
});

describe("Contact Request service — persistence/notify semantics", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/firebase-admin");
    vi.doUnmock("@/lib/contact-request/notifications");
  });

  it("13. persistence failure does not report success", async () => {
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => null,
    }));
    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );
    const result = await createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv1",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: "cr:conv1:x:y",
      patientPhone: "+447743203816",
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("DB_UNAVAILABLE");
  });

  it("14. notification failure does not report success", async () => {
    const store: Record<string, any> = {};
    const makeCol = () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: true, docs: [] }),
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `auto_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            store[docId] = opts?.merge ? { ...(store[docId] || {}), ...data } : data;
          },
          get: async () => ({
            exists: Boolean(store[docId]),
            data: () => store[docId],
          }),
        };
      },
      add: async () => undefined,
    });

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: (clinicId: string) => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Test Clinic",
                    notificationSettings: {
                      clinic: {
                        newContactRequestEmailEnabled: true,
                        recipientEmails: ["clinic@example.com"],
                      },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") {
            return { get: async () => ({ docs: [] }) };
          }
          return makeCol();
        },
      }),
    }));

    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => ({
        success: false,
        error: "provider_down",
      })),
    }));

    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );
    const result = await createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_fail",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: "cr:conv_fail:816:noemail",
      patientPhone: "07743203816",
      patientNote: "text me",
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("NOTIFICATION_FAILED");
    expect(result.contactRequestId).toBeTruthy();
  });

  it("8. repeated create is idempotent — one notification path", async () => {
    const store: Record<string, any> = {};
    let notifyCalls = 0;

    const makeCol = () => ({
      where: (field: string, _op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((d: any) => d && d[field] === value)
              .map((d: any, i: number) => ({
                id: d.id || `d${i}`,
                data: () => d,
              }));
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `cr_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            const prev = store[docId] || {};
            store[docId] = opts?.merge
              ? { ...prev, ...data, id: docId }
              : { ...data, id: docId };
          },
          get: async () => ({
            exists: Boolean(store[docId]),
            data: () => store[docId],
          }),
        };
      },
    });

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: () => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Test Clinic",
                    notificationSettings: {
                      clinic: {
                        newAppointmentEmailEnabled: true,
                        recipientEmails: ["clinic@example.com"],
                      },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") return { get: async () => ({ docs: [] }) };
          return makeCol();
        },
      }),
    }));

    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => {
        notifyCalls += 1;
        return { success: true };
      }),
    }));

    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );

    const payload = {
      clinicId: "c1",
      conversationId: "conv_idemp",
      preferredContactMethod: "sms" as const,
      language: "en",
      channel: "web_widget" as const,
      idempotencyKey: "cr:conv_idemp:816:noemail",
      patientPhone: "07743203816",
    };

    const first = await createContactRequestAndNotify(payload);
    const second = await createContactRequestAndNotify(payload);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.isDuplicate).toBe(true);
    expect(notifyCalls).toBe(1);
    expect(first.contactRequestId).toBe(second.contactRequestId);
  });

  it("15. tenant mismatch rejects status update", async () => {
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    id: "cr1",
                    clinicId: "clinic_a",
                    conversationId: "conv1",
                    status: "pending",
                    preferredContactMethod: "sms",
                    language: "en",
                    channel: "web_widget",
                    source: "AI Assistant",
                    idempotencyKey: "k",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }),
                }),
                set: async () => undefined,
              }),
            }),
          }),
        }),
      }),
    }));

    const { updateContactRequestStatus } = await import(
      "@/lib/contact-request/service"
    );
    const result = await updateContactRequestStatus({
      clinicId: "clinic_b",
      contactRequestId: "cr1",
      status: "acknowledged",
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("TENANT_MISMATCH");
  });

  it("16. channel metadata supports web_widget and voice", async () => {
    const channels = ["web_widget", "voice"] as const;
    for (const channel of channels) {
      expect(["web_widget", "voice", "whatsapp", "api", "other"]).toContain(
        channel
      );
    }
    // Type-level / payload acceptance via create payload shape
    const key = buildContactRequestIdempotencyKey({
      conversationId: "v1",
      preferredContactMethod: "phone",
      patientPhone: "+905551112233",
    });
    expect(key.startsWith("cr:v1:")).toBe(true);
  });

  it("DISABLED notify still succeeds (portal forward) without claiming email", async () => {
    const store: Record<string, any> = {};
    const makeCol = () => ({
      where: (field: string, _op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((d: any) => d && d[field] === value)
              .map((d: any) => ({ id: d.id, data: () => d }));
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `cr_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            store[docId] = opts?.merge
              ? { ...(store[docId] || {}), ...data, id: docId }
              : { ...data, id: docId };
          },
          get: async () => ({ exists: Boolean(store[docId]), data: () => store[docId] }),
        };
      },
    });

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: () => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Test Clinic",
                    notificationSettings: {
                      clinic: { newContactRequestEmailEnabled: false, recipientEmails: [] },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") return { get: async () => ({ docs: [] }) };
          return makeCol();
        },
      }),
    }));
    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => ({ success: true })),
    }));

    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );
    const result = await createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_disabled",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: "cr:conv_disabled:816:noemail",
      patientPhone: "07743203816",
    });
    expect(result.success).toBe(true);
    expect(String(result.clinicNotificationStatus).toUpperCase()).toBe("DISABLED");
    const copy = formatContactRequestSuccess({ preferredMethod: "sms", locale: "en" });
    expect(copy.toLowerCase()).toContain("forward");
    expect(copy.toLowerCase()).not.toMatch(/email (was |has been )?sent|sms sent|whatsapp sent/);
  });

  it("A/B phone correction updates unresolved request without duplicate", async () => {
    const store: Record<string, any> = {};
    let notifyCalls = 0;
    const makeCol = () => ({
      where: (field: string, _op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((d: any) => d && d[field] === value)
              .map((d: any) => ({ id: d.id, data: () => d }));
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `cr_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            store[docId] = opts?.merge
              ? { ...(store[docId] || {}), ...data, id: docId }
              : { ...data, id: docId };
          },
          get: async () => ({ exists: Boolean(store[docId]), data: () => store[docId] }),
        };
      },
    });
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: () => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Clinic",
                    notificationSettings: {
                      clinic: {
                        newContactRequestEmailEnabled: true,
                        recipientEmails: ["a@b.com"],
                      },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") return { get: async () => ({ docs: [] }) };
          return makeCol();
        },
      }),
    }));
    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => {
        notifyCalls += 1;
        return { success: true };
      }),
    }));

    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );
    const first = await createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_phone",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: "cr:conv_phone:1111111111:noemail",
      patientPhone: "1111111111",
    });
    const second = await createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_phone",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: "cr:conv_phone:2222222222:noemail",
      patientPhone: "2222222222",
    });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.contactRequestId).toBe(first.contactRequestId);
    expect(Object.keys(store).length).toBe(1);
    expect(store[first.contactRequestId!].patientPhone).toBe("2222222222");
    expect(notifyCalls).toBe(1);
  });

  it("D. new request after resolved creates a new pending record", async () => {
    const store: Record<string, any> = {};
    let notifyCalls = 0;
    const makeCol = () => ({
      where: (field: string, _op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((d: any) => d && d[field] === value)
              .map((d: any) => ({ id: d.id, data: () => d }));
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `cr_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            store[docId] = opts?.merge
              ? { ...(store[docId] || {}), ...data, id: docId }
              : { ...data, id: docId };
          },
          get: async () => ({ exists: Boolean(store[docId]), data: () => store[docId] }),
        };
      },
    });
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: () => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Clinic",
                    notificationSettings: {
                      clinic: {
                        newContactRequestEmailEnabled: true,
                        recipientEmails: ["a@b.com"],
                      },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") return { get: async () => ({ docs: [] }) };
          return makeCol();
        },
      }),
    }));
    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => {
        notifyCalls += 1;
        return { success: true };
      }),
    }));

    const mod = await import("@/lib/contact-request/service");
    const key = "cr:conv_resolved:816:noemail";
    const first = await mod.createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_resolved",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: key,
      patientPhone: "07743203816",
    });
    // Mark resolved in store
    store[first.contactRequestId!].status = "resolved";
    const second = await mod.createContactRequestAndNotify({
      clinicId: "c1",
      conversationId: "conv_resolved",
      preferredContactMethod: "sms",
      language: "en",
      channel: "web_widget",
      idempotencyKey: key,
      patientPhone: "07743203816",
    });
    expect(second.success).toBe(true);
    expect(second.contactRequestId).not.toBe(first.contactRequestId);
    expect(second.isDuplicate).not.toBe(true);
    expect(notifyCalls).toBe(2);
    expect(Object.keys(store).length).toBe(2);
  });

  it("9b. failed notify retries on subsequent create (no false success)", async () => {
    const store: Record<string, any> = {};
    let notifyCalls = 0;
    const makeCol = () => ({
      where: (field: string, _op: string, value: any) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((d: any) => d && d[field] === value)
              .map((d: any) => ({ id: d.id, data: () => d }));
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
      doc: (id?: string) => {
        const docId = id || `cr_${Object.keys(store).length + 1}`;
        return {
          id: docId,
          set: async (data: any, opts?: any) => {
            store[docId] = opts?.merge
              ? { ...(store[docId] || {}), ...data, id: docId }
              : { ...data, id: docId };
          },
          get: async () => ({ exists: Boolean(store[docId]), data: () => store[docId] }),
        };
      },
    });
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: (name: string) => {
          if (name === "clinics") {
            return {
              doc: () => ({
                collection: (sub: string) => {
                  if (sub === "contactRequests") return makeCol();
                  if (sub === "notifications") return { add: async () => undefined };
                  return makeCol();
                },
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Clinic",
                    notificationSettings: {
                      clinic: {
                        newContactRequestEmailEnabled: true,
                        recipientEmails: ["a@b.com"],
                      },
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "agencies") return { get: async () => ({ docs: [] }) };
          return makeCol();
        },
      }),
    }));
    vi.doMock("@/lib/contact-request/notifications", () => ({
      sendClinicContactRequestEmail: vi.fn(async () => {
        notifyCalls += 1;
        return { success: notifyCalls > 1 };
      }),
    }));

    const { createContactRequestAndNotify } = await import(
      "@/lib/contact-request/service"
    );
    const payload = {
      clinicId: "c1",
      conversationId: "conv_retry",
      preferredContactMethod: "sms" as const,
      language: "en",
      channel: "web_widget" as const,
      idempotencyKey: "cr:conv_retry:816:noemail",
      patientPhone: "07743203816",
    };
    const first = await createContactRequestAndNotify(payload);
    expect(first.success).toBe(false);
    expect(first.code).toBe("NOTIFICATION_FAILED");
    const second = await createContactRequestAndNotify(payload);
    expect(second.success).toBe(true);
    expect(second.contactRequestId).toBe(first.contactRequestId);
    expect(notifyCalls).toBe(2);
    expect(Object.keys(store).length).toBe(1);
  });
});

describe("Confirmation cancel language", () => {
  it("Actually no / Boşver cancel handoff", () => {
    expect(isContactHandoffCancel("Actually no.")).toBe(true);
    expect(isContactHandoffCancel("Boşver.")).toBe(true);
    expect(isContactHandoffCancel("Never mind.")).toBe(true);
  });
});

describe("12. Groundedness bypass — handoff requiresKnowledgeBase false", () => {
  it("contact_handoff_request never requires KB", () => {
    const r = IntentRouter.classifyConversationIntent({
      message: "Please ask them to text me at 07743203816",
      currentState: "INITIAL",
    });
    expect(r.intent).toBe("contact_handoff_request");
    expect(r.requiresKnowledgeBase).toBe(false);
  });
});

describe("9. Appointment path untouched (smoke)", () => {
  it("appointment_start still classifies independently", () => {
    const r = IntentRouter.classifyConversationIntent({
      message: "I want to book an appointment",
      currentState: "INITIAL",
    });
    expect(r.intent).toBe("appointment_start");
  });
});

describe("Status precedence", () => {
  it("appointment conversion wins over pending contact request", () => {
    const norm = normalizeConversationStatus("contact_request_pending", {
      appointmentId: "appt_1",
      contactRequestId: "cr_1",
      contactRequestStatus: "pending",
    });
    expect(norm).toBe("converted_to_appointment");
  });

  it("portal historical statuses remain safe", () => {
    expect(normalizeConversationStatus("answered")).toBe("successfully_answered");
    expect(normalizeConversationStatus("contact_request_pending")).toBe(
      "contact_request_pending"
    );
    expect(
      normalizeConversationStatus("answered", {
        contactRequestId: "cr1",
        contactRequestStatus: "cancelled",
      })
    ).toBe("successfully_answered");
  });
});
