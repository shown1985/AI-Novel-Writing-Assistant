import type { PrismaClient } from "@prisma/client";
import { WorldStructureBackfillCommitService } from "./application";
import { PrismaWorldStructureBackfillCommitStore } from "./infrastructure/PrismaWorldStructureBackfillCommitStore";
import { PrismaWorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";
import type { WorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";

export {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  WORLD_STRUCTURE_BACKFILL_STATUSES,
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillCommitOutcome,
  type WorldStructureBackfillCommitReadOutcome,
  type WorldStructureBackfillCommitReceiptRecord,
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
  WorldStructureBackfillStore,
} from "./infrastructure/prismaWorldStructureBackfillStore";

export { WorldStructureBackfillCommitService } from "./application";

export function createWorldStructureBackfillCommitService(client: PrismaClient): WorldStructureBackfillCommitService {
  return new WorldStructureBackfillCommitService(new PrismaWorldStructureBackfillCommitStore(client));
}

export function createWorldStructureBackfillStore(client: PrismaClient): WorldStructureBackfillStore {
  return new PrismaWorldStructureBackfillStore(client);
}
