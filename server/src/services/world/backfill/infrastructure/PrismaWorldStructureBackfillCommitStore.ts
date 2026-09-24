import type { Prisma, PrismaClient } from "@prisma/client";
import {
  WorldStructureBackfillStoreError,
  parseWorldStructureBackfillJsonObject,
  type WorldStructureBackfillCommitOutcome,
  type WorldStructureBackfillCommitReadOutcome,
  type WorldStructureBackfillCommitReceiptRecord,
  type WorldStructureBackfillOperationRecord,
  type WorldStructureBackfillResultRecord,
} from "../domain/worldStructureBackfillContracts";
import type {
  PrepareWorldStructureBackfillCommit,
  WorldStructureBackfillCommitContext,
  WorldStructureBackfillCommitPersistencePort,
  WorldStructureBackfillCommitWorldSnapshot,
} from "../domain/worldStructureBackfillCommit";

type WorldRow = Prisma.WorldGetPayload<{}>;
type OperationRow = Prisma.WorldStructureBackfillOperationGetPayload<{
  include: { result: true; commitReceipt: true };
}>;

function operationNotFound(): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError(
    "OPERATION_NOT_FOUND",
    "No backfill operation belongs to this world and operationId.",
  );
}

class ConcurrentCommitResolutionRequired extends Error {}

function concurrentCommitResolutionRequired(): ConcurrentCommitResolutionRequired {
  return new ConcurrentCommitResolutionRequired("Resolve the same operation after the transaction exits.");
}

function unknownCommitResult(): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError(
    "COMMIT_RESULT_UNKNOWN",
    "The commit outcome is not confirmed by a durable backfill receipt; read this operation before retrying.",
  );
}

function toOperationRecord(row: OperationRow): WorldStructureBackfillOperationRecord {
  return {
    id: row.id,
    worldId: row.worldId,
    operationId: row.operationId,
    requestHash: row.requestHash,
    baseContentRevision: row.baseContentRevision,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    provider: row.provider,
    model: row.model,
    generationPolicyVersion: row.generationPolicyVersion,
    sourceDigest: row.sourceDigest,
    status: row.status as WorldStructureBackfillOperationRecord["status"],
    leaseExpiresAt: row.leaseExpiresAt,
    modelRequestId: row.modelRequestId,
    modelAttemptId: row.modelAttemptId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResultRecord(row: OperationRow["result"]): WorldStructureBackfillResultRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    operationRecordId: row.operationRecordId,
    normalizedStructure: parseWorldStructureBackfillJsonObject(
      row.normalizedStructureJson,
      "normalizedStructure",
    ),
    bindingSupport: parseWorldStructureBackfillJsonObject(row.bindingSupportJson, "bindingSupport"),
    baseContentRevision: row.baseContentRevision,
    requestHash: row.requestHash,
    generationPolicyVersion: row.generationPolicyVersion,
    digest: row.digest,
    modelRequestId: row.modelRequestId,
    modelAttemptId: row.modelAttemptId,
    createdAt: row.createdAt,
  };
}

function toCommitReceiptRecord(
  row: OperationRow["commitReceipt"],
): WorldStructureBackfillCommitReceiptRecord | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    operationRecordId: row.operationRecordId,
    worldId: row.worldId,
    operationId: row.operationId,
    resultDigest: row.resultDigest,
    baseContentRevision: row.baseContentRevision,
    committedRevision: row.committedRevision,
    beforeDigest: row.beforeDigest,
    afterDigest: row.afterDigest,
    committedAt: row.committedAt,
  };
}

function toCommitReadOutcome(row: OperationRow): WorldStructureBackfillCommitReadOutcome {
  return {
    operation: toOperationRecord(row),
    result: toResultRecord(row.result),
    receipt: toCommitReceiptRecord(row.commitReceipt),
  };
}

function toCommittedOutcome(
  kind: "committed" | "replayed",
  outcome: WorldStructureBackfillCommitReadOutcome,
): WorldStructureBackfillCommitOutcome {
  if (!outcome.result || !outcome.receipt) {
    throw new WorldStructureBackfillStoreError(
      "COMMIT_RECEIPT_INTEGRITY",
      "A committed operation must have its persisted result and receipt.",
    );
  }
  return { kind, outcome: { ...outcome, result: outcome.result, receipt: outcome.receipt } };
}

function toConflictOutcome(
  outcome: WorldStructureBackfillCommitReadOutcome,
): WorldStructureBackfillCommitOutcome {
  if (!outcome.result || outcome.receipt) {
    throw new WorldStructureBackfillStoreError(
      outcome.receipt ? "COMMIT_RECEIPT_INTEGRITY" : "RESULT_INTEGRITY_MISMATCH",
      "A retained conflict must have its persisted result and no commit receipt.",
    );
  }
  return { kind: "conflict_result_retained", outcome: { ...outcome, result: outcome.result, receipt: null } };
}

function toWorldSnapshot(row: WorldRow): WorldStructureBackfillCommitWorldSnapshot {
  const {
    id,
    version,
    contentRevision,
    createdAt,
    updatedAt,
    ...candidate
  } = row;
  return {
    ...candidate,
    id,
    version,
    contentRevision,
    createdAt,
    updatedAt,
  };
}

function assertNonBlank(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorldStructureBackfillStoreError("INVALID_INPUT", `${fieldName} must be a non-empty string.`);
  }
}

function isExpectedDomainError(error: unknown): boolean {
  return error instanceof WorldStructureBackfillStoreError;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class PrismaWorldStructureBackfillCommitStore implements WorldStructureBackfillCommitPersistencePort {
  constructor(private readonly client: PrismaClient) {}

  private async readOperation(
    client: PrismaClient | Prisma.TransactionClient,
    worldId: string,
    operationId: string,
  ): Promise<OperationRow | null> {
    return await client.worldStructureBackfillOperation.findUnique({
      where: { worldId_operationId: { worldId, operationId } },
      include: { result: true, commitReceipt: true },
    }) as OperationRow | null;
  }

  async readCommitOutcome(
    worldId: string,
    operationId: string,
  ): Promise<WorldStructureBackfillCommitReadOutcome | null> {
    assertNonBlank(worldId, "worldId");
    assertNonBlank(operationId, "operationId");
    const row = await this.readOperation(this.client, worldId, operationId);
    if (!row || row.worldId !== worldId || row.operationId !== operationId) {
      return null;
    }
    return toCommitReadOutcome(row);
  }

  async commitPersistedResult(
    worldId: string,
    operationId: string,
    prepare: PrepareWorldStructureBackfillCommit,
  ): Promise<WorldStructureBackfillCommitOutcome> {
    assertNonBlank(worldId, "worldId");
    assertNonBlank(operationId, "operationId");

    let preparationFailed = false;
    try {
      return await this.client.$transaction(async (transaction) => {
        const row = await this.readOperation(transaction, worldId, operationId);
        if (!row || row.worldId !== worldId || row.operationId !== operationId) {
          throw operationNotFound();
        }
        const existingOutcome = toCommitReadOutcome(row);
        if (row.status === "committed") {
          return toCommittedOutcome("replayed", existingOutcome);
        }
        if (row.status === "conflict_result_retained") {
          return toConflictOutcome(existingOutcome);
        }
        if (row.status !== "model_succeeded_pending_commit") {
          throw new WorldStructureBackfillStoreError(
            "INVALID_STATE",
            "Only a persisted result in model_succeeded_pending_commit can be committed.",
          );
        }
        if (!row.result) {
          throw new WorldStructureBackfillStoreError(
            "RESULT_NOT_FOUND",
            "The operation has no persisted structure result to commit.",
          );
        }

        const world = await transaction.world.findUnique({
          where: { id: worldId },
        });
        if (!world) {
          throw new WorldStructureBackfillStoreError("WORLD_NOT_FOUND", "The backfill world no longer exists.");
        }

        let prepared;
        try {
          const context: WorldStructureBackfillCommitContext = {
            operation: toOperationRecord(row),
            result: toResultRecord(row.result),
            world: toWorldSnapshot(world),
          };
          prepared = prepare(context);
        } catch (error) {
          preparationFailed = true;
          throw error;
        }

        const updated = await transaction.world.updateMany({
          where: { id: worldId, contentRevision: row.baseContentRevision },
          data: {
            ...prepared.projection,
            contentRevision: { increment: 1 },
          } as Prisma.WorldUpdateManyMutationInput,
        });

        if (updated.count !== 1) {
          // Resolve a same-operation winner's receipt before interpreting the CAS miss as conflict.
          const racedOperation = await this.readOperation(transaction, worldId, operationId);
          if (racedOperation?.status === "committed") {
            return toCommittedOutcome("replayed", toCommitReadOutcome(racedOperation));
          }
          if (racedOperation?.status === "conflict_result_retained") {
            return toConflictOutcome(toCommitReadOutcome(racedOperation));
          }

          const latestWorld = await transaction.world.findUnique({
            where: { id: worldId },
            select: { contentRevision: true },
          });
          if (!latestWorld) {
            throw new WorldStructureBackfillStoreError("WORLD_NOT_FOUND", "The backfill world no longer exists.");
          }
          if (latestWorld.contentRevision === row.baseContentRevision) {
            throw concurrentCommitResolutionRequired();
          }

          const conflictUpdate = await transaction.worldStructureBackfillOperation.updateMany({
            where: { id: row.id, status: "model_succeeded_pending_commit" },
            data: { status: "conflict_result_retained" },
          });
          if (conflictUpdate.count !== 1) {
            const winner = await this.readOperation(transaction, worldId, operationId);
            if (winner?.status === "committed") {
              return toCommittedOutcome("replayed", toCommitReadOutcome(winner));
            }
            if (winner?.status === "conflict_result_retained") {
              return toConflictOutcome(toCommitReadOutcome(winner));
            }
            throw concurrentCommitResolutionRequired();
          }
          const retained = await this.readOperation(transaction, worldId, operationId);
          if (!retained) {
            throw operationNotFound();
          }
          return toConflictOutcome(toCommitReadOutcome(retained));
        }

        await transaction.worldStructureBackfillCommitReceipt.create({
          data: {
            operationRecordId: row.id,
            worldId,
            operationId,
            resultDigest: row.result.digest,
            baseContentRevision: row.baseContentRevision,
            committedRevision: row.baseContentRevision + 1,
            beforeDigest: prepared.beforeDigest,
            afterDigest: prepared.afterDigest,
          },
        });
        const committed = await transaction.worldStructureBackfillOperation.updateMany({
          where: { id: row.id, status: "model_succeeded_pending_commit" },
          data: { status: "committed" },
        });
        if (committed.count !== 1) {
          throw concurrentCommitResolutionRequired();
        }
        const saved = await this.readOperation(transaction, worldId, operationId);
        if (!saved) {
          throw operationNotFound();
        }
        return toCommittedOutcome("committed", toCommitReadOutcome(saved));
      });
    } catch (error) {
      if (preparationFailed || isExpectedDomainError(error)) {
        throw error;
      }
      // SQLite may reject a stale concurrent writer, and a transport can fail after commit.
      // A receipt is the only durable evidence that lets a retry report success.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const resolved = await this.readCommitOutcome(worldId, operationId);
          if (resolved?.operation.status === "committed" && resolved.receipt && resolved.result) {
            return toCommittedOutcome("replayed", resolved);
          }
          if (
            resolved?.operation.status === "conflict_result_retained"
            && !resolved.receipt
            && resolved.result
          ) {
            return toConflictOutcome(resolved);
          }
        } catch {
          // Retry the read while a competing transaction is finishing.
        }
        if (attempt < 7) {
          await delay(25 * (attempt + 1));
        }
      }

      if (isUniqueConstraintError(error)) {
        throw unknownCommitResult();
      }
      throw unknownCommitResult();
    }
  }
}
