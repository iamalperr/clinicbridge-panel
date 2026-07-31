# Global Prices & Services Parser Improvement & Repair Plan

## Goal
Improve the FeelinHealthy Agency Portal's global parser mechanism to support client-rendered HTML, accordion expansions, and nested row extractions for "Prices & Services". Apply this new mechanism to specifically repair the "Beyazışık Marmaris Dental Group" clinic record.

## Background Context
Currently, clinic profiles are fetched via `node-fetch` and parsed using `cheerio`. This means only server-rendered (static) content is accessible. For clinics like Beyazışık Marmaris Dental Group, the "Prices & Services" data is hidden behind client-side rendering or accordion elements, causing incomplete data extraction.

## Open Questions
- Do we want to persist the Puppeteer extraction utility under `lib/services/browserParser.ts` or `scripts/utils/browserParser.ts`? (I will plan to put it in `scripts/utils/browserParser.ts` since parsing is mostly used by installer scripts).

## Proposed Changes

### 1. Global Parser Module
#### [NEW] [browserParser.ts](file:///Users/yusufalperozgul/clinicbridge-panel/scripts/utils/browserParser.ts)
Implement a Puppeteer-based parser utility that will:
- Launch a headless browser instance.
- Navigate to the canonical URL and wait for DOM stability (`networkidle0` or similar).
- Locate the "Prices & Services" (or localized variants) section dynamically.
- Find and click all collapsible accordions (using `button`, `summary`, `[data-state]`, etc.).
- Wait for the DOM to settle post-click.
- Extract nested category-to-row hierarchies and return a structured array of categories, services, prices, and durations.
- Gracefully handle price parsing (removing currency symbols, replacing commas with dots, etc.) and duration parsing.
- Produce extraction metrics for completeness validation (detected vs parsed rows).

### 2. Targeted Repair Script
#### [NEW] [repair-beyazisik-marmaris-prices-services.ts](file:///Users/yusufalperozgul/clinicbridge-panel/scripts/repair-beyazisik-marmaris-prices-services.ts)
Create a targeted script that:
- Runs a dry-run by default, saving via `--apply`.
- Connects to Firestore and fetches the existing "Beyazışık Marmaris Dental Group" record (ID preservation).
- Invokes the new `browserParser.ts` to extract the full 17 treatment rows under 7 categories.
- Validates that exactly 17 rows with valid prices and durations were extracted.
- Deletes existing incomplete treatment/pricing records and rewrites the newly extracted 17 rows.
- Updates the clinic's AI Knowledge Base documents related to treatments, pricing, and durations.
- Guarantees idempotency on second runs.

## Verification Plan

### Automated Tests
- Run `npm run lint` and `npm run type-check`.
- Execute the dry-run of the repair script.
- Execute the `--apply` mode of the repair script.
- Execute the `--apply` mode a second time to verify idempotency.

### Manual Verification
- Review Firestore documents post-execution to ensure exactly 17 rows, 7 categories, prices, and durations are set for Beyazışık Marmaris Dental Group.
- Verify through the true UI (Network Portal UI) that the full Prices & Services section appears.
- Query the agent in both Turkish and English for specific treatment prices (e.g., "All-on-4 implant fiyatı nedir?") to verify correct context injection.
