import { afterAll, describe, expect, it } from "vitest";
import { getAdminAuth, getAdminDb } from "../lib/firebase-admin";
import { ISTANBUL_DIS_AKADEMISI_CLINIC_ID } from "../lib/services/weeklyClinicReport/weeklyClinicReportConfig";
import { runDirectClinicWeeklyReports } from "../lib/services/weeklyClinicReport/directClinicWeekly";

const enabled = Boolean(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
const clinicId = "PhaseEClinic1";
const email = "phasee.weekly.report@example.com";

describe.skipIf(!enabled)("direct weekly report against Firestore", () => {
  let uid = "";

  afterAll(async () => {
    const db = getAdminDb();
    const auth = getAdminAuth();
    if (uid && auth) await auth.deleteUser(uid).catch(() => undefined);
    if (!db) return;
    const logs = await db.collection("clinics").doc(clinicId).collection("conversationLogs").get();
    for (const log of logs.docs) await log.ref.delete();
    await db.collection("clinics").doc(clinicId).delete().catch(() => undefined);
    await db.collection("weeklyClinicReports").doc(`${clinicId}_2026-09-07`).delete().catch(() => undefined);
  });

  it("reports the seeded week only to the verified clinic user", async () => {
    const db = getAdminDb();
    const auth = getAdminAuth();
    expect(db && auth).toBeTruthy();
    if (!db || !auth) return;
    const existing = await auth.getUserByEmail(email).catch(() => null);
    if (existing) await auth.deleteUser(existing.uid);
    const user = await auth.createUser({
      email,
      password: `PhaseE-${Date.now()}-aA1`,
      emailVerified: true,
    });
    uid = user.uid;
    await auth.setCustomUserClaims(uid, { role: "clinicUser", clinicId });
    await db.collection("clinics").doc(clinicId).set({
      name: "Faz E Klinik",
      email,
      language: "tr",
      acquisition: "direct",
      plan: "trial",
      status: "trial",
      workingHours: "09:00-18:00",
    });
    await db.collection("users").doc(uid).set({ uid, email, clinicId, role: "clinicUser", status: "active" });
    const logs = db.collection("clinics").doc(clinicId).collection("conversationLogs");
    await logs.doc("inside").set({ createdAt: "2026-09-08T08:30:00.000Z", clinicId });
    await logs.doc("after").set({ createdAt: "2026-09-08T19:30:00.000Z", clinicId, contactRequestId: "cr_phase_e" });
    await logs.doc("old").set({ createdAt: "2026-09-01T08:30:00.000Z", clinicId, appointmentId: "old" });

    const { results } = { results: await runDirectClinicWeeklyReports({
      mode: "dry_run",
      clinicId,
      weekStartDate: "2026-09-07",
      weekEndDate: "2026-09-13",
    }) };
    expect(results).toHaveLength(1);
    expect(results[0].clinicId).toBe(clinicId);
    expect(results[0].clinicId).not.toBe(ISTANBUL_DIS_AKADEMISI_CLINIC_ID);
    expect(results[0].recipients).toEqual([email]);
    expect(results[0].emailSent).toBe(false);
    expect(results[0].directStats).toEqual({ patients: 2, outsideHours: 1, forwardedAppointments: 1 });
    expect(results[0].summaryTr).not.toContain("cr_phase_e");
    await db.collection("weeklyClinicReports").doc(`${clinicId}_2026-09-07`).delete();
  }, 30000);
});
