import type { WorldMaintenanceCandidateAggregate } from "@ai-novel/shared/types/world";
import type {
  WorldStructureBackfillCommitOutcome,
  WorldStructureBackfillCommitReadOutcome,
  WorldStructureBackfillOperationRecord,
  WorldStructureBackfillResultRecord,
} from "./worldStructureBackfillContracts";

export interface WorldStructureBackfillCommitWorldSnapshot extends WorldMaintenanceCandidateAggregate {
  id: string;
  version: number;
  contentRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorldStructureBackfillCommitContext {
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
  world: WorldStructureBackfillCommitWorldSnapshot;
}

export interface PreparedWorldStructureBackfillCommit {
  projection: Record<string, unknown>;
  beforeDigest: string;
  afterDigest: string;
}

export type PrepareWorldStructureBackfillCommit = (
  context: WorldStructureBackfillCommitContext,
) => PreparedWorldStructureBackfillCommit;

export interface WorldStructureBackfillCommitPersistencePort {
  commitPersistedResult(
    worldId: string,
    operationId: string,
    prepare: PrepareWorldStructureBackfillCommit,
  ): Promise<WorldStructureBackfillCommitOutcome>;
  readCommitOutcome(
    worldId: string,
    operationId: string,
  ): Promise<WorldStructureBackfillCommitReadOutcome | null>;
}
