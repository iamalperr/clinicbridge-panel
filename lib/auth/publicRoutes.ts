const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/kvkk",
  "/hakkimizda",
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
