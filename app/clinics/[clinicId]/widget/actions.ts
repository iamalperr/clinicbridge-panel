"use server";

import { revalidatePath } from "next/cache";

/**
 * Bust CDN / Next cache for the public widget-settings payload after admin save.
 * Called from the client widget settings page after a successful Firestore write.
 */
export async function revalidateWidgetSettingsCache(clinicId: string): Promise<void> {
  const id = typeof clinicId === "string" ? clinicId.trim() : "";
  if (!/^[A-Za-z0-9]{8,128}$/.test(id)) return;
  revalidatePath(`/api/public/widget-settings/${id}`);
}
