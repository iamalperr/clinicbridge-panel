import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("marketing search favicon", () => {
  it("serves a 96x96 PNG and points the HTML head only at that file", () => {
    expect(existsSync("public/favicon.png")).toBe(true);
    expect(existsSync("app/icon.svg")).toBe(false);

    const png = readFileSync("public/favicon.png");
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);

    for (const path of ["app/layout.tsx", "app/page.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('url: "/favicon.png"');
      expect(source).toContain('type: "image/png"');
      expect(source).toContain('sizes: "96x96"');
    }
  });
});
