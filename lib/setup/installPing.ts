export interface InstallState {
  exists: boolean;
  widgetInstalledAt: string | null;
  installedDomain: string | null;
  widgetLiveEmailSent: boolean;
}

export type InstallPingPlan =
  | { status: "invalid" }
  | { status: "missing" }
  | { status: "unchanged"; installedDomain: string }
  | { status: "update-domain"; installedDomain: string }
  | { status: "first"; installedAt: string; installedDomain: string; sendEmail: true }
  | { status: "retry-email"; installedDomain: string; sendEmail: true };

export function normalizeInstallDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  return host;
}

export function planInstallPing(state: InstallState, domainRaw: string, nowIso: string): InstallPingPlan {
  const domain = normalizeInstallDomain(domainRaw);
  if (!domain) return { status: "invalid" };
  if (!state.exists) return { status: "missing" };
  if (!state.widgetInstalledAt) {
    return { status: "first", installedAt: nowIso, installedDomain: domain, sendEmail: true };
  }
  if (!state.widgetLiveEmailSent) {
    return { status: "retry-email", installedDomain: domain, sendEmail: true };
  }
  if (state.installedDomain !== domain) return { status: "update-domain", installedDomain: domain };
  return { status: "unchanged", installedDomain: domain };
}
