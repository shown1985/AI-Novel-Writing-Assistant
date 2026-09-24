import type { PrismaClient } from "@prisma/client";
import { PrismaWorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";
import type { WorldStructureBackfillStore } from "./infrastructure/prismaWorldStructureBackfillStore";

export {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  WORLD_STRUCTURE_BACKFILL_STATUSES,
  WorldStructureBackfillStoreError,
} from "./domain/worldStructureBackfillContracts";
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

export function createWorldStructureBackfillStore(client: PrismaClient): WorldStructureBackfillStore {
  return new PrismaWorldStructureBackfillStore(client);
}
