const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/kvkk",
  "/hakkimizda",
  "/klinikler-icin-yapay-zeka-asistani",
  "/fiyatlandirma",
  "/kurulum-rehberi",
  "/sss",
  "/en",
  "/en/sss",
  "/teslimat-ve-iade",
  "/mesafeli-satis-sozlesmesi",
  "/landing",
  "/reset-password",
  "/showcase-demo",
  "/showcase-patient-questions",
  "/linkedin-assets",
  "/social-posts",
  "/widget-guide",
  "/agency-demo",
  "/kayit",
  "/setup-wizard-fixture",
];

export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith("/demo/") ||
    pathname.startsWith("/agency-demo") ||
    pathname.startsWith("/onizleme/") ||
    pathname.startsWith("/en/")
  );
}

/** Marketing pages that must emit document HTML without the panel AuthGuard shell. */
const MARKETING_DOCUMENT_PATHS = new Set([
  "/",
  "/landing",
  "/thank-you",
  "/klinikler-icin-yapay-zeka-asistani",
  "/hakkimizda",
  "/fiyatlandirma",
  "/kurulum-rehberi",
  "/sss",
  "/en",
  "/en/sss",
  "/privacy",
  "/terms",
  "/kvkk",
  "/teslimat-ve-iade",
  "/mesafeli-satis-sozlesmesi",
]);

export function isMarketingDocumentPath(pathname: string): boolean {
  return (
    MARKETING_DOCUMENT_PATHS.has(pathname) ||
    pathname.startsWith("/onizleme/") ||
    pathname.startsWith("/en/")
  );
}
