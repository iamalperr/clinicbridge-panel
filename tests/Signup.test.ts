import { describe, expect, it } from "vitest";
import { chatsPerMonthForSignupPlan } from "../lib/pricing";
import {
  directClinicPermissions,
  domainFromSourceUrl,
  nextRateWindow,
  trainingDocsFromPreview,
  trialEndsAtFrom,
  validateSignup,
} from "../lib/signup/account";
import { buildWelcomeEmail } from "../lib/signup/welcomeEmail";

const valid = {
  name: "Ada Yilmaz",
  clinicName: "Ada Clinic",
  email: "ada@example.com",
  password: "correct-horse",
  phone: "+90 531 000 00 00",
  acceptedTerms: true,
  acceptedDistanceSales: true,
  acceptedKvkk: true,
};

describe("self-serve signup", () => {
  it("requires consents and a real password", () => {
    expect(validateSignup({ ...valid, acceptedKvkk: false }).ok).toBe(false);
    expect(validateSignup({ ...valid, password: "short" }).ok).toBe(false);
    const parsed = validateSignup({ ...valid, email: " Ada@Example.com ", previewId: "abc12345" });
    expect(parsed.ok && parsed.value.email).toBe("ada@example.com");
    expect(parsed.ok && parsed.value.previewId).toBe("abc12345");
  });

  it("reads trial chat allowance from the clinic package", () => {
    expect(chatsPerMonthForSignupPlan("trial")).toBe(500);
    expect(chatsPerMonthForSignupPlan("klinik")).toBe(500);
    expect(chatsPerMonthForSignupPlan("klinik_telefon")).toBe(500);
    expect(chatsPerMonthForSignupPlan("baslangic")).toBe(100);
    const ends = trialEndsAtFrom(new Date("2026-01-01T00:00:00.000Z"));
    expect(ends.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("keeps the owner on the clinic record and copies only preview facts", () => {
    expect(directClinicPermissions()).toContain("clinic_widget");
    expect(domainFromSourceUrl("https://ada.example/klinik")).toBe("ada.example");
    const docs = trainingDocsFromPreview([
      { title: "Implant", category: "Tedaviler", language: "TR", content: "Implant" },
      { title: " ", category: "Tedaviler", language: "TR", content: " " },
    ]);
    expect(docs).toHaveLength(1);
    expect(JSON.stringify(docs)).not.toContain("conversation");
  });

  it("limits signup attempts and keeps the password out of the welcome email", () => {
    const first = nextRateWindow(null, 1_000);
    expect(first.allowed).toBe(true);
    const blocked = nextRateWindow({ windowStart: 1_000, count: 5 }, 2_000);
    expect(blocked.allowed).toBe(false);
    const mail = buildWelcomeEmail({
      language: "tr",
      name: "Ada <script>",
      clinicName: "Ada Clinic",
      verificationLink: "https://app.clinicbridge-ai.com/login",
    });
    expect(mail.subject).toContain("hoş geldiniz");
    expect(mail.html).toContain("E-posta adresinizi doğrulayın");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("correct-horse");
  });
});
