export class PreviewUrlError extends Error {
  constructor(readonly code: "invalid" | "protocol" | "credentials" | "port" | "host" | "private" | "dns" | "empty" | "timeout") {
    super(code);
    this.name = "PreviewUrlError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

export function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") && host.endsWith("]")) return true;
  if (host.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** True for loopback, private, link-local, CGNAT, documentation, and multicast ranges. */
export function isPrivateIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (normalized.includes(":")) {
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    const mapped = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }

  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** Add https:// when the visitor typed a bare host such as www.klinik.com. */
export function withHttpScheme(raw: string): string {
  const value = raw.trim();
  if (value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return `https://${value}`;
  return value;
}

export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(withHttpScheme(raw));
  } catch {
    throw new PreviewUrlError("invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PreviewUrlError("protocol");
  }
  if (url.username || url.password) {
    throw new PreviewUrlError("credentials");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new PreviewUrlError("port");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new PreviewUrlError("host");
  }
  if (!host.includes(".") && !isIpLiteral(host)) {
    throw new PreviewUrlError("invalid");
  }
  if (isIpLiteral(host) && isPrivateIp(host)) {
    throw new PreviewUrlError("private");
  }
  url.hostname = host;
  url.hash = "";
  return url;
}

export async function assertPublicResolution(url: URL): Promise<void> {
  const host = url.hostname;
  if (isIpLiteral(host)) {
    if (isPrivateIp(host)) throw new PreviewUrlError("private");
    return;
  }
  const { lookup } = await import("dns/promises");
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new PreviewUrlError("dns");
  }
  if (!records.length) throw new PreviewUrlError("dns");
  for (const record of records) {
    if (isPrivateIp(record.address)) throw new PreviewUrlError("private");
  }
}
