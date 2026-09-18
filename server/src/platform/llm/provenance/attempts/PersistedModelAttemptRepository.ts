import { MODEL_ATTEMPT_FAILURE_CODES } from "./contracts";
import type {
  FinalizeModelAttemptInput,
  ModelAttemptAttribution,
  ModelAttemptAttributionKind,
  ModelAttemptAttributionSource,
  ModelAttemptFailure,
  ModelAttemptFinalAdoption,
  ModelAttemptMode,
  ModelAttemptPromptIdentity,
  ModelAttemptRecord,
  ModelAttemptRequestEvidence,
  ModelAttemptRole,
  ModelAttemptRouteTier,
  ModelAttemptStatus,
  ModelAttemptUsage,
  StartModelAttemptInput,
} from "./contracts";
import type { ModelAttemptRepository } from "./repository";
import type {
  FinalizeModelAttemptStorePatch,
  ModelAttemptStore,
  ModelAttemptStoreRow,
  ModelAttemptStoreTransaction,
  StartModelAttemptStoreRow,
} from "./store";

const ROLES = new Set<ModelAttemptRole>([
  "primary",
  "strategy_retry",
  "transport_retry",
  "json_repair",
  "semantic_retry",
  "fallback",
  "legacy_unknown",
]);
const ROUTE_TIERS = new Set<ModelAttemptRouteTier>(["primary", "fallback", "legacy_unknown"]);
const MODES = new Set<ModelAttemptMode>(["invoke", "stream", "legacy_unknown"]);
const STATUSES = new Set<ModelAttemptStatus>([
  "started",
  "succeeded",
  "failed",
  "cancelled",
  "legacy_unknown",
]);
const ADOPTIONS = new Set<ModelAttemptFinalAdoption>([
  "pending",
  "adopted",
  "not_adopted",
  "legacy_unknown",
]);
const ATTRIBUTION_KINDS = new Set<ModelAttemptAttributionKind>([
  "auto_director",
  "novel_world_generate",
  "ai_revision_preview",
  "unattributed",
]);
const ATTRIBUTION_SOURCES = new Set<ModelAttemptAttributionSource>([
  "director_runtime",
  "prompt_invocation",
  "legacy_unknown",
]);
const FAILURE_CATEGORIES = new Set<ModelAttemptFailure["category"]>([
  "transport",
  "timeout",
  "cancelled",
  "validation",
  "unknown",
]);
const FAILURE_CODES = new Set<ModelAttemptFailure["code"]>(MODEL_ATTEMPT_FAILURE_CODES);
const SAFE_METADATA_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,511}$/;

function fail(code: string): never {
  throw new Error(code);
}

function requiredId(value: string, errorCode: string): string {
  if (
    typeof value !== "string"
    || !SAFE_METADATA_IDENTIFIER.test(value)
    || value.includes("://")
    || /^bearer/i.test(value)
  ) {
    fail(errorCode);
  }
  return value;
}

function optionalIdentifier(value: string | null | undefined, errorCode: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return requiredId(value, errorCode);
}

function dateValue(value: string, errorCode: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    fail(errorCode);
  }
  return date;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateUsage(usage: ModelAttemptUsage | null): void {
  if (usage === null) {
    return;
  }
  if (
    !isNonNegativeInteger(usage.promptTokens)
    || !isNonNegativeInteger(usage.completionTokens)
    || (usage.reasoningTokens !== null && !isNonNegativeInteger(usage.reasoningTokens))
    || !isNonNegativeInteger(usage.totalTokens)
  ) {
    fail("invalid_attempt_usage");
  }
}

function validateFailure(failure: ModelAttemptFailure | null): void {
  if (failure === null) {
    return;
  }
  if (
    !FAILURE_CODES.has(failure.code)
    || !FAILURE_CATEGORIES.has(failure.category)
    || typeof failure.retryable !== "boolean"
  ) {
    fail("invalid_attempt_failure");
  }
}

function rowFromStart(input: StartModelAttemptInput): StartModelAttemptStoreRow {
  requiredId(input.requestId, "invalid_attempt_request_id");
  requiredId(input.attemptId, "invalid_attempt_id");
  requiredId(input.provider, "invalid_attempt_provider");
  requiredId(input.model, "invalid_attempt_model");
  if (!ATTRIBUTION_KINDS.has(input.attribution.kind)) {
    fail("invalid_attempt_attribution_kind");
  }
  if (!ATTRIBUTION_SOURCES.has(input.attribution.source)) {
    fail("invalid_attempt_attribution_source");
  }
  if (!isNonNegativeInteger(input.attemptIndex)) {
    fail("invalid_attempt_index");
  }
  const role = input.role as string;
  const routeTier = input.routeTier as string;
  const mode = input.mode as string;
  if (!ROLES.has(input.role) || role === "legacy_unknown") {
    fail("invalid_attempt_role");
  }
  if (!ROUTE_TIERS.has(input.routeTier) || routeTier === "legacy_unknown") {
    fail("invalid_attempt_route_tier");
  }
  if (!MODES.has(input.mode) || mode === "legacy_unknown") {
    fail("invalid_attempt_mode");
  }

  return {
    attemptId: input.attemptId,
    requestId: input.requestId,
    parentAttemptId: optionalIdentifier(input.parentAttemptId, "invalid_attempt_parent_id"),
    attemptIndex: input.attemptIndex,
    role: input.role,
    routeTier: input.routeTier,
    mode: input.mode,
    status: "started",
    finalAdoption: "pending",
    provider: input.provider,
    model: input.model,
    structuredStrategy: optionalIdentifier(input.structuredStrategy, "invalid_attempt_structured_strategy"),
    attributionKind: input.attribution.kind,
    attributionSource: input.attribution.source,
    novelId: optionalIdentifier(input.attribution.novelId, "invalid_attempt_novel_id"),
    taskId: optionalIdentifier(input.attribution.taskId, "invalid_attempt_task_id"),
    directorRunId: optionalIdentifier(input.attribution.directorRunId, "invalid_attempt_director_run_id"),
    directorStepIdempotencyKey: optionalIdentifier(
      input.attribution.directorStepIdempotencyKey,
      "invalid_attempt_director_step_idempotency_key",
    ),
    directorNodeKey: optionalIdentifier(input.attribution.directorNodeKey, "invalid_attempt_director_node_key"),
    chapterId: optionalIdentifier(input.attribution.chapterId, "invalid_attempt_chapter_id"),
    entrypoint: optionalIdentifier(input.attribution.entrypoint, "invalid_attempt_entrypoint"),
    promptId: optionalIdentifier(input.prompt.promptId, "invalid_attempt_prompt_id"),
    promptVersion: optionalIdentifier(input.prompt.promptVersion, "invalid_attempt_prompt_version"),
    taskType: optionalIdentifier(input.prompt.taskType, "invalid_attempt_task_type"),
    modelRoute: optionalIdentifier(input.prompt.modelRoute, "invalid_attempt_model_route"),
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    failureCode: null,
    failureCategory: null,
    failureRetryable: null,
    startedAt: dateValue(input.startedAt, "invalid_attempt_started_at"),
    finishedAt: null,
    durationMs: null,
  };
}

function patchFromFinalize(input: FinalizeModelAttemptInput): FinalizeModelAttemptStorePatch {
  requiredId(input.requestId, "invalid_attempt_request_id");
  requiredId(input.attemptId, "invalid_attempt_id");
  if (!isNonNegativeInteger(input.durationMs)) {
    fail("invalid_attempt_duration");
  }
  const status = input.status as string;
  const finalAdoption = input.finalAdoption as string;
  if (!STATUSES.has(input.status) || status === "started" || status === "legacy_unknown") {
    fail("invalid_attempt_status");
  }
  if (
    !ADOPTIONS.has(input.finalAdoption)
    || finalAdoption === "pending"
    || finalAdoption === "legacy_unknown"
  ) {
    fail("invalid_attempt_adoption");
  }
  if (input.finalAdoption === "adopted" && input.status !== "succeeded") {
    fail("invalid_attempt_adoption");
  }
  if (input.status === "succeeded" && input.failure !== null) {
    fail("invalid_attempt_failure");
  }
  validateUsage(input.usage);
  validateFailure(input.failure);
  return {
    status: input.status,
    finalAdoption: input.finalAdoption,
    promptTokens: input.usage?.promptTokens ?? null,
    completionTokens: input.usage?.completionTokens ?? null,
    reasoningTokens: input.usage?.reasoningTokens ?? null,
    totalTokens: input.usage?.totalTokens ?? null,
    failureCode: input.failure?.code ?? null,
    failureCategory: input.failure?.category ?? null,
    failureRetryable: input.failure?.retryable ?? null,
    finishedAt: dateValue(input.finishedAt, "invalid_attempt_finished_at"),
    durationMs: input.durationMs,
  };
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function sameStart(left: ModelAttemptStoreRow, right: StartModelAttemptStoreRow): boolean {
  return left.attemptId === right.attemptId
    && left.requestId === right.requestId
    && left.parentAttemptId === right.parentAttemptId
    && left.attemptIndex === right.attemptIndex
    && left.role === right.role
    && left.routeTier === right.routeTier
    && left.mode === right.mode
    && left.provider === right.provider
    && left.model === right.model
    && left.structuredStrategy === right.structuredStrategy
    && left.attributionKind === right.attributionKind
    && left.attributionSource === right.attributionSource
    && left.novelId === right.novelId
    && left.taskId === right.taskId
    && left.directorRunId === right.directorRunId
    && left.directorStepIdempotencyKey === right.directorStepIdempotencyKey
    && left.directorNodeKey === right.directorNodeKey
    && left.chapterId === right.chapterId
    && left.entrypoint === right.entrypoint
    && left.promptId === right.promptId
    && left.promptVersion === right.promptVersion
    && left.taskType === right.taskType
    && left.modelRoute === right.modelRoute
    && sameDate(left.startedAt, right.startedAt);
}

function sameTerminal(row: ModelAttemptStoreRow, patch: FinalizeModelAttemptStorePatch): boolean {
  return row.status === patch.status
    && row.finalAdoption === patch.finalAdoption
    && row.promptTokens === patch.promptTokens
    && row.completionTokens === patch.completionTokens
    && row.reasoningTokens === patch.reasoningTokens
    && row.totalTokens === patch.totalTokens
    && row.failureCode === patch.failureCode
    && row.failureCategory === patch.failureCategory
    && row.failureRetryable === patch.failureRetryable
    && sameDate(row.finishedAt, patch.finishedAt)
    && row.durationMs === patch.durationMs;
}

function requestIdentity(row: ModelAttemptStoreRow): unknown {
  return {
    mode: row.mode,
    attributionKind: row.attributionKind,
    attributionSource: row.attributionSource,
    novelId: row.novelId,
    taskId: row.taskId,
    directorRunId: row.directorRunId,
    directorStepIdempotencyKey: row.directorStepIdempotencyKey,
    directorNodeKey: row.directorNodeKey,
    chapterId: row.chapterId,
    entrypoint: row.entrypoint,
  };
}

function validateStartLineage(row: StartModelAttemptStoreRow, requestRows: ModelAttemptStoreRow[]): void {
  if (row.attemptIndex === 0) {
    if (row.role !== "primary" || row.parentAttemptId !== null || requestRows.length !== 0) {
      fail("invalid_primary_attempt");
    }
    return;
  }
  if (row.role === "primary" || row.parentAttemptId === null) {
    fail("missing_parent_attempt");
  }
  const indexes = new Set(requestRows.map((candidate) => candidate.attemptIndex));
  for (let index = 0; index < row.attemptIndex; index += 1) {
    if (!indexes.has(index)) {
      fail("attempt_index_gap");
    }
  }
  if (requestRows.some((candidate) => canonical(requestIdentity(candidate)) !== canonical(requestIdentity(row)))) {
    fail("attempt_request_identity_conflict");
  }
  const parent = requestRows.find((candidate) => candidate.attemptId === row.parentAttemptId);
  if (!parent || parent.attemptIndex >= row.attemptIndex) {
    fail("invalid_parent_attempt");
  }
}

function knownOr<T extends string>(value: string, values: Set<T>, fallback: T): T {
  return values.has(value as T) ? value as T : fallback;
}

function readUsage(row: ModelAttemptStoreRow): ModelAttemptUsage | null {
  if (
    row.promptTokens === null
    || row.completionTokens === null
    || row.totalTokens === null
  ) {
    return null;
  }
  return {
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    reasoningTokens: row.reasoningTokens,
    totalTokens: row.totalTokens,
  };
}

function readFailure(row: ModelAttemptStoreRow): ModelAttemptFailure | null {
  if (row.failureCode === null) {
    return null;
  }
  return {
    code: knownOr(row.failureCode, FAILURE_CODES, "legacy_unknown"),
    category: knownOr(row.failureCategory ?? "unknown", FAILURE_CATEGORIES, "unknown"),
    retryable: row.failureRetryable ?? false,
  };
}

function readAttribution(row: ModelAttemptStoreRow): ModelAttemptAttribution {
  return {
    kind: knownOr(row.attributionKind, ATTRIBUTION_KINDS, "unattributed"),
    source: knownOr(row.attributionSource, ATTRIBUTION_SOURCES, "legacy_unknown"),
    novelId: row.novelId,
    taskId: row.taskId,
    directorRunId: row.directorRunId,
    directorStepIdempotencyKey: row.directorStepIdempotencyKey,
    directorNodeKey: row.directorNodeKey,
    chapterId: row.chapterId,
    entrypoint: row.entrypoint,
  };
}

function readPrompt(row: ModelAttemptStoreRow): ModelAttemptPromptIdentity {
  return {
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    taskType: row.taskType,
    modelRoute: row.modelRoute,
  };
}

function toRecord(row: ModelAttemptStoreRow): ModelAttemptRecord {
  return {
    requestId: row.requestId,
    attemptId: row.attemptId,
    parentAttemptId: row.parentAttemptId,
    attemptIndex: row.attemptIndex,
    role: knownOr(row.role, ROLES, "legacy_unknown"),
    routeTier: knownOr(row.routeTier, ROUTE_TIERS, "legacy_unknown"),
    mode: knownOr(row.mode, MODES, "legacy_unknown"),
    status: knownOr(row.status, STATUSES, "legacy_unknown"),
    finalAdoption: knownOr(row.finalAdoption, ADOPTIONS, "legacy_unknown"),
    provider: row.provider,
    model: row.model,
    structuredStrategy: row.structuredStrategy,
    attribution: readAttribution(row),
    prompt: readPrompt(row),
    usage: readUsage(row),
    failure: readFailure(row),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  };
}

function sortRows(rows: ModelAttemptStoreRow[]): ModelAttemptStoreRow[] {
  return [...rows].sort((left, right) => (
    left.attemptIndex - right.attemptIndex
    || left.startedAt.getTime() - right.startedAt.getTime()
    || left.attemptId.localeCompare(right.attemptId)
  ));
}

async function resolveInsertCollision(
  transaction: ModelAttemptStoreTransaction,
  expected: StartModelAttemptStoreRow,
): Promise<void> {
  const byId = await transaction.findByAttemptId(expected.attemptId);
  if (byId) {
    if (sameStart(byId, expected)) {
      return;
    }
    fail("attempt_id_conflict");
  }
  if (await transaction.findByRequestAndIndex(expected.requestId, expected.attemptIndex)) {
    fail("attempt_index_conflict");
  }
  fail("attempt_insert_conflict");
}

/**
 * Production repository policy over an injected database store. The store is
 * deliberately not instantiated here: SQLite/PostgreSQL adapters arrive with
 * their additive schemas and migrations and no user database is touched by
 * this module or its unit tests.
 */
export class PersistedModelAttemptRepository implements ModelAttemptRepository {
  constructor(private readonly store: ModelAttemptStore) {}

  async startAttempt(input: StartModelAttemptInput): Promise<void> {
    const expected = rowFromStart(input);
    await this.store.withRequestTransaction(input.requestId, async (transaction) => {
      const existing = await transaction.findByAttemptId(input.attemptId);
      if (existing) {
        if (!sameStart(existing, expected)) {
          fail("attempt_id_conflict");
        }
        return;
      }
      if (await transaction.findByRequestAndIndex(input.requestId, input.attemptIndex)) {
        fail("attempt_index_conflict");
      }
      const requestRows = await transaction.listByRequestId(input.requestId);
      validateStartLineage(expected, requestRows);
      if (!await transaction.insertIfAbsent(expected)) {
        await resolveInsertCollision(transaction, expected);
      }
    });
  }

  async finalizeAttempt(input: FinalizeModelAttemptInput): Promise<void> {
    const patch = patchFromFinalize(input);
    await this.store.withRequestTransaction(input.requestId, async (transaction) => {
      const existing = await transaction.findByAttemptId(input.attemptId);
      if (!existing || existing.requestId !== input.requestId) {
        fail("attempt_not_started");
      }
      if (existing.status !== "started") {
        if (!sameTerminal(existing, patch)) {
          fail("attempt_finalize_conflict");
        }
        return;
      }
      if (input.finalAdoption === "adopted") {
        const requestRows = await transaction.listByRequestId(input.requestId);
        if (requestRows.some((row) => row.attemptId !== input.attemptId && row.finalAdoption === "adopted")) {
          fail("request_already_adopted");
        }
      }
      if (!await transaction.finalizeIfStarted(input.attemptId, patch)) {
        const current = await transaction.findByAttemptId(input.attemptId);
        if (!current || !sameTerminal(current, patch)) {
          fail("attempt_finalize_conflict");
        }
      }
    });
  }

  async findAttempt(attemptId: string): Promise<ModelAttemptRecord | null> {
    requiredId(attemptId, "invalid_attempt_id");
    const row = await this.store.findByAttemptId(attemptId);
    return row ? toRecord(row) : null;
  }

  async reconstructRequest(requestId: string): Promise<ModelAttemptRequestEvidence | null> {
    requiredId(requestId, "invalid_attempt_request_id");
    const attempts = sortRows(await this.store.listByRequestId(requestId)).map(toRecord);
    if (attempts.length === 0) {
      return null;
    }
    return {
      requestId,
      attempts,
      adoptedAttemptId: attempts.find((attempt) => attempt.finalAdoption === "adopted")?.attemptId ?? null,
    };
  }

  async findByNovelId(novelId: string): Promise<ModelAttemptRecord[]> {
    requiredId(novelId, "invalid_attempt_novel_id");
    return (await this.store.listByNovelId(novelId))
      .sort((left, right) => (
        left.startedAt.getTime() - right.startedAt.getTime()
        || left.requestId.localeCompare(right.requestId)
        || left.attemptIndex - right.attemptIndex
      ))
      .map(toRecord);
  }
}
