"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import MarketingGoogleTag from "@/components/analytics/MarketingGoogleTag";
import MarketingMetaPixel from "@/components/analytics/MarketingMetaPixel";

/**
 * Host/pathname for pixel gating must not come from headers() in the root
 * layout (that forces every route dynamic). Read them on the client instead.
 */
export default function MarketingPixelsClient() {
  const pathname = usePathname() || "";
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  if (!host) return null;

  return (
    <>
      <MarketingGoogleTag host={host} pathname={pathname} />
      <MarketingMetaPixel host={host} pathname={pathname} />
    </>
  );
}
