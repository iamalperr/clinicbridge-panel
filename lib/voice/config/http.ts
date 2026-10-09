/**
 * Shared HTTP handling for the voice settings API routes: Firebase ID token verification via
 * verifyAuth, service invocation (which performs voice authorization itself), stable JSON errors.
 */

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthError, verifyAuth } from "@/lib/services/apiAuth";
import type { VoiceConfigFirestore } from "./store";
import type { VoiceServiceResult, VoiceSettingsCaller, VoiceSettingsServiceDeps } from "./voiceSettingsService";

export type VoiceRouteOperation<T> = (deps: VoiceSettingsServiceDeps, caller: VoiceSettingsCaller) => Promise<VoiceServiceResult<T>>;

export async function handleVoiceSettingsRequest<T>(
  req: Request,
  route: string,
  operation: VoiceRouteOperation<T>
): Promise<NextResponse> {
  try {
    const auth = await verifyAuth(req);
    const deps: VoiceSettingsServiceDeps = { db: getAdminDb() as unknown as VoiceConfigFirestore | null };
    const result = await operation(deps, { uid: auth.uid, profile: auth.profile });
    if (!result.ok) return NextResponse.json({ error: "VOICE_CONFIG_REJECTED", errors: result.errors }, { status: result.status });
    return NextResponse.json(result.value);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.status === 401 ? "VOICE_UNAUTHENTICATED" : "VOICE_ACCESS_DENIED" },
        { status: err.status }
      );
    }
    console.error(
      JSON.stringify({
        checkpoint: "VOICE_SETTINGS_ROUTE_FAILED",
        route,
        errorType: err instanceof Error ? err.name.slice(0, 64) : typeof err,
      })
    );
    return NextResponse.json({ error: "VOICE_CONFIG_LOOKUP_FAILED" }, { status: 503 });
  }
}

/** Parses a JSON body; returns undefined for malformed bodies (the service then rejects the shape). */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
