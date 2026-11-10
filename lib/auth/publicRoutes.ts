const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/kvkk",
  "/hakkimizda",
  "/klinikler-icin-yapay-zeka-asistani",
  "/fiyatlandirma",
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
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/demo/") || pathname.startsWith("/agency-demo") || pathname.startsWith("/onizleme/");
}

/** Marketing pages that must emit document HTML without the panel AuthGuard shell. */
const MARKETING_DOCUMENT_PATHS = new Set([
  "/",
  "/landing",
  "/thank-you",
  "/klinikler-icin-yapay-zeka-asistani",
  "/hakkimizda",
  "/fiyatlandirma",
  "/privacy",
  "/terms",
  "/kvkk",
  "/teslimat-ve-iade",
  "/mesafeli-satis-sozlesmesi",
]);

export function isMarketingDocumentPath(pathname: string): boolean {
  return MARKETING_DOCUMENT_PATHS.has(pathname) || pathname.startsWith("/onizleme/");
}
