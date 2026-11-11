import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  buildAdminDigestBuckets,
  dueTrialLifecycleMilestones,
  selectLifecycleEmail,
  shouldMarkConverted,
  type LifecycleClinicSnapshot,
} from "@/lib/lifecycle/cronSelection";
import {
  buildAdminDigestEmail,
  buildLifecycleClinicEmail,
  digestClinicLabel,
} from "@/lib/lifecycle/emails";
import { asDate } from "@/lib/lifecycle/milestones";
import { lifecycleOptOutUrl } from "@/lib/lifecycle/optOut";
import {
  markLifecycleEmailSent,
  recordLifecycleMilestone,
} from "@/lib/lifecycle/recordMilestone";
import { LIFECYCLE_COLLECTION, type LifecycleEmailsSent, type LifecycleMilestonesMap } from "@/lib/lifecycle/types";
import { sendClinicEmail } from "@/lib/trial/sendClinicEmail";
import { trialLanguage } from "@/lib/trial/policy";

export interface DailyLifecycleResult {
  digestSent: boolean;
  emails: Array<{ clinicId: string; key: string; sent: boolean }>;
  milestones: Array<{ clinicId: string; milestone: string; wrote: boolean }>;
}

function snapshotFromDocs(
  lifecycleId: string,
  life: Record<string, unknown>,
  clinic: Record<string, unknown> | null
): LifecycleClinicSnapshot {
  return {
    clinicId: lifecycleId,
    acquisition: life.acquisition || clinic?.acquisition || "direct",
    plan: clinic?.plan || life.plan || "trial",
    signedUpAt: asDate(life.signedUpAt) || asDate(clinic?.createdAt),
    trialEndsAt: asDate(life.trialEndsAt) || asDate(clinic?.trialEndsAt),
    milestones: (life.milestones || {}) as LifecycleMilestonesMap,
    emailsSent: (life.emailsSent || {}) as LifecycleEmailsSent,
    lifecycleEmailOptOut: life.lifecycleEmailOptOut === true,
    activated: life.activated === true,
    activatedAt: asDate(life.activatedAt),
    conversationCount: typeof clinic?.chatUsageCount === "number" ? clinic.chatUsageCount : 0,
    appointmentRequestCount: typeof clinic?.conversations === "number" ? undefined : undefined,
  };
}

async function countAppointments(db: Firestore, clinicId: string): Promise<number> {
  try {
    const snap = await db.collection("appointments").where("clinicId", "==", clinicId).limit(200).get();
    return snap.size;
  } catch {
    return 0;
  }
}

export async function runDailyTrialLifecycle(
  db: Firestore,
  input: {
    now?: Date;
    adminAlertEmail?: string | null;
    dryRun?: boolean;
    onlyClinicId?: string;
  } = {}
): Promise<DailyLifecycleResult> {
  const now = input.now || new Date();
  const adminEmail = input.adminAlertEmail ?? process.env.ADMIN_ALERT_EMAIL ?? "";
  const result: DailyLifecycleResult = { digestSent: false, emails: [], milestones: [] };

  const lifeSnaps = input.onlyClinicId
    ? [await db.collection(LIFECYCLE_COLLECTION).doc(input.onlyClinicId).get()].filter((s) => s.exists)
    : (await db.collection(LIFECYCLE_COLLECTION).get()).docs;

  const snapshots: Array<LifecycleClinicSnapshot & { clinicName: string; contactEmail: string; contactName: string; language: unknown }> = [];

  for (const lifeSnap of lifeSnaps) {
    const life = lifeSnap.data() || {};
    const clinicSnap = await db.collection("clinics").doc(lifeSnap.id).get();
    const clinic = clinicSnap.exists ? clinicSnap.data() || null : null;
    const base = snapshotFromDocs(lifeSnap.id, life, clinic);
    if (shouldMarkConverted({ plan: base.plan, milestones: base.milestones })) {
      const wrote = await recordLifecycleMilestone(db, {
        clinicId: lifeSnap.id,
        milestone: "converted_to_paid",
        at: now,
        meta: { plan: String(base.plan || "") },
        contact: { plan: String(base.plan || "") },
      });
      result.milestones.push({ clinicId: lifeSnap.id, milestone: "converted_to_paid", wrote: wrote.wrote });
      base.milestones = { ...base.milestones, converted_to_paid: now.toISOString() };
    }
    for (const milestone of dueTrialLifecycleMilestones({ ...base, now })) {
      const wrote = await recordLifecycleMilestone(db, {
        clinicId: lifeSnap.id,
        milestone,
        at: now,
      });
      result.milestones.push({ clinicId: lifeSnap.id, milestone, wrote: wrote.wrote });
      base.milestones = { ...base.milestones, [milestone]: now.toISOString() };
    }
    snapshots.push({
      ...base,
      clinicName: typeof life.clinicName === "string" ? life.clinicName : typeof clinic?.name === "string" ? clinic.name : lifeSnap.id,
      contactEmail: typeof life.contactEmail === "string" ? life.contactEmail : typeof clinic?.email === "string" ? clinic.email : "",
      contactName: typeof life.contactName === "string" ? life.contactName : "",
      language: clinic?.language,
      conversationCount: typeof clinic?.chatUsageCount === "number" ? clinic.chatUsageCount : 0,
    });
  }

  const buckets = buildAdminDigestBuckets(snapshots, now);
  if (!input.dryRun && adminEmail) {
    const labels: Record<string, string> = {};
    for (const snap of snapshots) labels[snap.clinicId] = digestClinicLabel(snap);
    const message = buildAdminDigestEmail({ buckets, labels });
    result.digestSent = await sendClinicEmail({ to: adminEmail, subject: message.subject, html: message.html });
  }

  for (const snap of snapshots) {
    const key = selectLifecycleEmail(snap, now);
    if (!key) continue;
    if (input.dryRun) {
      result.emails.push({ clinicId: snap.clinicId, key, sent: false });
      continue;
    }
    const claimed = await markLifecycleEmailSent(db, snap.clinicId, key, now);
    if (!claimed) {
      result.emails.push({ clinicId: snap.clinicId, key, sent: false });
      continue;
    }
    const apptCount = key === "day7_summary" ? await countAppointments(db, snap.clinicId) : 0;
    const message = buildLifecycleClinicEmail({
      key,
      language: trialLanguage(undefined, snap.language),
      clinicName: snap.clinicName,
      contactName: snap.contactName,
      optOutUrl: lifecycleOptOutUrl(snap.clinicId),
      conversationCount: snap.conversationCount,
      appointmentRequestCount: apptCount,
    });
    const sent = await sendClinicEmail({
      to: snap.contactEmail,
      subject: message.subject,
      html: message.html,
    });
    if (!sent) {
      await db.collection(LIFECYCLE_COLLECTION).doc(snap.clinicId).set(
        { emailsSent: { [key]: FieldValue.delete() } },
        { merge: true }
      );
    }
    result.emails.push({ clinicId: snap.clinicId, key, sent });
  }

  return result;
}
