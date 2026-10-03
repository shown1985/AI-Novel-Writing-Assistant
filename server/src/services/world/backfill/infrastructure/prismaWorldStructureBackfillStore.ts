import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  normalizeWorldStructureBackfillFailureCategory,
  normalizeWorldStructureBackfillRequest,
  parseWorldStructureBackfillJsonObject,
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillFailureCategory,
  type WorldStructureBackfillJsonObject,
  type WorldStructureBackfillOperationRecord,
  type WorldStructureBackfillReadResult,
  type WorldStructureBackfillRequestInput,
  type WorldStructureBackfillResultRecord,
} from "../domain/worldStructureBackfillContracts";
import { WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES } from "../domain/worldStructureBackfillGeneration";

interface OperationRow {
  id: string;
  worldId: string;
  operationId: string;
  requestHash: string;
  baseContentRevision: number;
  promptId: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  generationPolicyVersion: string;
  sourceDigest: string;
  status: string;
  leaseExpiresAt: Date | null;
  modelRequestId: string | null;
  modelAttemptId: string | null;
  failureCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
  result?: ResultRow | null;
}

interface ResultRow {
  id: string;
  operationRecordId: string;
  normalizedStructureJson: string;
  bindingSupportJson: string;
  baseContentRevision: number;
  requestHash: string;
  generationPolicyVersion: string;
  digest: string;
  modelRequestId: string | null;
  modelAttemptId: string | null;
  createdAt: Date;
}

export interface StartWorldStructureBackfillModelInput {
  worldId: string;
  operationId: string;
  leaseExpiresAt: Date;
  modelRequestId?: string | null;
  modelAttemptId?: string | null;
  /**
   * Opt-in loser behavior for the generation orchestrator. When set to
   * `return_current`, a caller that does not win the call right receives the
   * current operation/result instead of a reference comparison error.
   */
  onNotAcquired?: "return_current";
}

export interface StartWorldStructureBackfillModelResult {
  acquired: boolean;
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
  /** Present only when `onNotAcquired: "return_current"` was set and the call right was not acquired. */
  current?: WorldStructureBackfillReadResult;
}

export interface PersistWorldStructureBackfillResultInput extends WorldStructureBackfillRequestInput {
  normalizedStructure: WorldStructureBackfillJsonObject;
  bindingSupport: WorldStructureBackfillJsonObject;
  modelRequestId?: string | null;
  modelAttemptId?: string | null;
}

export interface MarkWorldStructureBackfillUnknownInput {
  worldId: string;
  operationId: string;
  reason: "unknown_result" | "lease_expired";
  now?: Date;
  /**
   * Allowlisted category written in the same conditional update as the
   * transition. Omitted means null; the lease_expired reason always writes
   * `lease_expired`.
   */
  failureCategory?: WorldStructureBackfillFailureCategory | null;
}

export interface WorldStructureBackfillStore {
  claim(input: WorldStructureBackfillRequestInput): Promise<WorldStructureBackfillReadResult>;
  read(worldId: string, operationId: string): Promise<WorldStructureBackfillReadResult | null>;
  startModel(input: StartWorldStructureBackfillModelInput): Promise<StartWorldStructureBackfillModelResult>;
  persistResult(input: PersistWorldStructureBackfillResultInput): Promise<WorldStructureBackfillReadResult>;
  markUnknown(input: MarkWorldStructureBackfillUnknownInput): Promise<{
    changed: boolean;
    state: WorldStructureBackfillReadResult | null;
  }>;
  markFailed(
    worldId: string,
    operationId: string,
    failureCategory?: WorldStructureBackfillFailureCategory | null,
  ): Promise<{
    changed: boolean;
    state: WorldStructureBackfillReadResult | null;
  }>;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code;
}

function invalidInput(message: string): never {
  throw new WorldStructureBackfillStoreError("INVALID_INPUT", message);
}

function normalizeModelReference(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidInput(`${fieldName} must be a non-empty string or null.`);
  }
  return value;
}

function validateLeaseDate(value: unknown, fieldName: string): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalidInput(`${fieldName} must be a valid Date.`);
  }
}

function toResultRecord(row: ResultRow | null | undefined): WorldStructureBackfillResultRecord | null {
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
    failureCategory: row.failureCategory as WorldStructureBackfillFailureCategory | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReadResult(row: OperationRow): WorldStructureBackfillReadResult {
  return {
    operation: toOperationRecord(row),
    result: toResultRecord(row.result),
  };
}

function reusedOperation(): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError(
    "OPERATION_ID_REUSED",
    "This operationId is already bound to a different frozen request.",
  );
}

function operationNotFound(): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError(
    "OPERATION_NOT_FOUND",
    "No backfill operation belongs to this world and operationId.",
  );
}

function assertRequestMatches(row: OperationRow, input: WorldStructureBackfillRequestInput): string {
  const requestHash = createWorldStructureBackfillRequestHash(input);
  if (row.requestHash !== requestHash) {
    throw reusedOperation();
  }
  if (
    row.baseContentRevision !== input.baseContentRevision
    || row.generationPolicyVersion !== input.generationPolicyVersion
  ) {
    throw reusedOperation();
  }
  return requestHash;
}

function assertModelReferencesMatch(
  row: OperationRow,
  modelRequestId: string | null,
  modelAttemptId: string | null,
): void {
  if (row.modelRequestId !== modelRequestId || row.modelAttemptId !== modelAttemptId) {
    throw new WorldStructureBackfillStoreError(
      "MODEL_REFERENCE_MISMATCH",
      "Model request and attempt references must match the operation claim.",
    );
  }
}

/**
 * Decide whether a persist call may bind the attempt id that only becomes
 * known after the provider call. Binding is allowed only when the stored
 * attempt id is still null, the request id matches, and a non-null attempt id
 * is supplied; every other difference remains an integrity violation.
 */
function resolvePersistModelReferences(
  row: OperationRow,
  modelRequestId: string | null,
  modelAttemptId: string | null,
): { bindAttemptId: boolean } {
  if (row.modelRequestId === modelRequestId && row.modelAttemptId === modelAttemptId) {
    return { bindAttemptId: false };
  }
  if (
    row.modelAttemptId === null
    && modelAttemptId !== null
    && row.modelRequestId === modelRequestId
    && !row.result
  ) {
    return { bindAttemptId: true };
  }
  throw new WorldStructureBackfillStoreError(
    "MODEL_REFERENCE_MISMATCH",
    "Model request and attempt references must match the operation claim.",
  );
}

function mapOperationWithResult(
  row: OperationRow | null,
  worldId: string,
  operationId: string,
): WorldStructureBackfillReadResult | null {
  if (!row || row.worldId !== worldId || row.operationId !== operationId) {
    return null;
  }
  return toReadResult(row);
}

export class PrismaWorldStructureBackfillStore implements WorldStructureBackfillStore {
  constructor(private readonly client: PrismaClient) {}

  private async readRow(worldId: string, operationId: string): Promise<OperationRow | null> {
    return await this.client.worldStructureBackfillOperation.findUnique({
      where: {
        worldId_operationId: { worldId, operationId },
      },
      include: { result: true },
    }) as OperationRow | null;
  }

  async claim(input: WorldStructureBackfillRequestInput): Promise<WorldStructureBackfillReadResult> {
    const normalizedRequest = normalizeWorldStructureBackfillRequest(input);
    const requestHash = createWorldStructureBackfillRequestHash(input);
    const world = await this.client.world.findUnique({
      where: { id: normalizedRequest.worldId },
      select: { id: true },
    });
    if (!world) {
      throw new WorldStructureBackfillStoreError(
        "WORLD_NOT_FOUND",
        "The world does not exist; no backfill claim was written.",
      );
    }

    try {
      const row = await this.client.worldStructureBackfillOperation.create({
        data: {
          ...normalizedRequest,
          operationId: input.operationId,
          requestHash,
          status: "model_not_called",
        },
        include: { result: true },
      });
      return toReadResult(row as OperationRow);
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) {
        throw error;
      }
      const existing = await this.readRow(normalizedRequest.worldId, input.operationId);
      if (!existing) {
        throw error;
      }
      if (existing.requestHash !== requestHash) {
        throw reusedOperation();
      }
      return toReadResult(existing);
    }
  }

  async read(worldId: string, operationId: string): Promise<WorldStructureBackfillReadResult | null> {
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
      invalidInput("worldId must be a non-empty string.");
    }
    if (typeof operationId !== "string" || operationId.trim().length === 0) {
      invalidInput("operationId must be a non-empty string.");
    }
    return mapOperationWithResult(await this.readRow(worldId, operationId), worldId, operationId);
  }

  async startModel(input: StartWorldStructureBackfillModelInput): Promise<StartWorldStructureBackfillModelResult> {
    if (typeof input.worldId !== "string" || input.worldId.trim().length === 0) {
      invalidInput("worldId must be a non-empty string.");
    }
    if (typeof input.operationId !== "string" || input.operationId.trim().length === 0) {
      invalidInput("operationId must be a non-empty string.");
    }
    validateLeaseDate(input.leaseExpiresAt, "leaseExpiresAt");
    if (input.onNotAcquired !== undefined && input.onNotAcquired !== "return_current") {
      invalidInput("onNotAcquired must be return_current when provided.");
    }
    const modelRequestId = normalizeModelReference(input.modelRequestId, "modelRequestId");
    const modelAttemptId = normalizeModelReference(input.modelAttemptId, "modelAttemptId");

    const update = await this.client.worldStructureBackfillOperation.updateMany({
      where: {
        worldId: input.worldId,
        operationId: input.operationId,
        status: "model_not_called",
      },
      data: {
        status: "model_in_flight",
        leaseExpiresAt: input.leaseExpiresAt,
        modelRequestId,
        modelAttemptId,
      },
    });

    const row = await this.readRow(input.worldId, input.operationId);
    if (!row) {
      throw operationNotFound();
    }
    if (update.count !== 1) {
      if (input.onNotAcquired === "return_current") {
        const current = toReadResult(row);
        return {
          acquired: false,
          operation: current.operation,
          result: current.result,
          current,
        };
      }
      assertModelReferencesMatch(row, modelRequestId, modelAttemptId);
    }
    return {
      acquired: update.count === 1,
      operation: toOperationRecord(row),
      result: toResultRecord(row.result),
    };
  }

  async persistResult(input: PersistWorldStructureBackfillResultInput): Promise<WorldStructureBackfillReadResult> {
    const normalizedRequest = normalizeWorldStructureBackfillRequest(input);
    const requestHash = createWorldStructureBackfillRequestHash(input);
    const modelRequestId = normalizeModelReference(input.modelRequestId, "modelRequestId");
    const modelAttemptId = normalizeModelReference(input.modelAttemptId, "modelAttemptId");
    const resultPayload = createWorldStructureBackfillResultDigest(
      input.normalizedStructure,
      input.bindingSupport,
    );

    const persistWithinTransaction = async (
      transaction: Prisma.TransactionClient,
    ): Promise<WorldStructureBackfillReadResult> => {
      const row = await transaction.worldStructureBackfillOperation.findUnique({
        where: {
          worldId_operationId: {
            worldId: normalizedRequest.worldId,
            operationId: input.operationId,
          },
        },
        include: { result: true },
      }) as OperationRow | null;
      if (!row) {
        throw operationNotFound();
      }
      assertRequestMatches(row, input);
      const { bindAttemptId } = resolvePersistModelReferences(row, modelRequestId, modelAttemptId);

      if (row.result) {
        if (row.result.digest !== resultPayload.digest) {
          throw new WorldStructureBackfillStoreError(
            "RESULT_DIGEST_CONFLICT",
            "A different normalized result is already stored for this operation.",
          );
        }
        return toReadResult(row);
      }
      if (row.status !== "model_in_flight") {
        throw new WorldStructureBackfillStoreError(
          "INVALID_STATE",
          "A result can only be stored for an operation whose model call is in flight.",
        );
      }

      await transaction.worldStructureBackfillResult.create({
        data: {
          operationRecordId: row.id,
          normalizedStructureJson: resultPayload.normalizedStructureJson,
          bindingSupportJson: resultPayload.bindingSupportJson,
          baseContentRevision: normalizedRequest.baseContentRevision,
          requestHash,
          generationPolicyVersion: normalizedRequest.generationPolicyVersion,
          digest: resultPayload.digest,
          modelRequestId,
          modelAttemptId,
        },
      });
      const updated = await transaction.worldStructureBackfillOperation.updateMany({
        where: {
          id: row.id,
          worldId: normalizedRequest.worldId,
          operationId: input.operationId,
          requestHash,
          baseContentRevision: normalizedRequest.baseContentRevision,
          status: "model_in_flight",
          modelRequestId: row.modelRequestId,
          modelAttemptId: row.modelAttemptId,
        },
        data: {
          status: "model_succeeded_pending_commit",
          leaseExpiresAt: null,
          ...(bindAttemptId ? { modelAttemptId } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new WorldStructureBackfillStoreError(
          "INVALID_STATE",
          "The operation stopped being model_in_flight before its result could be stored.",
        );
      }

      const saved = await transaction.worldStructureBackfillOperation.findUnique({
        where: {
          worldId_operationId: {
            worldId: normalizedRequest.worldId,
            operationId: input.operationId,
          },
        },
        include: { result: true },
      }) as OperationRow | null;
      if (!saved) {
        throw operationNotFound();
      }
      return toReadResult(saved);
    };

    try {
      return await this.client.$transaction(persistWithinTransaction);
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) {
        throw error;
      }
      const existing = await this.readRow(normalizedRequest.worldId, input.operationId);
      if (!existing) {
        throw error;
      }
      assertRequestMatches(existing, input);
      assertModelReferencesMatch(existing, modelRequestId, modelAttemptId);
      if (!existing.result) {
        throw error;
      }
      if (existing.result.digest !== resultPayload.digest) {
        throw new WorldStructureBackfillStoreError(
          "RESULT_DIGEST_CONFLICT",
          "A different normalized result is already stored for this operation.",
        );
      }
      return toReadResult(existing);
    }
  }

  async markFailed(
    worldId: string,
    operationId: string,
    failureCategory?: WorldStructureBackfillFailureCategory | null,
  ): Promise<{
    changed: boolean;
    state: WorldStructureBackfillReadResult | null;
  }> {
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
      invalidInput("worldId must be a non-empty string.");
    }
    if (typeof operationId !== "string" || operationId.trim().length === 0) {
      invalidInput("operationId must be a non-empty string.");
    }
    const category = normalizeWorldStructureBackfillFailureCategory(failureCategory);
    // Status and category change together; a replay on a settled row writes neither.
    const update = await this.client.worldStructureBackfillOperation.updateMany({
      where: { worldId, operationId, status: "model_in_flight" },
      data: { status: "failed_terminal", failureCategory: category },
    });
    const row = await this.readRow(worldId, operationId);
    return {
      changed: update.count === 1,
      state: row ? toReadResult(row) : null,
    };
  }

  async markUnknown(input: MarkWorldStructureBackfillUnknownInput): Promise<{
    changed: boolean;
    state: WorldStructureBackfillReadResult | null;
  }> {
    if (typeof input.worldId !== "string" || input.worldId.trim().length === 0) {
      invalidInput("worldId must be a non-empty string.");
    }
    if (typeof input.operationId !== "string" || input.operationId.trim().length === 0) {
      invalidInput("operationId must be a non-empty string.");
    }
    const now = input.now ?? new Date();
    validateLeaseDate(now, "now");
    if (input.reason !== "unknown_result" && input.reason !== "lease_expired") {
      invalidInput("reason must be unknown_result or lease_expired.");
    }
    const requestedCategory = normalizeWorldStructureBackfillFailureCategory(input.failureCategory);
    const leaseExpired = WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.leaseExpired;
    if (input.reason === "lease_expired" && requestedCategory !== null && requestedCategory !== leaseExpired) {
      invalidInput("The lease_expired reason can only persist the lease_expired category.");
    }
    const category = input.reason === "lease_expired" ? leaseExpired : requestedCategory;
    const update = await this.client.worldStructureBackfillOperation.updateMany({
      where: {
        worldId: input.worldId,
        operationId: input.operationId,
        status: "model_in_flight",
        ...(input.reason === "lease_expired" ? { leaseExpiresAt: { lte: now } } : {}),
      },
      data: { status: "model_unknown", failureCategory: category },
    });
    const row = await this.readRow(input.worldId, input.operationId);
    return {
      changed: update.count === 1,
      state: row ? toReadResult(row) : null,
    };
  }
}
