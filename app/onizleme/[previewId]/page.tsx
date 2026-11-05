import type { Metadata } from "next";
import { LandingLangProvider } from "@/lib/landing-translations";
import SitePreviewPage from "@/components/landing/SitePreviewPage";

export const metadata: Metadata = {
  title: "ClinicBridge AI — Bot önizlemesi",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({ params }: { params: Promise<{ previewId: string }> }) {
  const { previewId } = await params;
  return (
    <LandingLangProvider>
      <SitePreviewPage previewId={previewId} />
    </LandingLangProvider>
  );
}
