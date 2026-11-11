import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  applyMilestoneIdempotent,
  computeActivatedAt,
  emptyAttribution,
  latestStage,
  normalizeAttribution,
} from "@/lib/lifecycle/milestones";
import {
  LIFECYCLE_COLLECTION,
  type LifecycleEventMeta,
  type LifecycleMilestone,
  type LifecycleMilestonesMap,
  type SignupAttribution,
} from "@/lib/lifecycle/types";

function milestonesFromData(data: Record<string, unknown> | undefined): LifecycleMilestonesMap {
  const raw = (data?.milestones && typeof data.milestones === "object" ? data.milestones : {}) as Record<string, unknown>;
  const out: LifecycleMilestonesMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) {
      (out as Record<string, string>)[key] = value;
    } else if (value && typeof value === "object" && "toDate" in value) {
      try {
        (out as Record<string, string>)[key] = (value as { toDate: () => Date }).toDate().toISOString();
      } catch {
        // skip
      }
    }
  }
  return out;
}

function isoFromUnknown(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function recordLifecycleMilestone(
  db: Firestore,
  input: {
    clinicId: string;
    milestone: LifecycleMilestone;
    at?: Date;
    meta?: LifecycleEventMeta;
    attribution?: Partial<SignupAttribution>;
    contact?: {
      clinicName?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      trialEndsAt?: Date | null;
      plan?: string;
    };
  }
): Promise<{ wrote: boolean; activated: boolean }> {
  const at = input.at || new Date();
  const atIso = at.toISOString();
  const ref = db.collection(LIFECYCLE_COLLECTION).doc(input.clinicId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
    const existing = milestonesFromData(data);
    const applied = applyMilestoneIdempotent(existing, input.milestone, atIso);
    if (!applied.wrote && snap.exists) {
      return { wrote: false, activated: data.activated === true };
    }

    const signedUpAtIso =
      isoFromUnknown(data.signedUpAt) ||
      (input.milestone === "signed_up" ? atIso : existing.signed_up) ||
      null;
    const signedUpAt = signedUpAtIso ? new Date(signedUpAtIso) : null;
    const widgetAt = applied.next.widget_installed ? new Date(applied.next.widget_installed) : null;
    const convAt = applied.next.first_real_conversation
      ? new Date(applied.next.first_real_conversation)
      : null;
    const activatedAtDate = computeActivatedAt({
      signedUpAt,
      widgetInstalledAt: widgetAt,
      firstRealConversationAt: convAt,
    });
    const alreadyActivated = data.activated === true;
    const activated = alreadyActivated || Boolean(activatedAtDate);
    const activatedAtIso = alreadyActivated
      ? isoFromUnknown(data.activatedAt)
      : activatedAtDate
        ? activatedAtDate.toISOString()
        : null;

    const attribution = normalizeAttribution(
      (data.attribution as SignupAttribution | undefined) ||
        (input.attribution ? normalizeAttribution(input.attribution) : emptyAttribution())
    );
    if (input.attribution && input.milestone === "signed_up") {
      Object.assign(attribution, normalizeAttribution(input.attribution));
    }

    const stage = latestStage(applied.next);
    const patch: Record<string, unknown> = {
      clinicId: input.clinicId,
      acquisition: "direct",
      milestones: applied.next,
      stage,
      activated,
      activatedAt: activatedAtIso,
      lastActivityAt: atIso,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!snap.exists) {
      patch.createdAt = FieldValue.serverTimestamp();
      patch.signedUpAt = signedUpAtIso;
      patch.attribution = attribution;
      patch.csmNote = "";
      patch.nextAction = "";
      patch.emailsSent = {};
      patch.lifecycleEmailOptOut = false;
      patch.contactName = input.contact?.contactName || "";
      patch.contactEmail = input.contact?.contactEmail || "";
      patch.contactPhone = input.contact?.contactPhone || "";
      patch.clinicName = input.contact?.clinicName || "";
      patch.trialEndsAt = input.contact?.trialEndsAt ? input.contact.trialEndsAt.toISOString() : null;
      patch.plan = input.contact?.plan || "trial";
    } else {
      if (input.contact?.clinicName) patch.clinicName = input.contact.clinicName;
      if (input.contact?.contactName) patch.contactName = input.contact.contactName;
      if (input.contact?.contactEmail) patch.contactEmail = input.contact.contactEmail;
      if (input.contact?.contactPhone) patch.contactPhone = input.contact.contactPhone;
      if (input.contact?.trialEndsAt) patch.trialEndsAt = input.contact.trialEndsAt.toISOString();
      if (input.contact?.plan) patch.plan = input.contact.plan;
      if (!data.signedUpAt && signedUpAtIso) patch.signedUpAt = signedUpAtIso;
      if (!data.attribution && input.attribution) patch.attribution = attribution;
    }

    tx.set(ref, patch, { merge: true });

    if (applied.wrote) {
      const eventRef = ref.collection("events").doc();
      const safeMeta: Record<string, string | number | boolean | null> = {};
      if (input.meta) {
        for (const [key, value] of Object.entries(input.meta)) {
          if (value === undefined) continue;
          // Never persist free-text patient content; only short scalars.
          if (typeof value === "string") safeMeta[key] = value.slice(0, 200);
          else if (typeof value === "number" || typeof value === "boolean" || value === null) {
            safeMeta[key] = value;
          }
        }
      }
      tx.set(eventRef, {
        type: input.milestone,
        at: Timestamp.fromDate(at),
        meta: safeMeta,
      });
    }

    return { wrote: applied.wrote, activated };
  });
}

export async function updateLifecycleAdminFields(
  db: Firestore,
  clinicId: string,
  fields: { csmNote?: string; nextAction?: string }
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof fields.csmNote === "string") patch.csmNote = fields.csmNote.slice(0, 2000);
  if (typeof fields.nextAction === "string") patch.nextAction = fields.nextAction.slice(0, 500);
  await db.collection(LIFECYCLE_COLLECTION).doc(clinicId).set(patch, { merge: true });
}

export async function markLifecycleEmailSent(
  db: Firestore,
  clinicId: string,
  key: string,
  at = new Date()
): Promise<boolean> {
  const ref = db.collection(LIFECYCLE_COLLECTION).doc(clinicId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const sent = (data.emailsSent && typeof data.emailsSent === "object" ? data.emailsSent : {}) as Record<string, string>;
    if (sent[key]) return false;
    tx.set(
      ref,
      {
        emailsSent: { ...sent, [key]: at.toISOString() },
        lastActivityAt: at.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(ref.collection("events").doc(), {
      type: `email_${key}`,
      at: Timestamp.fromDate(at),
      meta: {},
    });
    return true;
  });
}

export async function setLifecycleEmailOptOut(db: Firestore, clinicId: string): Promise<void> {
  await db.collection(LIFECYCLE_COLLECTION).doc(clinicId).set(
    {
      lifecycleEmailOptOut: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
