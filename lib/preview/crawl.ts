import * as cheerio from "cheerio";
import { assertPublicResolution, isIpLiteral, isPrivateIp, parsePublicHttpUrl, PreviewUrlError } from "./ssrf";
import { isPathAllowedByRobots, sitemapUrlsFromRobots } from "./robots";

const USER_AGENT = "ClinicBridgePreviewBot/1.0 (+https://clinicbridge-ai.com)";
const MAX_PAGES = 15;
const TOTAL_BUDGET_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_500_000;
const MAX_TEXT_PER_PAGE = 6_000;

export interface CrawledPage {
  url: string;
  text: string;
  title: string | null;
}

export interface CrawlResult {
  sourceUrl: string;
  pages: CrawledPage[];
  corpus: string;
  languages: string[];
  logoUrl: string | null;
  primaryColor: string | null;
  embeddable: boolean;
}

export interface CrawlDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  assertResolution?: (url: URL) => Promise<void>;
}

function publicAssetUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = parsePublicHttpUrl(raw);
    if (isIpLiteral(url.hostname) && isPrivateIp(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function languageCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase().split("-")[0];
  return /^[a-z]{2}$/.test(code) ? code : null;
}

function hexColor(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  return match ? match[0] : null;
}

export function frameAllowed(headers: { get(name: string): string | null }): boolean {
  const xfo = (headers.get("x-frame-options") || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
  const csp = (headers.get("content-security-policy") || "").toLowerCase();
  const ancestors = csp.match(/frame-ancestors\s+([^;]+)/);
  if (!ancestors) return true;
  const policy = ancestors[1];
  if (policy.includes("'none'")) return false;
  if (policy.includes("*")) return true;
  return policy.includes("clinicbridge-ai.com");
}

export function readPage(html: string, pageUrl: string): {
  text: string;
  title: string | null;
  links: string[];
  languages: string[];
  logoUrl: string | null;
  primaryColor: string | null;
} {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || null;
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_PER_PAGE);
  const languages = new Set<string>();
  const htmlLang = languageCode($("html").attr("lang"));
  if (htmlLang) languages.add(htmlLang);
  $("link[rel='alternate'][hreflang]").each((_, el) => {
    const code = languageCode($(el).attr("hreflang"));
    if (code && code !== "x") languages.add(code);
  });

  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const next = new URL(href, pageUrl);
      if (next.protocol !== "http:" && next.protocol !== "https:") return;
      next.hash = "";
      links.push(next.toString());
    } catch {
      /* ignore malformed hrefs */
    }
  });

  const logoCandidate =
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    $("link[rel='apple-touch-icon']").attr("href") ||
    $("img[src]").first().attr("src") ||
    null;
  let logoUrl: string | null = null;
  if (logoCandidate) {
    try {
      const resolved = new URL(logoCandidate, pageUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        logoUrl = resolved.toString();
      }
    } catch {
      logoUrl = null;
    }
  }

  const primaryColor =
    hexColor($("meta[name='theme-color']").attr("content")) ||
    hexColor($("meta[name='msapplication-TileColor']").attr("content"));

  return { text, title, links, languages: [...languages], logoUrl, primaryColor };
}

function sameHost(candidate: string, origin: URL): URL | null {
  try {
    const url = parsePublicHttpUrl(candidate);
    if (url.hostname !== origin.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    received += value.byteLength;
    chunks.push(value);
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged).slice(0, MAX_BYTES);
}

async function fetchPublic(
  url: URL,
  fetchImpl: typeof fetch,
  deadline: number,
  now: () => number,
  assertResolution: (url: URL) => Promise<void>
): Promise<{ status: number; headers: Headers; body: string; finalUrl: URL } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const remaining = deadline - now();
    if (remaining <= 0) return null;
    await assertResolution(current);
    const timeout = Math.min(REQUEST_TIMEOUT_MS, remaining);
    const response = await fetchImpl(current.toString(), {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(timeout),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current);
      current = parsePublicHttpUrl(next.toString());
      continue;
    }
    const body = await readLimited(response);
    return { status: response.status, headers: response.headers, body, finalUrl: current };
  }
  return null;
}

function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = error instanceof Error ? error.message : "";
  return name === "TimeoutError" || name === "AbortError" || /timeout/i.test(message);
}

export async function crawlSite(rawUrl: string, deps: CrawlDeps = {}): Promise<CrawlResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const assertResolution = deps.assertResolution ?? assertPublicResolution;
  const start = parsePublicHttpUrl(rawUrl);
  const deadline = now() + TOTAL_BUDGET_MS;
  const origin = new URL(start.toString());
  let sawTimeout = false;
  const noteFailure = (error: unknown) => {
    if (isTimeoutError(error)) sawTimeout = true;
  };

  let robots = "";
  const robotsUrl = new URL("/robots.txt", origin);
  try {
    const robotsResponse = await fetchPublic(robotsUrl, fetchImpl, deadline, now, assertResolution);
    if (robotsResponse && robotsResponse.status >= 200 && robotsResponse.status < 300) {
      robots = robotsResponse.body;
    }
  } catch (error) {
    if (error instanceof PreviewUrlError) throw error;
    noteFailure(error);
  }

  const queue: URL[] = [];
  const seen = new Set<string>();
  const enqueue = (candidate: string) => {
    const next = sameHost(candidate, origin);
    if (!next) return;
    const path = next.pathname || "/";
    if (!isPathAllowedByRobots(robots, path)) return;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)$/i.test(path)) return;
    const key = next.toString();
    if (seen.has(key) || seen.size >= MAX_PAGES * 4) return;
    seen.add(key);
    queue.push(next);
  };

  enqueue(start.toString());
  for (const sitemap of sitemapUrlsFromRobots(robots).slice(0, 2)) {
    const sitemapUrl = sameHost(sitemap, origin) ?? null;
    const target = sitemapUrl || (() => {
      try {
        return parsePublicHttpUrl(sitemap);
      } catch {
        return null;
      }
    })();
    if (!target || target.hostname !== origin.hostname) continue;
    try {
      const sitemapResponse = await fetchPublic(target, fetchImpl, deadline, now, assertResolution);
      if (!sitemapResponse) continue;
      for (const loc of sitemapLocs(sitemapResponse.body)) enqueue(loc);
    } catch (error) {
      if (error instanceof PreviewUrlError && error.code === "private") throw error;
      noteFailure(error);
    }
  }

  const pages: CrawledPage[] = [];
  const languages = new Set<string>();
  let logoUrl: string | null = null;
  let primaryColor: string | null = null;
  let embeddable = true;
  let firstPage = true;

  while (queue.length && pages.length < MAX_PAGES && now() < deadline) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;
    let response: Awaited<ReturnType<typeof fetchPublic>>;
    try {
      response = await fetchPublic(pageUrl, fetchImpl, deadline, now, assertResolution);
    } catch (error) {
      if (error instanceof PreviewUrlError && (error.code === "private" || error.code === "host")) throw error;
      noteFailure(error);
      continue;
    }
    if (!response || response.status < 200 || response.status >= 300) continue;
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (type && !type.includes("html") && !type.includes("xml") && !type.includes("text/")) continue;
    const parsed = readPage(response.body, response.finalUrl.toString());
    if (firstPage) {
      embeddable = frameAllowed(response.headers);
      logoUrl = publicAssetUrl(parsed.logoUrl);
      primaryColor = parsed.primaryColor;
      firstPage = false;
    }
    for (const language of parsed.languages) languages.add(language);
    if (parsed.text) {
      pages.push({ url: response.finalUrl.toString(), text: parsed.text, title: parsed.title });
    }
    for (const link of parsed.links) enqueue(link);
  }

  if (!pages.length) {
    throw new PreviewUrlError(sawTimeout ? "timeout" : "empty");
  }

  const corpus = pages.map((page) => page.text).join("\n").slice(0, 24_000);
  return {
    sourceUrl: start.toString(),
    pages,
    corpus,
    languages: [...languages],
    logoUrl,
    primaryColor,
    embeddable,
  };
}
