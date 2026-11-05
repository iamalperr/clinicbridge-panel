import { NOVA_CLINIC_NAME, NOVA_FAQS, NOVA_PRIMARY_COLOR, NOVA_TREATMENTS } from "@/lib/demo/novaDental";

/** Public sample preview. It does not expire and is not created by a crawl. */
export const DEMO_PREVIEW_ID = "demo";
export const DEMO_CHAT_LIMIT_PER_HOUR = 20;

export function demoPreviewView() {
  return {
    previewId: DEMO_PREVIEW_ID,
    sourceUrl: "",
    clinicName: NOVA_CLINIC_NAME,
    logoUrl: null,
    primaryColor: NOVA_PRIMARY_COLOR,
    embeddable: false,
    treatmentCount: NOVA_TREATMENTS.length,
    languageCount: 5,
    questionCount: NOVA_FAQS.length,
  };
}
