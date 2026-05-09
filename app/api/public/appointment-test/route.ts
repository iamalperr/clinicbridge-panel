/**
 * GET /api/public/appointment-test?clinicId=XXX
 * Quickly diagnoses what's failing in the appointment write flow.
 * DO NOT expose in production long-term — use for debugging only.
 */
import { NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clinicId  = searchParams.get("clinicId") ?? "test";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const apiKey    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY    ?? "";

  const results: Record<string, any> = {
    env: {
      projectId:    projectId ? "✅ set" : "❌ missing",
      apiKey:       apiKey    ? "✅ set" : "❌ missing",
      openai:       process.env.OPENAI_API_KEY       ? "✅ set" : "❌ missing",
      resend:       process.env.RESEND_API_KEY        ? "✅ set" : "❌ missing",
      adminEmail:   process.env.FIREBASE_CLIENT_EMAIL ? "✅ set" : "❌ missing",
      adminKey:     process.env.FIREBASE_PRIVATE_KEY  ? "✅ set" : "❌ missing",
    },
  };

  if (!projectId || !apiKey) {
    return NextResponse.json({ error: "Firebase config missing", results }, { headers: CORS });
  }

  // Test 1: Anonymous Auth
  try {
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      }
    );
    const authData = await authRes.json();
    if (authRes.ok && authData.idToken) {
      results.anonymousAuth = `✅ OK (uid=${authData.localId})`;

      // Test 2a: Firestore write WITH token
      const writeRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_debug_test_`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authData.idToken}`,
          },
          body: JSON.stringify({
            fields: {
              testField:  { stringValue: "debug_test" },
              clinicId:   { stringValue: clinicId },
              ts:         { stringValue: new Date().toISOString() },
            },
          }),
        }
      );
      const writeData = await writeRes.json();
      results.firestoreWriteWithToken = writeRes.ok
        ? `✅ OK (docId=${writeData.name?.split("/").pop()})`
        : `❌ ${writeRes.status}: ${JSON.stringify(writeData?.error ?? writeData).slice(0, 200)}`;

    } else {
      results.anonymousAuth = `❌ ${authRes.status}: ${JSON.stringify(authData?.error ?? authData).slice(0, 200)}`;
    }
  } catch (e: any) {
    results.anonymousAuth = `❌ Exception: ${e.message}`;
  }

  // Test 2b: Firestore write WITHOUT token (API key only)
  try {
    const writeRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_debug_test_?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            testField: { stringValue: "debug_test_noauth" },
            ts:        { stringValue: new Date().toISOString() },
          },
        }),
      }
    );
    const writeData = await writeRes.json();
    results.firestoreWriteApiKeyOnly = writeRes.ok
      ? `✅ OK (docId=${writeData.name?.split("/").pop()})`
      : `❌ ${writeRes.status}: ${JSON.stringify(writeData?.error ?? writeData).slice(0, 200)}`;
  } catch (e: any) {
    results.firestoreWriteApiKeyOnly = `❌ Exception: ${e.message}`;
  }

  // Test 3: Firestore read (clinic doc)
  try {
    const readRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/clinics/${clinicId}?key=${apiKey}`
    );
    results.firestoreRead = readRes.ok
      ? `✅ OK (status=${readRes.status})`
      : `❌ ${readRes.status}`;
  } catch (e: any) {
    results.firestoreRead = `❌ Exception: ${e.message}`;
  }

  return NextResponse.json(results, { headers: CORS });
}
