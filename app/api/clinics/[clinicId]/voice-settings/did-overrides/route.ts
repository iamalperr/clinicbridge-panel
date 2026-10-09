import { handleVoiceSettingsRequest, readJsonBody } from "@/lib/voice/config/http";
import { getDidVoiceOverrides, updateDidVoiceOverride } from "@/lib/voice/config/voiceSettingsService";

type RouteParams = { params: Promise<{ clinicId: string }> };

/** GET /api/clinics/[clinicId]/voice-settings/did-overrides — the clinic's DIDs and assigned DID profiles. */
export async function GET(req: Request, { params }: RouteParams) {
  const { clinicId } = await params;
  return handleVoiceSettingsRequest(req, "GET /api/clinics/[clinicId]/voice-settings/did-overrides", (deps, caller) =>
    getDidVoiceOverrides(deps, caller, clinicId)
  );
}

/** PUT /api/clinics/[clinicId]/voice-settings/did-overrides — body: { calledDid, voiceProfileKey | null, expectedVersion }. */
export async function PUT(req: Request, { params }: RouteParams) {
  const { clinicId } = await params;
  const body = await readJsonBody(req);
  return handleVoiceSettingsRequest(req, "PUT /api/clinics/[clinicId]/voice-settings/did-overrides", (deps, caller) =>
    updateDidVoiceOverride(deps, caller, clinicId, {
      calledDid: body?.calledDid,
      voiceProfileKey: body?.voiceProfileKey,
      expectedVersion: body?.expectedVersion,
    })
  );
}
