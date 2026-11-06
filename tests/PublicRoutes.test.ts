import { describe, expect, it } from "vitest";
import { isPublicRoute } from "../lib/auth/publicRoutes";

describe("isPublicRoute", () => {
  it("allows iyzico legal pages without a session", () => {
    expect(isPublicRoute("/hakkimizda")).toBe(true);
    expect(isPublicRoute("/klinikler-icin-yapay-zeka-asistani")).toBe(true);
    expect(isPublicRoute("/fiyatlandirma")).toBe(true);
    expect(isPublicRoute("/teslimat-ve-iade")).toBe(true);
    expect(isPublicRoute("/mesafeli-satis-sozlesmesi")).toBe(true);
  });

  it("keeps the site preview public and panel routes closed", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/privacy")).toBe(true);
    expect(isPublicRoute("/onizleme/abc")).toBe(true);
    expect(isPublicRoute("/kayit")).toBe(true);
    expect(isPublicRoute("/kurulum")).toBe(false);
    expect(isPublicRoute("/clinics")).toBe(false);
    expect(isPublicRoute("/settings")).toBe(false);
  });
});
