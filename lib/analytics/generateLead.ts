type GtagCommand = (...args: unknown[]) => void;

function existingGtag(): GtagCommand | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { gtag?: unknown }).gtag;
  return typeof candidate === "function" ? (candidate as GtagCommand) : undefined;
}

/**
 * Reports one demo-form conversion through the gtag already installed for the
 * marketing site. Sends no personal data. Beacon keeps the hit when the form
 * navigates to the thank-you page. Missing gtag is a no-op, so the panel and
 * local hosts do not invent a second tag.
 */
export function trackGenerateLead(send: GtagCommand | undefined = existingGtag()): void {
  if (!send) return;
  send("event", "generate_lead", { transport_type: "beacon" });
}
