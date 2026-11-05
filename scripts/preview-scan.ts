/**
 * Scan a clinic site from this machine and store the preview.
 *
 *   npx tsx scripts/preview-scan.ts <url> [--request <id>]
 *
 * Uses the same crawl and extraction as the server.
 */

import path from "node:path";
import dotenv from "dotenv";
import { previewPublicUrl } from "../lib/preview/adminFacts";
import { applyOperatorScan, parsePreviewScanArgs } from "../lib/preview/localScan";
import { PreviewUrlError } from "../lib/preview/ssrf";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const USAGE = "npx tsx scripts/preview-scan.ts <url> [--request <id>]";

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

async function main() {
  let args: { url: string; requestId: string | null };
  try {
    args = parsePreviewScanArgs(process.argv.slice(2));
  } catch {
    fail("Klinik sitesinin adresini verin.");
  }

  const started = Date.now();
  try {
    const result = await applyOperatorScan(args.url, args.requestId);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`Önizleme: ${previewPublicUrl(result.previewId)}`);
    console.log(`Sayfa: ${result.pagesScanned}`);
    console.log(`Tedavi: ${result.treatmentCount}`);
    console.log(`Dil: ${result.languageCount}`);
    console.log(`Soru: ${result.questionCount}`);
    if (result.requestStatus) console.log(`Talep durumu: ${result.requestStatus}`);
    console.log(`Süre: ${seconds} sn`);
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (error instanceof PreviewUrlError) {
      console.error(`Tarama tamamlanamadı: ${error.code} (${seconds} sn)`);
    } else if (error instanceof Error && error.message === "not_found") {
      console.error(`Talep bulunamadı (${seconds} sn)`);
    } else if (error instanceof Error && error.message === "unavailable") {
      console.error(`Veritabanı kullanılamıyor (${seconds} sn)`);
    } else if (error instanceof Error && error.message.includes("OPENAI")) {
      console.error(`Çıkarım kullanılamıyor (${seconds} sn)`);
    } else {
      const code = error instanceof Error ? error.message : "unknown";
      console.error(`Tarama tamamlanamadı: ${code} (${seconds} sn)`);
    }
    process.exit(1);
  }
}

void main();
