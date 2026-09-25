import { createHash } from "node:crypto";

export const WORLD_STRUCTURE_BACKFILL_STATUSES = [
  "model_not_called",
  "model_in_flight",
  "model_succeeded_pending_commit",
  "model_unknown",
  "committed",
  "conflict_result_retained",
  "failed_terminal",
] as const;

export type WorldStructureBackfillStatus = (typeof WORLD_STRUCTURE_BACKFILL_STATUSES)[number];
export type WorldStructureBackfillJsonValue =
  | string
  | number
  | boolean
  | null
  | WorldStructureBackfillJsonValue[]
  | WorldStructureBackfillJsonObject;
export interface WorldStructureBackfillJsonObject {
  [key: string]: WorldStructureBackfillJsonValue;
}

export interface WorldStructureBackfillRequestInput {
  worldId: string;
  operationId: string;
  baseContentRevision: number;
  promptId: string;
  promptVersion: string;
  provider?: string | null;
  model?: string | null;
  generationPolicyVersion: string;
  sourceDigest: string;
}

export interface NormalizedWorldStructureBackfillRequest {
  worldId: string;
  baseContentRevision: number;
  promptId: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  generationPolicyVersion: string;
  sourceDigest: string;
}

export interface WorldStructureBackfillOperationRecord extends NormalizedWorldStructureBackfillRequest {
  id: string;
  operationId: string;
  requestHash: string;
  status: WorldStructureBackfillStatus;
  leaseExpiresAt: Date | null;
  modelRequestId: string | null;
  modelAttemptId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorldStructureBackfillResultRecord {
  id: string;
  operationRecordId: string;
  normalizedStructure: WorldStructureBackfillJsonObject;
  bindingSupport: WorldStructureBackfillJsonObject;
  baseContentRevision: number;
  requestHash: string;
  generationPolicyVersion: string;
  digest: string;
  modelRequestId: string | null;
  modelAttemptId: string | null;
  createdAt: Date;
}

export interface WorldStructureBackfillReadResult {
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
}

export interface WorldStructureBackfillCommitReceiptRecord {
  id: string;
  operationRecordId: string;
  worldId: string;
  operationId: string;
  resultDigest: string;
  baseContentRevision: number;
  committedRevision: number;
  beforeDigest: string;
  afterDigest: string;
  committedAt: Date;
}

export interface WorldStructureBackfillCommitReadOutcome {
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
  receipt: WorldStructureBackfillCommitReceiptRecord | null;
}

export type WorldStructureBackfillCommitOutcome =
  | { kind: "committed" | "replayed"; outcome: WorldStructureBackfillCommitReadOutcome & {
    result: WorldStructureBackfillResultRecord;
    receipt: WorldStructureBackfillCommitReceiptRecord;
  } }
  | { kind: "conflict_result_retained"; outcome: WorldStructureBackfillCommitReadOutcome & {
    result: WorldStructureBackfillResultRecord;
    receipt: null;
  } };

export type WorldStructureBackfillStoreErrorCode =
  | "INVALID_INPUT"
  | "OPERATION_ID_REUSED"
  | "WORLD_NOT_FOUND"
  | "OPERATION_NOT_FOUND"
  | "BASE_REVISION_MISMATCH"
  | "INVALID_STATE"
  | "MODEL_REFERENCE_MISMATCH"
  | "RESULT_DIGEST_CONFLICT"
  | "RESULT_NOT_FOUND"
  | "RESULT_INTEGRITY_MISMATCH"
  | "COMMIT_RECEIPT_INTEGRITY"
  | "COMMIT_RESULT_UNKNOWN";

export class WorldStructureBackfillStoreError extends Error {
  constructor(
    public readonly code: WorldStructureBackfillStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorldStructureBackfillStoreError";
  }
}

function invalidInput(message: string): never {
  throw new WorldStructureBackfillStoreError("INVALID_INPUT", message);
}

function requireNonBlankString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidInput(`${fieldName} must be a non-empty string.`);
  }
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    invalidInput(`${fieldName} must be a string or null.`);
  }
  return value;
}

export function normalizeWorldStructureBackfillRequest(
  input: WorldStructureBackfillRequestInput,
): NormalizedWorldStructureBackfillRequest {
  requireNonBlankString(input.worldId, "worldId");
  requireNonBlankString(input.operationId, "operationId");
  requireNonBlankString(input.promptId, "promptId");
  requireNonBlankString(input.promptVersion, "promptVersion");
  requireNonBlankString(input.generationPolicyVersion, "generationPolicyVersion");
  requireNonBlankString(input.sourceDigest, "sourceDigest");
  if (!Number.isSafeInteger(input.baseContentRevision) || input.baseContentRevision < 0) {
    invalidInput("baseContentRevision must be a non-negative safe integer.");
  }

  return {
    worldId: input.worldId,
    baseContentRevision: input.baseContentRevision,
    promptId: input.promptId,
    promptVersion: input.promptVersion,
    provider: normalizeOptionalString(input.provider, "provider"),
    model: normalizeOptionalString(input.model, "model"),
    generationPolicyVersion: input.generationPolicyVersion,
    sourceDigest: input.sourceDigest,
  };
}

export function createWorldStructureBackfillRequestHash(
  input: WorldStructureBackfillRequestInput,
): string {
  const request = normalizeWorldStructureBackfillRequest(input);
  const canonicalRequest = JSON.stringify({
    worldId: request.worldId,
    baseContentRevision: request.baseContentRevision,
    promptId: request.promptId,
    promptVersion: request.promptVersion,
    provider: request.provider,
    model: request.model,
    generationPolicyVersion: request.generationPolicyVersion,
    sourceDigest: request.sourceDigest,
  });

  return createHash("sha256").update(canonicalRequest, "utf8").digest("hex");
}

function normalizeJsonValue(
  value: unknown,
  fieldName: string,
  ancestors: WeakSet<object>,
): WorldStructureBackfillJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidInput(`${fieldName} contains a non-finite number.`);
    }
    return value;
  }
  if (typeof value !== "object") {
    invalidInput(`${fieldName} must contain JSON-compatible values.`);
  }
  if (ancestors.has(value)) {
    invalidInput(`${fieldName} must not contain circular values.`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonValue(item, fieldName, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalidInput(`${fieldName} must contain plain JSON objects.`);
    }
    const source = value as Record<string, unknown>;
    const normalized: Record<string, WorldStructureBackfillJsonValue> = Object.create(null);
    for (const key of Object.keys(source).sort()) {
      normalized[key] = normalizeJsonValue(source[key], fieldName, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function serializeWorldStructureBackfillJsonObject(
  value: unknown,
  fieldName: "normalizedStructure" | "bindingSupport",
): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidInput(`${fieldName} must be a JSON object.`);
  }
  const normalized = normalizeJsonValue(value, fieldName, new WeakSet());
  return JSON.stringify(normalized);
}

export function createWorldStructureBackfillResultDigest(
  normalizedStructure: unknown,
  bindingSupport: unknown,
): {
  digest: string;
  normalizedStructureJson: string;
  bindingSupportJson: string;
} {
  const normalizedStructureJson = serializeWorldStructureBackfillJsonObject(
    normalizedStructure,
    "normalizedStructure",
  );
  const bindingSupportJson = serializeWorldStructureBackfillJsonObject(bindingSupport, "bindingSupport");
  const canonicalResult = `{"normalizedStructure":${normalizedStructureJson},"bindingSupport":${bindingSupportJson}}`;

  return {
    digest: createHash("sha256").update(canonicalResult, "utf8").digest("hex"),
    normalizedStructureJson,
    bindingSupportJson,
  };
}

export function parseWorldStructureBackfillJsonObject(
  json: string,
  fieldName: "normalizedStructure" | "bindingSupport",
): WorldStructureBackfillJsonObject {
  const parsed: unknown = JSON.parse(json);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Stored ${fieldName} must be a JSON object.`);
  }
  return parsed as WorldStructureBackfillJsonObject;
}
