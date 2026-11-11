import type { Firestore } from "firebase-admin/firestore";
import { recordLifecycleMilestone } from "@/lib/lifecycle/recordMilestone";
import type { LifecycleEventMeta, LifecycleMilestone, SignupAttribution } from "@/lib/lifecycle/types";

/** Fire-and-forget safe wrapper — never throws into product paths. */
export async function safeRecordLifecycleMilestone(
  db: Firestore | null | undefined,
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
): Promise<void> {
  if (!db || !input.clinicId) return;
  try {
    await recordLifecycleMilestone(db, input);
  } catch (error) {
    console.warn(
      "[lifecycle]",
      input.milestone,
      input.clinicId,
      error instanceof Error ? error.message : "unknown"
    );
  }
}
