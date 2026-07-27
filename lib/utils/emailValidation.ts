export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const clean = email.trim().toLowerCase().replace(/\s+/g, "");
  return clean || null;
}

export function isValidEmail(email: string | null): boolean {
  if (!email) return false;
  if (email.length > 254) return false;
  // Basic RFC 5322 compatible regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  // Make sure it contains at least one dot in the domain
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  if (!parts[1].includes('.')) return false;
  return regex.test(email);
}
