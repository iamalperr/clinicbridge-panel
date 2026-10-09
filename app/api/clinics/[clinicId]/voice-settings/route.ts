import { handleVoiceSettingsRequest, readJsonBody } from "@/lib/voice/config/http";
import { getVoiceSettings, updateVoiceSettings } from "@/lib/voice/config/voiceSettingsService";

type RouteParams = { params: Promise<{ clinicId: string }> };

/** GET /api/clinics/[clinicId]/voice-settings — clinic voice settings (legacy baseline when unset). */
export async function GET(req: Request, { params }: RouteParams) {
  const { clinicId } = await params;
  return handleVoiceSettingsRequest(req, "GET /api/clinics/[clinicId]/voice-settings", (deps, caller) =>
    getVoiceSettings(deps, caller, clinicId)
  );
}

/** PATCH /api/clinics/[clinicId]/voice-settings — body: { expectedVersion, patch }. */
export async function PATCH(req: Request, { params }: RouteParams) {
  const { clinicId } = await params;
  const body = await readJsonBody(req);
  return handleVoiceSettingsRequest(req, "PATCH /api/clinics/[clinicId]/voice-settings", (deps, caller) =>
    updateVoiceSettings(deps, caller, clinicId, { expectedVersion: body?.expectedVersion, patch: body?.patch })
  );
}
