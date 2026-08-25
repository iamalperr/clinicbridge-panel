/**
 * Deterministic migration of FeelinHealthy curated rules → agencies/{id}/matchingRules.
 *
 * Idempotent: skips existing docs unless force=true.
 * Does not overwrite agency_ui modifications unless force=true.
 */

import {
  MATCHING_RULES_MIGRATION_VERSION,
  MATCHING_RULE_SOURCE_LEGACY,
  MATCHING_RULE_SOURCE_UI,
  assertNoIntermedInRules,
  buildFeelinHealthyMigrationRules,
  type AgencyMatchingRule,
} from "./agencyMatchingRules";

export interface MatchingRulesMigrationMeta {
  migrationVersion: string;
  migratedAt: string;
  ruleCount: number;
  source: string;
  agencyId: string;
}

export interface MigrateMatchingRulesResult {
  agencyId: string;
  migrationVersion: string;
  seeded: number;
  skippedExisting: number;
  skippedAgencyModified: number;
  overwritten: number;
  totalSeedRules: number;
  dryRun: boolean;
  metaWritten: boolean;
  ruleIds: string[];
}

type AdminDbLike = {
  collection: (name: string) => {
    doc: (id: string) => {
      collection: (name: string) => {
        doc: (id: string) => {
          get: () => Promise<{ exists: boolean; data: () => any }>;
          set: (data: any, opts?: { merge?: boolean }) => Promise<void>;
        };
      };
      get: () => Promise<{ exists: boolean; data: () => any }>;
      set: (data: any, opts?: { merge?: boolean }) => Promise<void>;
    };
  };
};

export async function migrateFeelinHealthyMatchingRules(opts: {
  adminDb: AdminDbLike;
  agencyId?: string;
  dryRun?: boolean;
  force?: boolean;
  nowIso?: string;
}): Promise<MigrateMatchingRulesResult> {
  const agencyId = opts.agencyId || "feelinhealthy";
  const dryRun = opts.dryRun !== false;
  const force = opts.force === true;
  const nowIso = opts.nowIso || new Date().toISOString();

  const seedRules = buildFeelinHealthyMigrationRules(agencyId);
  assertNoIntermedInRules(seedRules);

  const metaRef = opts.adminDb
    .collection("agencies")
    .doc(agencyId)
    .collection("config")
    .doc("matchingRulesMeta");

  const metaSnap = await metaRef.get();
  const existingMeta = metaSnap.exists ? (metaSnap.data() as MatchingRulesMigrationMeta) : null;

  if (
    !force &&
    existingMeta?.migrationVersion === MATCHING_RULES_MIGRATION_VERSION
  ) {
    // Still fill any missing rule docs (partial prior run).
  }

  let seeded = 0;
  let skippedExisting = 0;
  let skippedAgencyModified = 0;
  let overwritten = 0;
  const ruleIds: string[] = [];

  for (const rule of seedRules) {
    ruleIds.push(rule.id);
    const ref = opts.adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("matchingRules")
      .doc(rule.id);
    const snap = await ref.get();

    if (snap.exists) {
      const data = snap.data() as AgencyMatchingRule;
      const isAgencyModified =
        data.source === MATCHING_RULE_SOURCE_UI ||
        Boolean(data.updatedBy);

      if (!force) {
        if (isAgencyModified) {
          skippedAgencyModified++;
          continue;
        }
        skippedExisting++;
        continue;
      }

      // force: overwrite
      if (!dryRun) {
        await ref.set(
          {
            ...rule,
            updatedAt: nowIso,
            createdAt: data.createdAt || nowIso,
          },
          { merge: true }
        );
      }
      overwritten++;
      continue;
    }

    if (!dryRun) {
      await ref.set({
        ...rule,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    seeded++;
  }

  const meta: MatchingRulesMigrationMeta = {
    migrationVersion: MATCHING_RULES_MIGRATION_VERSION,
    migratedAt: nowIso,
    ruleCount: seedRules.length,
    source: MATCHING_RULE_SOURCE_LEGACY,
    agencyId,
  };

  let metaWritten = false;
  if (!dryRun) {
    await metaRef.set(meta, { merge: true });
    metaWritten = true;
  }

  return {
    agencyId,
    migrationVersion: MATCHING_RULES_MIGRATION_VERSION,
    seeded,
    skippedExisting,
    skippedAgencyModified,
    overwritten,
    totalSeedRules: seedRules.length,
    dryRun,
    metaWritten,
    ruleIds,
  };
}
