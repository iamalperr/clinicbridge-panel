"use client";

import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { buildAppSignupUrl, APP_SIGNUP_BASE_URL } from "@/lib/analytics/signupRedirect";

/**
 * Signup CTA that appends current-page UTM / click ids so attribution survives
 * the marketing → app.clinicbridge-ai.com/kayit redirect.
 */
export default function AppSignupLink({
  children,
  className,
  style,
  extraQuery,
  ...rest
}: {
  children: ReactNode;
  extraQuery?: Record<string, string | undefined | null>;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const [href, setHref] = useState(APP_SIGNUP_BASE_URL);

  useEffect(() => {
    setHref(buildAppSignupUrl({ extra: extraQuery }));
    // Capture once on mount / when serialized extras change — avoid object-identity thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(extraQuery || {})]);

  return (
    <a {...rest} className={className} style={style} href={href}>
      {children}
    </a>
  );
}
