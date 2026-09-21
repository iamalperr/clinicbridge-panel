/**
 * Format attribution block for demo-request notification emails.
 */

import { sanitizeAttributionPayload } from "./sanitize";

function dash(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || "-";
}

export function formatDemoAttributionEmailSection(raw: unknown): string {
  const attr = sanitizeAttributionPayload(raw);
  if (!attr) return "";

  const first = attr.firstTouch as Record<string, any>;
  const last = attr.lastTouch as Record<string, any>;
  const ids = (attr.identifiers || {}) as Record<string, any>;
  const label = dash(attr.leadSourceLabel);

  return `
Lead Source: ${label}

---
Lead Kaynağı

Kaynak: ${label}
Medium: ${dash(first?.medium)}
Campaign: ${dash(first?.campaign)}
İlk Landing Page: ${dash(first?.landingPage)}
Referrer: ${dash(first?.referrer)}
Son Sayfa: ${dash(last?.page)}

Tracking:
GCLID: ${dash(ids.gclid)}
FBCLID: ${dash(ids.fbclid)}
MSCLKID: ${dash(ids.msclkid)}
---`.trim();
}
