/** Site-preview facts. Empty fields mean the page did not contain them. */
export interface PreviewTreatment {
  name: string;
  priceRange: string | null;
}

export interface PreviewFaq {
  question: string;
  answer: string;
}

/** Shape Phase B can copy onto trainingMaterials / agency knowledge records. */
export interface PreviewKnowledgeItem {
  title: string;
  category:
    | "Klinik Genel Bilgi"
    | "Tedaviler"
    | "Çalışma Saatleri"
    | "Sık Sorulan Sorular";
  language: "TR" | "EN";
  content: string;
}

export interface PreviewFacts {
  clinicName: string | null;
  treatments: PreviewTreatment[];
  address: string | null;
  hours: string | null;
  phone: string | null;
  whatsapp: string | null;
  languages: string[];
  faq: PreviewFaq[];
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface PreviewRecord extends PreviewFacts {
  sourceUrl: string;
  embeddable: boolean;
  pagesScanned: number;
  knowledgeItems: PreviewKnowledgeItem[];
  messageCount: number;
  createdAt: string;
  expiresAt: string;
}

export const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PREVIEW_MAX_MESSAGES = 30;
export const PREVIEW_SCAN_LIMIT_PER_HOUR = 5;
