import type { WorldMaintenanceCandidateAggregate } from "@ai-novel/shared/types/world";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
} from "../../worldStructure";
import {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillCommitOutcome,
  type WorldStructureBackfillCommitReadOutcome,
  type WorldStructureBackfillOperationRecord,
  type WorldStructureBackfillResultRecord,
} from "../domain/worldStructureBackfillContracts";
import {
  hashWorldMaintenanceValue,
  validateWorldMaintenanceCandidate,
} from "../../maintenance";
import type {
  PreparedWorldStructureBackfillCommit,
  WorldStructureBackfillCommitContext,
  WorldStructureBackfillCommitPersistencePort,
} from "../domain/worldStructureBackfillCommit";

function integrityError(message: string): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError("RESULT_INTEGRITY_MISMATCH", message);
}

function commitReceiptIntegrityError(message: string): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError("COMMIT_RECEIPT_INTEGRITY", message);
}

function assertStoredResultIntegrity(
  operation: WorldStructureBackfillOperationRecord,
  result: WorldStructureBackfillResultRecord,
): void {
  const requestHash = createWorldStructureBackfillRequestHash({
    worldId: operation.worldId,
    operationId: operation.operationId,
    baseContentRevision: operation.baseContentRevision,
    promptId: operation.promptId,
    promptVersion: operation.promptVersion,
    provider: operation.provider,
    model: operation.model,
    generationPolicyVersion: operation.generationPolicyVersion,
    sourceDigest: operation.sourceDigest,
  });
  if (requestHash !== operation.requestHash) {
    throw integrityError("The operation request hash does not match its frozen request fields.");
  }
  if (
    result.operationRecordId !== operation.id
    || result.requestHash !== operation.requestHash
    || result.baseContentRevision !== operation.baseContentRevision
    || result.generationPolicyVersion !== operation.generationPolicyVersion
    || result.modelRequestId !== operation.modelRequestId
    || result.modelAttemptId !== operation.modelAttemptId
  ) {
    throw integrityError("The persisted result does not match its operation's frozen commit facts.");
  }
  const digest = createWorldStructureBackfillResultDigest(
    result.normalizedStructure,
    result.bindingSupport,
  ).digest;
  if (digest !== result.digest) {
    throw integrityError("The persisted result digest does not match its structure and binding support.");
  }
}

function assertCommitReadOutcomeIntegrity(
  outcome: WorldStructureBackfillCommitReadOutcome,
): void {
  const { operation, result, receipt } = outcome;
  if (result) {
    assertStoredResultIntegrity(operation, result);
  }

  if (operation.status === "committed") {
    if (!result || !receipt) {
      throw commitReceiptIntegrityError("A committed operation must have its persisted result and receipt.");
    }
    if (
      receipt.operationRecordId !== operation.id
      || receipt.worldId !== operation.worldId
      || receipt.operationId !== operation.operationId
      || receipt.resultDigest !== result.digest
      || receipt.baseContentRevision !== operation.baseContentRevision
      || receipt.committedRevision !== operation.baseContentRevision + 1
    ) {
      throw commitReceiptIntegrityError("The backfill commit receipt does not match its operation and result.");
    }
    return;
  }

  if (receipt) {
    throw commitReceiptIntegrityError("A backfill receipt cannot exist before the operation is committed.");
  }
  if (operation.status === "conflict_result_retained" && !result) {
    throw integrityError("A retained conflict must keep its persisted result.");
  }
}

function contentWithoutRevision(
  world: WorldStructureBackfillCommitContext["world"],
): Omit<WorldStructureBackfillCommitContext["world"], "id" | "contentRevision" | "createdAt" | "updatedAt"> {
  const {
    id: _id,
    contentRevision: _contentRevision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...content
  } = world;
  return content;
}

function prepareCommit(context: WorldStructureBackfillCommitContext): PreparedWorldStructureBackfillCommit {
  const { operation, result, world } = context;
  if (!result) {
    throw new WorldStructureBackfillStoreError(
      "RESULT_NOT_FOUND",
      "The operation has no persisted structure result to commit.",
    );
  }
  if (world.id !== operation.worldId) {
    throw integrityError("The transaction world does not match the backfill operation.");
  }
  assertStoredResultIntegrity(operation, result);

  const rawCandidate = {
    ...world,
    structureJson: JSON.stringify(result.normalizedStructure),
    bindingSupportJson: JSON.stringify(result.bindingSupport),
  } as WorldMaintenanceCandidateAggregate;

  // Validate the exact persisted source before the normalizers can trim invalid references.
  const rawStructure = validateWorldMaintenanceCandidate(rawCandidate);
  const structure = normalizeWorldStructuredData(rawStructure);
  const defaultBindingSupport = buildWorldBindingSupport(structure);
  const bindingSupport = normalizeWorldBindingSupport(result.bindingSupport, defaultBindingSupport);
  const projection = applyStructuredWorldToLegacyFields(structure, world, bindingSupport);

  const beforeContent = contentWithoutRevision(world);
  const afterContent = { ...beforeContent, ...projection };
  return {
    projection,
    beforeDigest: hashWorldMaintenanceValue(beforeContent),
    afterDigest: hashWorldMaintenanceValue(afterContent),
  };
}

export class WorldStructureBackfillCommitService {
  constructor(private readonly persistence: WorldStructureBackfillCommitPersistencePort) {}

  async commitPersistedResult(worldId: string, operationId: string): Promise<WorldStructureBackfillCommitOutcome> {
    const outcome = await this.persistence.commitPersistedResult(worldId, operationId, prepareCommit);
    assertCommitReadOutcomeIntegrity(outcome.outcome);
    return outcome;
  }

  async readCommitOutcome(
    worldId: string,
    operationId: string,
  ): Promise<WorldStructureBackfillCommitReadOutcome | null> {
    const outcome = await this.persistence.readCommitOutcome(worldId, operationId);
    if (outcome) {
      assertCommitReadOutcomeIntegrity(outcome);
    }
    return outcome;
  }
}
