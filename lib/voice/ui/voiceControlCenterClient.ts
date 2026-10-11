import type {
  DidVoiceOverrideClientView,
  VoiceCatalogClientView,
  VoiceSettingsClientView,
} from "./voiceControlCenterModel";
import type { VoiceSettingsPatch } from "@/lib/voice/config/types";

export class VoiceControlCenterApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly errors: readonly { readonly code: string; readonly field?: string }[]
  ) {
    super(code);
    this.name = "VoiceControlCenterApiError";
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const record = asRecord(body);
    const errors = Array.isArray(record?.errors) ? (record.errors as { code: string; field?: string }[]) : [];
    const code =
      typeof record?.error === "string"
        ? record.error
        : errors[0]?.code ?? (res.status === 409 ? "VOICE_SETTINGS_VERSION_CONFLICT" : "VOICE_CONFIG_LOOKUP_FAILED");
    throw new VoiceControlCenterApiError(res.status, code, errors);
  }
  return body as T;
}

export async function loadVoiceControlCenter(
  clinicId: string,
  token: string
): Promise<{
  settings: VoiceSettingsClientView;
  voices: VoiceCatalogClientView;
  dids: DidVoiceOverrideClientView[];
}> {
  const encoded = encodeURIComponent(clinicId);
  const base = `/api/clinics/${encoded}/voice-settings`;
  const [settings, voices, dids] = await Promise.all([
    request<VoiceSettingsClientView>(base, token),
    request<VoiceCatalogClientView>(`${base}/voices`, token),
    request<DidVoiceOverrideClientView[]>(`${base}/did-overrides`, token),
  ]);
  return { settings, voices, dids };
}

export async function patchVoiceSettings(
  clinicId: string,
  token: string,
  expectedVersion: number,
  patch: VoiceSettingsPatch
): Promise<{ changed: boolean; version: number; changedFields: readonly string[] }> {
  return request(`/api/clinics/${encodeURIComponent(clinicId)}/voice-settings`, token, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion, patch }),
  });
}

export async function putDidVoiceOverride(
  clinicId: string,
  token: string,
  expectedVersion: number,
  calledDid: string,
  voiceProfileKey: string | null
): Promise<{ changed: boolean; version: number; changedFields: readonly string[] }> {
  return request(`/api/clinics/${encodeURIComponent(clinicId)}/voice-settings/did-overrides`, token, {
    method: "PUT",
    body: JSON.stringify({ expectedVersion, calledDid, voiceProfileKey }),
  });
}
