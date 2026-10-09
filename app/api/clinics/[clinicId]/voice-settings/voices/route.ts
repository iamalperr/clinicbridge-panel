import { handleVoiceSettingsRequest } from "@/lib/voice/config/http";
import { listAvailableVoiceProfiles, listCustomVoices } from "@/lib/voice/config/voiceSettingsService";

type RouteParams = { params: Promise<{ clinicId: string }> };

/** GET /api/clinics/[clinicId]/voice-settings/voices — selectable voices and the clinic's custom voices. */
export async function GET(req: Request, { params }: RouteParams) {
  const { clinicId } = await params;
  return handleVoiceSettingsRequest(req, "GET /api/clinics/[clinicId]/voice-settings/voices", async (deps, caller) => {
    const available = await listAvailableVoiceProfiles(deps, caller, clinicId);
    if (!available.ok) return available;
    const custom = await listCustomVoices(deps, caller, clinicId);
    if (!custom.ok) return custom;
    return { ok: true, value: { available: available.value, custom: custom.value } };
  });
}
