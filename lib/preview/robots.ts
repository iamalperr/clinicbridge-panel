/** Minimal robots.txt check for User-agent: *. Missing file means allow. */
export function isPathAllowedByRobots(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; disallows: string[] }[] = [];
  let agents: string[] = [];
  let disallows: string[] = [];
  let sawAgent = false;

  const flush = () => {
    if (!sawAgent) return;
    groups.push({ agents, disallows });
    agents = [];
    disallows = [];
    sawAgent = false;
  };

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) {
      flush();
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (sawAgent && disallows.length) flush();
      agents.push(value.toLowerCase());
      sawAgent = true;
    } else if (key === "disallow" && sawAgent && value) {
      disallows.push(value);
    }
  }
  flush();

  const star = groups.find((group) => group.agents.includes("*"));
  if (!star) return true;
  const target = path.startsWith("/") ? path : `/${path}`;
  return !star.disallows.some((rule) => target === rule || target.startsWith(rule));
}

export function sitemapUrlsFromRobots(robotsTxt: string): string[] {
  const urls: string[] = [];
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.toLowerCase().startsWith("sitemap:")) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      if (value) urls.push(value);
    }
  }
  return urls;
}
