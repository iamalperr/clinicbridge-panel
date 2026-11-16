/**
 * Marketing conversion events for GA4 (gtag) + Meta Pixel (fbq when present).
 * Never attach personal data (email, phone, name) to event params.
 */

type GtagFn = (...args: unknown[]) => void;
type FbqFn = (...args: unknown[]) => void;

const SIGN_UP_ONCE_KEY = "cb_ga4_sign_up_fired";

function existingGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { gtag?: unknown }).gtag;
  return typeof candidate === "function" ? (candidate as GtagFn) : undefined;
}

function existingFbq(): FbqFn | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { fbq?: unknown }).fbq;
  return typeof candidate === "function" ? (candidate as FbqFn) : undefined;
}

function pushDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(payload);
}

/** Demo / contact form conversion. */
export function trackGenerateLead(
  send: GtagFn | undefined = existingGtag(),
  fbq: FbqFn | undefined = existingFbq()
): void {
  if (send) {
    send("event", "generate_lead", { transport_type: "beacon" });
  }
  if (fbq) {
    fbq("track", "Lead");
  }
  pushDataLayer({ event: "cb_generate_lead" });
}

/** Successful /kayit signup — once per browser session. */
export function trackSignUp(
  send: GtagFn | undefined = existingGtag(),
  fbq: FbqFn | undefined = existingFbq()
): void {
  try {
    const store = typeof window !== "undefined" ? window.sessionStorage : undefined;
    if (store?.getItem(SIGN_UP_ONCE_KEY) === "1") {
      return;
    }
    store?.setItem(SIGN_UP_ONCE_KEY, "1");
  } catch {
    // still fire once in this call even if sessionStorage is blocked
  }

  if (send) {
    send("event", "sign_up", { method: "email", transport_type: "beacon" });
  }
  if (fbq) {
    fbq("track", "CompleteRegistration", { content_name: "email_signup" });
  }
  pushDataLayer({ event: "cb_sign_up", method: "email" });
}

export interface BeginCheckoutParams {
  planId: string;
  planName?: string;
  value?: number | null;
  currency?: string;
}

/** Plan CTA selected (trial → signup or paid interest). No PII. */
export function trackBeginCheckout(
  params: BeginCheckoutParams,
  send: GtagFn | undefined = existingGtag(),
  fbq: FbqFn | undefined = existingFbq()
): void {
  const planId = String(params.planId || "").trim();
  if (!planId) return;

  const value =
    typeof params.value === "number" && Number.isFinite(params.value) ? params.value : undefined;
  const currency = params.currency || "EUR";
  const itemName = String(params.planName || planId).slice(0, 100);

  if (send) {
    send("event", "begin_checkout", {
      currency,
      ...(value != null ? { value } : {}),
      items: [{ item_id: planId, item_name: itemName }],
      transport_type: "beacon",
    });
  }
  if (fbq) {
    fbq("track", "InitiateCheckout", {
      content_ids: [planId],
      content_name: itemName,
      currency,
      ...(value != null ? { value } : {}),
    });
  }
  pushDataLayer({
    event: "cb_begin_checkout",
    plan_id: planId,
    ...(value != null ? { value } : {}),
    currency,
  });
}

/** @deprecated Prefer trackGenerateLead from marketingEvents — kept for existing imports. */
export { trackGenerateLead as trackGenerateLeadEvent };
