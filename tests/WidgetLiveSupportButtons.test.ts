/**
 * Production widget (public/widget.js) WhatsApp / Telegram live-support buttons.
 *
 * Covers the server payload rule (only the clinic's own WhatsApp / Telegram fields,
 * only when human handoff is enabled) and the widget's rendering / click logging.
 * The widget helpers are executed from the real public/widget.js source.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimer } from "@/lib/performance/requestTimer";
import {
  normalizeTelegramLink,
  normalizeWhatsAppDigits,
  resolveLiveSupportButtons,
  resolveLiveSupportChannels,
} from "@/lib/contact-request/liveSupportChannels";

const WIDGET_SRC = readFileSync(resolve(__dirname, "../public/widget.js"), "utf8");

class FakeNode {
  readonly tagName: string;
  readonly namespace: string | null;
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  className = "";
  textContent = "";
  private readonly listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(tagName: string, namespace: string | null = null) {
    this.tagName = tagName;
    this.namespace = namespace;
  }

  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeNode) {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    (this.listeners[type] ||= []).push(fn);
  }

  dispatch(type: string) {
    for (const fn of this.listeners[type] || []) fn({});
  }

  set innerHTML(_value: string) {
    throw new Error("innerHTML must not be used for live-support buttons");
  }

  find(predicate: (node: FakeNode) => boolean): FakeNode[] {
    const out: FakeNode[] = [];
    for (const child of this.children) {
      if (predicate(child)) out.push(child);
      out.push(...child.find(predicate));
    }
    return out;
  }
}

interface LiveSupportHooks {
  whatsAppHref: (raw: unknown, prefill?: string) => string;
  telegramHref: (raw: unknown) => string;
  buildButtons: (doc: unknown, opts: Record<string, unknown>) => FakeNode | null;
  sendChannelClick: (
    fetchFn: unknown,
    url: string,
    clinicId: string,
    conversationId: string,
    channel: string
  ) => void;
  pickLang: (candidates: unknown) => string;
  copy: (lang: string) => { wa: string; tg: string; prefill: string };
}

function loadWidgetHooks() {
  const window: Record<string, any> = { __cbwTestHooks: {} };
  const document = {
    createElement: (tag: string) => new FakeNode(tag),
    createElementNS: (ns: string, tag: string) => new FakeNode(tag, ns),
  };
  vm.runInNewContext(WIDGET_SRC, { window, document });
  return { hooks: window.__cbwTestHooks.liveSupport as LiveSupportHooks, window, document };
}

const anchorsOf = (node: FakeNode) => node.find((n) => n.tagName === "a");
const labelOf = (anchor: FakeNode) => anchor.find((n) => n.tagName === "span")[0]?.textContent;

describe("resolveLiveSupportChannels (server payload rule)", () => {
  it("returns digits and a t.me link only when human handoff is enabled", () => {
    expect(
      resolveLiveSupportChannels({
        enableHumanHandoff: true,
        whatsappNumber: "+90 532-111 22 33",
        telegramUsername: "https://t.me/testdental",
      })
    ).toEqual({ whatsappNumber: "905321112233", telegramLink: "https://t.me/testdental" });
  });

  it.each([false, undefined, "true"])("returns nothing when enableHumanHandoff is %s", (flag) => {
    expect(
      resolveLiveSupportChannels({
        enableHumanHandoff: flag,
        whatsappNumber: "+905321112233",
        telegramUsername: "https://t.me/testdental",
      })
    ).toEqual({});
  });

  it("never turns a general contact line into a WhatsApp number", () => {
    expect(
      resolveLiveSupportChannels({
        enableHumanHandoff: true,
        whatsappNumber: "",
        turkishContactNumber: "+90 212 555 01 01",
        internationalContactNumber: "+90 212 555 01 02",
        phone: "+90 212 555 01 03",
      })
    ).toEqual({});
  });

  it("reads agency clinic fields (whatsapp / telegram)", () => {
    expect(
      resolveLiveSupportChannels({ enableHumanHandoff: true, whatsapp: "0532 111 22 33", telegram: "@agency_team" })
    ).toEqual({ whatsappNumber: "05321112233", telegramLink: "https://t.me/agency_team" });
  });

  it("attaches replyLanguage only when there is at least one button", () => {
    const fields = { enableHumanHandoff: true, whatsappNumber: "+905321112233" };
    expect(resolveLiveSupportButtons(fields, "ar")).toEqual({ whatsappNumber: "905321112233", replyLanguage: "ar" });
    expect(resolveLiveSupportButtons({ ...fields, whatsappNumber: "" }, "ar")).toEqual({});
    expect(resolveLiveSupportButtons({ ...fields, enableHumanHandoff: false }, "tr")).toEqual({});
  });

  it("normalizes legacy Telegram values and rejects anything that is not a t.me handle", () => {
    expect(normalizeTelegramLink("@testdental")).toBe("https://t.me/testdental");
    expect(normalizeTelegramLink("testdental")).toBe("https://t.me/testdental");
    expect(normalizeTelegramLink("http://t.me/testdental/")).toBe("https://t.me/testdental");
    expect(normalizeTelegramLink("https://evil.example/t.me/testdental")).toBeNull();
    expect(normalizeTelegramLink("javascript:alert(1)")).toBeNull();
    expect(normalizeTelegramLink("abc")).toBeNull();
    expect(normalizeWhatsAppDigits("123")).toBeNull();
    expect(normalizeWhatsAppDigits(null)).toBeNull();
  });
});

describe("public/widget.js live-support helpers", () => {
  it("loads the test entry without booting the widget", () => {
    const { hooks, window } = loadWidgetHooks();
    expect(typeof hooks.buildButtons).toBe("function");
    expect(window.__cbwLoaded).toBeUndefined();
    expect(window.ClinicBridgeWidget).toBeUndefined();
  });

  it("builds a wa.me link from digits only, with an optional encoded prefill", () => {
    const { hooks } = loadWidgetHooks();
    expect(hooks.whatsAppHref("+90 532-111 22 33")).toBe("https://wa.me/905321112233");
    expect(hooks.whatsAppHref("905321112233", "Merhaba & selam")).toBe(
      "https://wa.me/905321112233?text=Merhaba%20%26%20selam"
    );
    for (const bad of ["", "123", "abc", null, undefined, 905321112233]) {
      expect(hooks.whatsAppHref(bad)).toBe("");
    }
  });

  it("accepts only https://t.me/<handle> Telegram links", () => {
    const { hooks } = loadWidgetHooks();
    expect(hooks.telegramHref("https://t.me/testdental")).toBe("https://t.me/testdental");
    for (const bad of [
      "@testdental",
      "http://t.me/testdental",
      "https://t.me/testdental?start=1",
      "https://evil.example/t.me/testdental",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(hooks.telegramHref(bad)).toBe("");
    }
  });

  it("renders both buttons with safe attributes, labels and click logging", () => {
    const { hooks, document } = loadWidgetHooks();
    const onClick = vi.fn();
    const wrap = hooks.buildButtons(document, {
      whatsappNumber: "+90 532 111 22 33",
      telegramLink: "https://t.me/testdental",
      waLabel: "WhatsApp ile Bağlan",
      tgLabel: "Telegram ile Bağlan",
      waPrefill: "Merhaba",
      onClick,
    });

    expect(wrap).not.toBeNull();
    expect(wrap!.className).toBe("cbw-msg cbw-bot cbw-ls");
    const [wa, tg] = anchorsOf(wrap!);
    expect(wa.getAttribute("href")).toBe("https://wa.me/905321112233?text=Merhaba");
    expect(tg.getAttribute("href")).toBe("https://t.me/testdental");
    for (const anchor of [wa, tg]) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(wa.className).toContain("cbw-lsbtn-wa");
    expect(tg.className).toContain("cbw-lsbtn-tg");
    expect(labelOf(wa)).toBe("WhatsApp ile Bağlan");
    expect(labelOf(tg)).toBe("Telegram ile Bağlan");

    wa.dispatch("click");
    tg.dispatch("click");
    expect(onClick.mock.calls).toEqual([["whatsapp"], ["telegram"]]);
  });

  it("renders nothing for empty or invalid channels, and a single button when only one is valid", () => {
    const { hooks, document } = loadWidgetHooks();
    expect(hooks.buildButtons(document, {})).toBeNull();
    expect(hooks.buildButtons(document, { whatsappNumber: "", telegramLink: null })).toBeNull();
    expect(hooks.buildButtons(document, { whatsappNumber: "12", telegramLink: "@x" })).toBeNull();

    const tgOnly = hooks.buildButtons(document, { whatsappNumber: "", telegramLink: "https://t.me/testdental" });
    expect(anchorsOf(tgOnly!).map((a) => a.getAttribute("data-channel"))).toEqual(["telegram"]);
  });

  it("treats labels as text and keeps the redirect working when logging throws", () => {
    const { hooks, document } = loadWidgetHooks();
    const markup = '<img src=x onerror="alert(1)">';
    const wrap = hooks.buildButtons(document, {
      whatsappNumber: "905321112233",
      waLabel: markup,
      onClick: () => {
        throw new Error("logging failed");
      },
    });
    const [wa] = anchorsOf(wrap!);
    expect(labelOf(wa)).toBe(markup);
    expect(() => wa.dispatch("click")).not.toThrow();
  });

  it("logs the click on the existing system-action path with keepalive and no patient data", () => {
    const { hooks } = loadWidgetHooks();
    const fetchFn = vi.fn<(url: string, init: Record<string, any>) => Promise<unknown>>(() =>
      Promise.resolve({ ok: true })
    );
    hooks.sendChannelClick(fetchFn, "https://app.clinicbridge-ai.com/api/public/chat", "clinic_1", "sess_1", "whatsapp");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://app.clinicbridge-ai.com/api/public/chat");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      clinicId: "clinic_1",
      message: "[SYS:channel_click:whatsapp]",
      conversationId: "sess_1",
      history: [],
      _systemAction: { type: "liveSupportChannelClick", channel: "whatsapp" },
    });
  });

  it("swallows logging failures and skips logging without a conversation id", () => {
    const { hooks } = loadWidgetHooks();
    const throwing = vi.fn(() => {
      throw new Error("network down");
    });
    expect(() => hooks.sendChannelClick(throwing, "u", "c", "sess_1", "telegram")).not.toThrow();

    const rejected = { catch: vi.fn() };
    hooks.sendChannelClick(() => rejected, "u", "c", "sess_1", "telegram");
    expect(rejected.catch).toHaveBeenCalledTimes(1);

    const unused = vi.fn();
    hooks.sendChannelClick(unused, "u", "c", "", "whatsapp");
    expect(unused).not.toHaveBeenCalled();
  });

  it("wires the buttons into the live chat reply, not the marketing preview", () => {
    expect(WIDGET_SRC).toContain("if (!previewId) renderLiveSupportButtons(shadowRoot, data);");
  });
});

describe("public/widget.js live-support button language", () => {
  // Same candidate order the widget passes: [replyLanguage, conversationLang, clinic default, page/UI lang]
  const buttonsFor = (candidates: unknown[]) => {
    const { hooks, document } = loadWidgetHooks();
    const lang = hooks.pickLang(candidates);
    const copy = hooks.copy(lang);
    const wrap = hooks.buildButtons(document, {
      whatsappNumber: "905321112233",
      telegramLink: "https://t.me/testdental",
      lang,
      waLabel: copy.wa,
      tgLabel: copy.tg,
      waPrefill: copy.prefill,
    })!;
    const [wa, tg] = anchorsOf(wrap);
    return { lang, wrap, wa, tg };
  };

  it("Turkish reply on an English page: Turkish labels and prefill", () => {
    const { lang, wrap, wa, tg } = buttonsFor(["tr", null, "en", "en"]);
    expect(lang).toBe("tr");
    expect(labelOf(wa)).toBe("WhatsApp ile Bağlan");
    expect(labelOf(tg)).toBe("Telegram ile Bağlan");
    expect(wa.getAttribute("href")).toContain(encodeURIComponent("Merhaba"));
    expect(wrap.getAttribute("dir")).toBe("ltr");
    expect(wrap.getAttribute("lang")).toBe("tr");
  });

  it("English reply on a Turkish page: English labels", () => {
    const { lang, wa, tg } = buttonsFor(["en", null, "tr", "tr"]);
    expect(lang).toBe("en");
    expect(labelOf(wa)).toBe("Connect on WhatsApp");
    expect(labelOf(tg)).toBe("Connect on Telegram");
  });

  it("Arabic reply: Arabic labels and a right-to-left container, icon before text in DOM order", () => {
    const { lang, wrap, wa, tg } = buttonsFor(["ar", null, "tr", "en"]);
    expect(lang).toBe("ar");
    expect(wrap.getAttribute("dir")).toBe("rtl");
    expect(wrap.getAttribute("lang")).toBe("ar");
    expect(labelOf(wa)).toBe("تواصل عبر واتساب");
    expect(labelOf(tg)).toBe("تواصل عبر تيليجرام");
    expect(wa.children.map((c) => c.tagName)).toEqual(["svg", "span"]);
  });

  it.each([
    ["de", "Über WhatsApp verbinden"],
    ["fr", "Contacter sur WhatsApp"],
    ["ru", "Связаться в WhatsApp"],
  ])("labels %s replies in that language", (replyLanguage, waLabel) => {
    const { wa } = buttonsFor([replyLanguage, null, "tr", "en"]);
    expect(labelOf(wa)).toBe(waLabel);
  });

  it("falls back without crashing when replyLanguage is missing or unsupported", () => {
    const { hooks } = loadWidgetHooks();
    expect(hooks.pickLang([undefined, "de", "tr", "en"])).toBe("de");
    expect(hooks.pickLang([undefined, null, "tr", "en"])).toBe("tr");
    expect(hooks.pickLang([undefined, null, "auto", "en"])).toBe("en");
    expect(hooks.pickLang(["es", null, undefined, "tr"])).toBe("tr");
    expect(hooks.pickLang(["tr-TR", null, null, "en"])).toBe("tr");
    expect(hooks.pickLang([42, {}, "", null])).toBe("en");
    expect(hooks.pickLang(undefined)).toBe("en");
    expect(hooks.copy("xx").wa).toBe("Connect on WhatsApp");

    const { document } = loadWidgetHooks();
    const wrap = hooks.buildButtons(document, { whatsappNumber: "905321112233" })!;
    expect(wrap.getAttribute("dir")).toBeNull();
    expect(labelOf(anchorsOf(wrap)[0])).toBe("WhatsApp");
  });

  it("the live widget picks the button language from the reply first, then conversation, clinic, page", () => {
    expect(WIDGET_SRC).toMatch(
      /pickLiveSupportLang\(\[\s*data\.replyLanguage,\s*conversationLang,\s*latestRawCfg && latestRawCfg\.defaultLanguage,\s*resolvedLang,\s*\]\)/
    );
    expect(WIDGET_SRC).toContain("var VERSION   = '6.4.1';");
  });
});

describe("Agent Core live-support payload (web chat)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function runTurn(text: string, clinicFields: Record<string, unknown>, locale = "tr") {
    const logDoc = {
      get: async () => ({ exists: false, data: () => undefined }),
      set: async () => undefined,
      collection: () => ({ doc: () => ({ set: async () => undefined }) }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_ls",
                data: () => ({ name: "Test Dental", language: "tr", timezone: "Europe/Istanbul", ...clinicFields }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") return { doc: () => logDoc };
                if (sub === "doctors") return { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }) }),
            }),
          };
        }
        if (name === "trainingMaterials") {
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({ content: "Size nasıl yardımcı olabilirim?", durationMs: 1 })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => []),
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");
    return handleClinicAgentTurn({
      input: {
        clinicId: "clinic_ls",
        conversationId: `conv_ls_${Math.random().toString(36).slice(2)}`,
        channel: "web_widget",
        text,
        history: [],
        locale,
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });
  }

  const CONFIGURED = {
    enableHumanHandoff: true,
    whatsappNumber: "+90 532 111 22 33",
    telegramUsername: "https://t.me/testdental",
    turkishContactNumber: "+90 212 555 01 01",
  };

  it("'canlı destek' returns the clinic's WhatsApp digits and Telegram link", async () => {
    const result = await runTurn("canlı destek", CONFIGURED);
    expect(result.payload.whatsappNumber).toBe("905321112233");
    expect(result.payload.telegramLink).toBe("https://t.me/testdental");
    expect(result.payload.reply).toBeTruthy();
  });

  it("'canlı destek' tags the buttons with the Turkish reply language", async () => {
    const result = await runTurn("canlı destek", CONFIGURED);
    expect(result.payload.replyLanguage).toBe("tr");
  });

  it("an English live-support request tags the buttons with English, even for a Turkish clinic", async () => {
    const result = await runTurn("I want to talk to live support", CONFIGURED, "en");
    expect(result.payload.whatsappNumber).toBe("905321112233");
    expect(result.payload.replyLanguage).toBe("en");
    expect(result.payload.reply).not.toMatch(/Bağlan|ulaşabilirsiniz/);
  });

  it("short-circuit handoff also carries replyLanguage", async () => {
    const result = await runTurn("insana bağla", CONFIGURED);
    expect(result.payload.liveSupportRequired).toBe(true);
    expect(result.payload.replyLanguage).toBe("tr");
  });

  it("no replyLanguage when there are no buttons", async () => {
    const result = await runTurn("canlı destek", { ...CONFIGURED, enableHumanHandoff: false });
    expect(result.payload.replyLanguage).toBeUndefined();
  });

  it("'whatsapp' returns the WhatsApp button data", async () => {
    const result = await runTurn("whatsapp", CONFIGURED);
    expect(result.payload.whatsappNumber).toBe("905321112233");
  });

  it.each([
    ["handoff disabled", { ...CONFIGURED, enableHumanHandoff: false }],
    ["handoff never set", { ...CONFIGURED, enableHumanHandoff: undefined }],
    ["no WhatsApp / Telegram configured", { ...CONFIGURED, whatsappNumber: "", telegramUsername: "" }],
  ])("'canlı destek' returns no button data when %s", async (_label, fields) => {
    const result = await runTurn("canlı destek", fields);
    expect(result.payload.whatsappNumber).toBeUndefined();
    expect(result.payload.telegramLink).toBeUndefined();
    expect(result.payload.reply).toBeTruthy();
  });

  it("'canlı destek' with handoff on but every contact field empty: no buttons, no empty number in the reply", async () => {
    const result = await runTurn("canlı destek", {
      enableHumanHandoff: true,
      whatsappNumber: "",
      telegramUsername: "",
      turkishContactNumber: "",
      internationalContactNumber: "",
    });
    expect(result.payload.whatsappNumber).toBeUndefined();
    expect(result.payload.telegramLink).toBeUndefined();
    expect(result.payload.reply).toContain("Klinik ekibimizle iletişime geçmenize yardımcı olabilirim.");
    expect(result.payload.reply).not.toMatch(/numaras/i);
  });

  it("short-circuit handoff uses the clinic's WhatsApp field, not the general contact line", async () => {
    const result = await runTurn("insana bağla", CONFIGURED);
    expect(result.payload.liveSupportRequired).toBe(true);
    expect(result.payload.whatsappNumber).toBe("905321112233");
    expect(result.payload.telegramLink).toBe("https://t.me/testdental");
  });

  it("short-circuit handoff omits button data when handoff is disabled", async () => {
    const result = await runTurn("insana bağla", { ...CONFIGURED, enableHumanHandoff: false });
    expect(result.payload.liveSupportRequired).toBe(true);
    expect(result.payload.whatsappNumber).toBeUndefined();
    expect(result.payload.telegramLink).toBeUndefined();
  });

  it("asking for the clinic phone number does not add WhatsApp buttons", async () => {
    const result = await runTurn("telefon numaranız nedir?", CONFIGURED);
    expect(result.payload.whatsappNumber).toBeUndefined();
    expect(result.payload.telegramLink).toBeUndefined();
  });
});
