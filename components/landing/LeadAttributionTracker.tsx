"use client";

/**
 * Captures first/last-touch lead attribution on marketing pages.
 * Fail-soft: never affects rendering or form submission.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  captureLeadAttributionFromBrowser,
  isMarketingCapturePath,
} from "@/lib/attribution";

export default function LeadAttributionTracker() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!isMarketingCapturePath(pathname)) return;
      captureLeadAttributionFromBrowser();
    } catch {
      // never break the page
    }
  }, [pathname]);

  return null;
}
