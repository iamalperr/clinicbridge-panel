/**
 * Turkish-safe control-phrase comparison (product-global).
 * Default toLowerCase turns "İ" into "i" + U+0307, so "İptal" never matched "iptal".
 */
import { describe, expect, it } from "vitest";
import { controlPhraseKey } from "@/lib/conversation/controlPhrase";
import { IntentRouter } from "@/lib/conversation/intentRouter";

describe("controlPhraseKey", () => {
  it.each([
    ["iptal", "iptal"],
    ["İptal", "iptal"],
    ["İptal.", "iptal"],
    ["İPTAL", "iptal"],
    ["I\u0307ptal", "iptal"],
    ["  Vazgeçtim!  ", "vazgeçtim"],
    ["İptal etmek   istiyorum.", "iptal etmek istiyorum"],
    ["HAYIR…", "hayir"],
    ["Hayır", "hayır"],
  ])("%j → %j", (input, key) => {
    expect(controlPhraseKey(input)).toBe(key);
  });

  it("keeps question marks and inner punctuation", () => {
    expect(controlPhraseKey("İptal?")).toBe("iptal?");
    expect(controlPhraseKey("Hayır, saat 12 olsun.")).toBe("hayır, saat 12 olsun");
  });

  it("returns a new string and leaves the message untouched", () => {
    const message = "İptal.";
    controlPhraseKey(message);
    expect(message).toBe("İptal.");
  });
});

describe("IntentRouter.isCancel", () => {
  it.each(["iptal", "İptal", "İptal.", "İPTAL", "Vazgeçtim.", "vazgectim", "İptal etmek istiyorum.", "İstemiyorum.", "Randevuyu iptal et"])(
    "%j cancels",
    (message) => {
      expect(IntentRouter.isCancel(message)).toBe(true);
    }
  );

  it.each(["İptal?", "Hayır, saat 12 olsun", "İptal politikanız nedir?", "E-posta vermek istemiyorum.", "Tamam"])(
    "%j does not cancel",
    (message) => {
      expect(IntentRouter.isCancel(message)).toBe(false);
    }
  );

  it("routes Turkish-capitalized cancel during appointment collection", () => {
    const res = IntentRouter.classifyConversationIntent({
      message: "İPTAL.",
      currentState: "APPOINTMENT_COLLECTION",
      expectedSlot: "preferredTime",
      locale: "tr",
    });
    expect(res.intent).toBe("cancel");
  });

  it("email refusal at the email question stays an email decline", () => {
    const res = IntentRouter.classifyConversationIntent({
      message: "İstemiyorum.",
      currentState: "APPOINTMENT_COLLECTION",
      expectedSlot: "email",
      locale: "tr",
    });
    expect(res.intent).toBe("appointment_continuation");
    expect(res.entities?.emailDeclined).toBe(true);
  });
});
