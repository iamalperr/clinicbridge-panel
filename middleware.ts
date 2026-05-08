import { NextRequest, NextResponse } from "next/server";

// ─── Domain Configuration ───────────────────────────────────────────────────
//
// clinicbridge-ai.com     → Landing page only (public marketing site)
// app.clinicbridge-ai.com → Full app: login, dashboard, all admin routes
//
// In local development both resolve to localhost:3000.
// Use ?_domain=app or ?_domain=landing in dev to simulate different domains.
// ---------------------------------------------------------------------------

const LANDING_HOSTNAMES = new Set([
  "clinicbridge-ai.com",
  "www.clinicbridge-ai.com",
]);

const APP_HOSTNAMES = new Set([
  "app.clinicbridge-ai.com",
]);

const WIDGET_HOSTNAMES = new Set([
  "widget.clinicbridge-ai.com",
]);

// Routes that belong exclusively to the app subdomain
const APP_ONLY_PATHS = /^\/(login|clinics|analytics|settings|users|reset-password|api)(\/|$)/;

function getDomainContext(req: NextRequest): "landing" | "app" | "widget" | "dev" {
  const host = req.headers.get("host") ?? "";
  // Strip port for local dev comparison
  const hostname = host.split(":")[0];

  if (LANDING_HOSTNAMES.has(hostname)) return "landing";
  if (APP_HOSTNAMES.has(hostname)) return "app";
  if (WIDGET_HOSTNAMES.has(hostname)) return "widget";

  // Dev override via query param: ?_domain=app  or  ?_domain=landing
  const devOverride = req.nextUrl.searchParams.get("_domain");
  if (devOverride === "app") return "app";
  if (devOverride === "landing") return "landing";
  if (devOverride === "widget") return "widget";

  return "dev"; // localhost without override → allow everything (normal dev)
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const context = getDomainContext(req);

  // ── widget.clinicbridge-ai.com → serve only /widget.js ───────────────────
  if (context === "widget") {
    // Allow /widget.js (the main widget script — served from public/widget.js)
    if (pathname === "/widget.js") return NextResponse.next();

    // Allow Next.js static chunks (needed for the JS file itself)
    if (pathname.startsWith("/_next")) return NextResponse.next();

    // Block everything else — this domain is widget-script-only
    return new NextResponse(
      '// ClinicBridge AI Widget\n// Use: <script src="https://widget.clinicbridge-ai.com/widget.js" data-clinic-id="YOUR_ID"></script>',
      { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" } }
    );
  }

  // ── clinicbridge-ai.com (landing domain) ──────────────────────────────────
  if (context === "landing") {
    // Allow "/" (landing page itself)
    if (pathname === "/") return NextResponse.next();

    // Allow static assets and Next.js internals
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/icon") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/logo") ||
      pathname.startsWith("/public") ||
      pathname.match(/\.(svg|png|jpg|ico|webp|css|js|woff2?)$/)
    ) {
      return NextResponse.next();
    }

    // Allow /landing (for backward compat — it redirects to "/" internally)
    if (pathname === "/landing") return NextResponse.next();

    // Allow demo-request API (called from the landing page form)
    if (pathname === "/api/demo-request") return NextResponse.next();

    // Allow legal pages accessible from landing footer
    if (pathname.startsWith("/(legal)") || pathname === "/privacy" || pathname === "/terms") {
      return NextResponse.next();
    }

    // Block everything else → back to landing
    return NextResponse.redirect(new URL("/", req.url));
  }

  // ── app.clinicbridge-ai.com (app domain) ──────────────────────────────────
  if (context === "app") {
    // Redirect "/" to "/login" on the app subdomain (no landing page here)
    if (pathname === "/" || pathname === "/landing") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Everything else is allowed — AuthGuard handles auth state
    return NextResponse.next();
  }

  // ── localhost / dev mode → no restrictions ────────────────────────────────
  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js static file serving internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
