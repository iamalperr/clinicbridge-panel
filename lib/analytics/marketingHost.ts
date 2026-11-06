/** Public marketing hosts. The clinic panel and widget domains stay outside this set. */
const MARKETING_HOSTS = new Set(["clinicbridge-ai.com", "www.clinicbridge-ai.com"]);

export function isMarketingAnalyticsHost(host: string | null | undefined): boolean {
  const hostname = (host ?? "").split(":")[0].trim().toLowerCase();
  return MARKETING_HOSTS.has(hostname);
}
