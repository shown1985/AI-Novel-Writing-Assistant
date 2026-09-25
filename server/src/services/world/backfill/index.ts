import type { PrismaClient } from "@prisma/client";
import {
  WorldStructureBackfillCommitService,
  WorldStructureBackfillGenerationService,
  WorldStructureBackfillRunService,
  type WorldStructureBackfillRunCommitPort,
  type WorldStructureBackfillRunGenerationPort,
} from "./application";
import { PrismaWorldStructureBackfillCommitStore } from "./infrastructure/PrismaWorldStructureBackfillCommitStore";
import { PrismaWorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";
import type { WorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";

export {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  WORLD_STRUCTURE_BACKFILL_FAILURE_CATEGORIES,
  WORLD_STRUCTURE_BACKFILL_STATUSES,
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillCommitOutcome,
  type WorldStructureBackfillCommitReadOutcome,
  type WorldStructureBackfillCommitReceiptRecord,
  type WorldStructureBackfillFailureCategory,
} from "./domain/worldStructureBackfillContracts";
export type {
  PreparedWorldStructureBackfillCommit,
  PrepareWorldStructureBackfillCommit,
  WorldStructureBackfillCommitContext,
  WorldStructureBackfillCommitPersistencePort,
  WorldStructureBackfillCommitWorldSnapshot,
} from "./domain/worldStructureBackfillCommit";
export type {
  NormalizedWorldStructureBackfillRequest,
  WorldStructureBackfillJsonObject,
  WorldStructureBackfillJsonValue,
  WorldStructureBackfillOperationRecord,
  WorldStructureBackfillReadResult,
  WorldStructureBackfillRequestInput,
  WorldStructureBackfillResultRecord,
  WorldStructureBackfillStatus,
  WorldStructureBackfillStoreErrorCode,
} from "./domain/worldStructureBackfillContracts";
export type {
  MarkWorldStructureBackfillUnknownInput,
  PersistWorldStructureBackfillResultInput,
  StartWorldStructureBackfillModelInput,
  StartWorldStructureBackfillModelResult,
  WorldStructureBackfillStore,
} from "./infrastructure/prismaWorldStructureBackfillStore";
export {
  createWorldStructureBackfillSourceDigest,
  DEFAULT_WORLD_STRUCTURE_BACKFILL_LEASE_MS,
  resolveWorldStructureBackfillFailureStatus,
  WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
  WORLD_STRUCTURE_BACKFILL_TERMINAL_FAILURE_CATEGORIES,
} from "./domain/worldStructureBackfillGeneration";
export type {
  GenerateWorldStructureBackfillResultInput,
  WorldStructureBackfillGenerationOutcome,
  WorldStructureBackfillGenerationOutcomeKind,
  RunWorldStructureBackfillInput,
  WorldStructureBackfillRunCommitPort,
  WorldStructureBackfillRunGenerationPort,
  WorldStructureBackfillRunOperationPort,
  WorldStructureBackfillRunOutcome,
  WorldStructureBackfillRunOutcomeKind,
} from "./application";

export {
  WorldStructureBackfillCommitService,
  WorldStructureBackfillGenerationService,
  WorldStructureBackfillRunService,
} from "./application";

export function createWorldStructureBackfillCommitService(client: PrismaClient): WorldStructureBackfillCommitService {
  return new WorldStructureBackfillCommitService(new PrismaWorldStructureBackfillCommitStore(client));
}

export function createWorldStructureBackfillStore(client: PrismaClient): WorldStructureBackfillStore {
  return new PrismaWorldStructureBackfillStore(client);
}

export function createWorldStructureBackfillGenerationService(
  client: PrismaClient,
  options: {
    store?: WorldStructureBackfillStore;
    clock?: () => Date;
    leaseDurationMs?: number;
  } = {},
): WorldStructureBackfillGenerationService {
  return new WorldStructureBackfillGenerationService({
    client,
    store: options.store ?? new PrismaWorldStructureBackfillStore(client),
    clock: options.clock,
    leaseDurationMs: options.leaseDurationMs,
  });
}

/**
 * Default assembly of the run facade. Generation and commit are injectable so
 * callers and tests can substitute either port without touching the stores.
 */
export function createWorldStructureBackfillRunService(
  client: PrismaClient,
  options: {
    generation?: WorldStructureBackfillRunGenerationPort;
    commit?: WorldStructureBackfillRunCommitPort;
    store?: WorldStructureBackfillStore;
    clock?: () => Date;
    leaseDurationMs?: number;
  } = {},
): WorldStructureBackfillRunService {
  const store = options.store ?? new PrismaWorldStructureBackfillStore(client);
  return new WorldStructureBackfillRunService({
    operations: store,
    generation: options.generation ?? createWorldStructureBackfillGenerationService(client, {
      store,
      clock: options.clock,
      leaseDurationMs: options.leaseDurationMs,
    }),
    commit: options.commit ?? createWorldStructureBackfillCommitService(client),
  });
}
