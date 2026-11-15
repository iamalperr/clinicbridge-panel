/**
 * Display name when the patient did not provide a name.
 * Missing name must never block Contact Request creation or clinic notify.
 */

export function anonymousVisitorName(locale: string = "en"): string {
  const lang = (locale || "en").toLowerCase();
  if (lang.startsWith("tr")) return "Anonim Ziyaretçi";
  if (lang.startsWith("de")) return "Anonymer Besucher";
  if (lang.startsWith("ar")) return "زائر مجهول";
  return "Anonymous Visitor";
}

export function resolvePatientDisplayName(
  name: string | null | undefined,
  locale: string = "en"
): string {
  const trimmed = String(name || "").trim();
  return trimmed || anonymousVisitorName(locale);
}
