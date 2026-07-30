/**
 * Resolves the appropriate contact number based on the clinic's settings and the active conversation language.
 * 
 * Rules:
 * - Turkish conversation: Use Turkish Contact Number.
 * - Non-Turkish conversation: Use International Contact Number.
 * - Fallbacks: 
 *   - If no International Contact Number, use Turkish.
 *   - If neither, fallback to legacy `whatsappNumber` or `phone`.
 */
export function resolveContactNumber(
  clinicData: { 
    turkishContactNumber?: string; 
    internationalContactNumber?: string; 
    whatsappNumber?: string; 
    whatsapp?: string;
    phone?: string; 
  },
  language: string,
  trainingDocs?: Array<{ title: string; content: string }>
): string {
  const isTurkish = language === "tr";

  // Helper to extract number from KB document based on keyword
  const getNumberFromKB = (keyword: string) => {
    if (!trainingDocs || trainingDocs.length === 0) return undefined;
    const doc = trainingDocs.find(d => d.title.toLowerCase().includes(keyword.toLowerCase()));
    if (!doc) return undefined;
    // Extract phone numbers using a basic regex from the text
    const match = doc.content.match(/(?:[+]\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
    return match ? match[0] : doc.content.trim();
  };

  const kbTurkish = getNumberFromKB("turkish contact number") || getNumberFromKB("türkçe iletişim");
  const kbInternational = getNumberFromKB("international contact number") || getNumberFromKB("yabancı hasta iletişim");

  if (isTurkish) {
    return (
      clinicData.turkishContactNumber ||
      kbTurkish ||
      clinicData.internationalContactNumber ||
      kbInternational ||
      clinicData.whatsappNumber ||
      clinicData.whatsapp ||
      clinicData.phone ||
      ""
    );
  } else {
    return (
      clinicData.internationalContactNumber ||
      kbInternational ||
      clinicData.turkishContactNumber ||
      kbTurkish ||
      clinicData.whatsappNumber ||
      clinicData.whatsapp ||
      clinicData.phone ||
      ""
    );
  }
}
