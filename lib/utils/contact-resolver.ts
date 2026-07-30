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
  language: string
): string {
  const isTurkish = language === "tr";

  if (isTurkish) {
    return (
      clinicData.turkishContactNumber ||
      clinicData.internationalContactNumber ||
      clinicData.whatsappNumber ||
      clinicData.whatsapp ||
      clinicData.phone ||
      ""
    );
  } else {
    return (
      clinicData.internationalContactNumber ||
      clinicData.turkishContactNumber ||
      clinicData.whatsappNumber ||
      clinicData.whatsapp ||
      clinicData.phone ||
      ""
    );
  }
}
