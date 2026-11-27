# perf/static-shell-heartbeat — review before merge

Backup branch. Split out of `fix/post-appointment-reschedule-carryover` (based on `a8516a1`) so the
agent fixes could ship without these changes. **Not reviewed for production yet. Do not merge as is.**

## What this branch contains (beyond the agent fixes it was branched with)

- **Static root shell**
  - `app/layout.tsx` is `force-static` and no longer calls `headers()`.
  - Auth providers live in the client `components/layout/RootAppShell.tsx` (skipped on marketing/legal paths).
  - `app/(marketing)/MarketingChrome.tsx` and a pass-through `app/admin/layout.tsx`.
  - `force-static` on marketing/legal pages (`/`, `/en`, `/sss`, `/en/sss`, `/fiyatlandirma`,
    `/kurulum-rehberi`, `/klinikler-icin-yapay-zeka-asistani`, `(legal)` layout).
  - GA4 / Meta Pixel mount on the client via `components/analytics/MarketingPixelsClient.tsx`
    (host read from `window.location` instead of request headers).
- **Heartbeat reduction**
  - `ActivityTracker` sends nothing while the tab is hidden and resumes on `visibilitychange`.
  - `heartbeatScheduler` returns `hidden` for hidden tabs.
  - The heartbeat route does one read and no write on the hot path; UA parsing only when a session opens.

The widget-settings caching is **not** here: it was reverted in `f524ebb` before this branch was cut,
so the widget behaves like `main` (no cache, 5 s poll).

When merging, rebase onto the fix branch or `main` first. The fix branch reverts these files in
`66568af`, so a straight merge after it would need those changes reapplied.

## Review checklist

1. **Server pages that read live data without request APIs.** List every page and layout that reads
   Firestore (or any other live source) on the server without `cookies()`, `headers()` or `searchParams`.
   Under a `force-static` root they render once at build time and then serve stale data. For each one,
   decide: `force-dynamic`, `revalidate`, or move the read to the client.
2. **Request-reading pages.** `tests/StaticRootDynamicPages.test.ts` must stay green. It flags server
   pages that read `searchParams`, `headers()` or `cookies()` without `force-dynamic`. This is how
   `/action/appointment/verify` was found to be prerendered with an empty token.
3. **Pixels and cookie consent.**
   - Do Consent Mode defaults still apply before any tag loads?
   - Is the `CookieBanner` choice respected?
   - Is there any GA4 or Meta Pixel request before consent?
   - Do tags still fire only on the marketing host, and not on panel or clinic paths?
4. **Heartbeat.** Hidden tabs now send nothing. Check that admin analytics session duration and
   expiry still look right, including multi-tab and long-background cases.
5. **Build.** In `npm run build`, marketing/legal routes should be `○ (Static)` and request-reading
   routes `ƒ (Dynamic)`. Then verify a preview with a real browser: panel login, `AuthGuard` redirects,
   theme, and the cookie banner.
