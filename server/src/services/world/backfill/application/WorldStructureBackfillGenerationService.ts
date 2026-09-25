import type { PrismaClient, World } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { StructuredOutputError } from "../../../../llm/structuredOutput";
import {
  getModelAttemptRequestState,
  runWithModelAttemptRequestContext,
} from "../../../../platform/llm/provenance";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { worldStructureBackfillPrompt } from "../../../../prompting/prompts/world/world.prompts";
import {
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  normalizeWorldStructuredData,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "../../worldStructure";
import { buildWorldStructurePromptSource } from "../../worldServiceShared";
import {
  createWorldStructureBackfillRequestHash,
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillFailureCategory,
  type WorldStructureBackfillJsonObject,
  type WorldStructureBackfillOperationRecord,
  type WorldStructureBackfillReadResult,
  type WorldStructureBackfillRequestInput,
  type WorldStructureBackfillResultRecord,
} from "../domain/worldStructureBackfillContracts";
import {
  createWorldStructureBackfillSourceDigest,
  DEFAULT_WORLD_STRUCTURE_BACKFILL_LEASE_MS,
  isWorldStructureBackfillLeaseExpired,
  resolveWorldStructureBackfillFailureStatus,
  resolveWorldStructureBackfillLeaseExpiresAt,
  WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
  WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES,
  WORLD_STRUCTURE_BACKFILL_TEMPERATURE,
  type WorldStructureBackfillFailurePhase,
} from "../domain/worldStructureBackfillGeneration";
import type { WorldStructureBackfillStore } from "../infrastructure/prismaWorldStructureBackfillStore";

export interface GenerateWorldStructureBackfillResultInput {
  worldId: string;
  operationId: string;
  baseContentRevision: number;
  provider?: LLMProvider | null;
  model?: string | null;
  signal?: AbortSignal;
}

/**
 * `result_stored`: a persisted result exists (`model_succeeded_pending_commit`,
 * `committed`, or `conflict_result_retained`).
 * `in_progress`: another owner holds an unexpired model call lease.
 * `failed_terminal` / `model_unknown`: terminal states that never reopen a call.
 */
export type WorldStructureBackfillGenerationOutcomeKind =
  | "result_stored"
  | "in_progress"
  | "failed_terminal"
  | "model_unknown";

export interface WorldStructureBackfillGenerationOutcome {
  kind: WorldStructureBackfillGenerationOutcomeKind;
  /** False only when this invocation opened the provider call itself. */
  replayed: boolean;
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
  /**
   * Allowlisted failure category. Replays read it from the operation row; a
   * fresh failure returns the category it wrote, or the stored one when the
   * row had already settled.
   */
  failureCategory: WorldStructureBackfillFailureCategory | null;
}

export interface WorldStructureBackfillGenerationServiceDeps {
  client: PrismaClient;
  store: WorldStructureBackfillStore;
  clock?: () => Date;
  leaseDurationMs?: number;
}

function outcomeKindForStatus(
  status: WorldStructureBackfillOperationRecord["status"],
): WorldStructureBackfillGenerationOutcomeKind {
  switch (status) {
    case "model_succeeded_pending_commit":
    case "committed":
    case "conflict_result_retained":
      return "result_stored";
    case "failed_terminal":
      return "failed_terminal";
    case "model_unknown":
      return "model_unknown";
    case "model_not_called":
    case "model_in_flight":
    default:
      return "in_progress";
  }
}

function toOutcome(
  state: WorldStructureBackfillReadResult,
  replayed: boolean,
  failureCategory: WorldStructureBackfillFailureCategory | null = state.operation.failureCategory ?? null,
): WorldStructureBackfillGenerationOutcome {
  return {
    kind: outcomeKindForStatus(state.operation.status),
    replayed,
    operation: state.operation,
    result: state.result,
    failureCategory,
  };
}

/**
 * Match the JSON the legacy path persists: optional fields left `undefined`
 * by normalization are dropped exactly as `JSON.stringify` drops them.
 */
function toStoredJsonObject(value: unknown): WorldStructureBackfillJsonObject {
  return JSON.parse(JSON.stringify(value)) as WorldStructureBackfillJsonObject;
}

function baseRevisionMismatch(): WorldStructureBackfillStoreError {
  return new WorldStructureBackfillStoreError(
    "BASE_REVISION_MISMATCH",
    "The world content changed after this backfill request was frozen.",
  );
}

export class WorldStructureBackfillGenerationService {
  private readonly clock: () => Date;

  private readonly leaseDurationMs: number;

  constructor(private readonly deps: WorldStructureBackfillGenerationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.leaseDurationMs = deps.leaseDurationMs ?? DEFAULT_WORLD_STRUCTURE_BACKFILL_LEASE_MS;
    if (!Number.isSafeInteger(this.leaseDurationMs) || this.leaseDurationMs <= 0) {
      throw new WorldStructureBackfillStoreError("INVALID_INPUT", "leaseDurationMs must be a positive integer.");
    }
  }

  async generatePersistedResult(
    input: GenerateWorldStructureBackfillResultInput,
  ): Promise<WorldStructureBackfillGenerationOutcome> {
    const existing = await this.deps.store.read(input.worldId, input.operationId);
    if (existing) {
      return this.replay(input, existing);
    }

    const world = await this.loadWorld(input.worldId);
    if (world.contentRevision !== input.baseContentRevision) {
      throw baseRevisionMismatch();
    }
    const promptSource = buildWorldStructurePromptSource(world);
    const request = this.buildRequest(input, createWorldStructureBackfillSourceDigest(promptSource));
    await this.deps.store.claim(request);
    return this.runModel(input, request, world, promptSource);
  }

  private buildRequest(
    input: GenerateWorldStructureBackfillResultInput,
    sourceDigest: string,
  ): WorldStructureBackfillRequestInput {
    return {
      worldId: input.worldId,
      operationId: input.operationId,
      baseContentRevision: input.baseContentRevision,
      promptId: worldStructureBackfillPrompt.id,
      promptVersion: worldStructureBackfillPrompt.version,
      provider: input.provider ?? null,
      model: input.model ?? null,
      generationPolicyVersion: WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
      sourceDigest,
    };
  }

  private async loadWorld(worldId: string): Promise<World> {
    const world = await this.deps.client.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new WorldStructureBackfillStoreError("WORLD_NOT_FOUND", "The world does not exist.");
    }
    return world;
  }

  private async replay(
    input: GenerateWorldStructureBackfillResultInput,
    existing: WorldStructureBackfillReadResult,
  ): Promise<WorldStructureBackfillGenerationOutcome> {
    const { operation } = existing;
    // Caller-frozen fields (base revision, provider/model) plus the registered
    // prompt identity and policy must reproduce the stored request hash.
    const request = this.buildRequest(input, operation.sourceDigest);
    if (createWorldStructureBackfillRequestHash(request) !== operation.requestHash) {
      throw new WorldStructureBackfillStoreError(
        "OPERATION_ID_REUSED",
        "This operationId is already bound to a different frozen request.",
      );
    }

    if (operation.status === "model_not_called") {
      const world = await this.loadWorld(input.worldId);
      const promptSource = buildWorldStructurePromptSource(world);
      if (
        world.contentRevision !== operation.baseContentRevision
        || createWorldStructureBackfillSourceDigest(promptSource) !== operation.sourceDigest
      ) {
        throw baseRevisionMismatch();
      }
      return this.runModel(input, request, world, promptSource);
    }

    if (operation.status === "model_in_flight") {
      const now = this.clock();
      if (!isWorldStructureBackfillLeaseExpired(operation.leaseExpiresAt, now)) {
        return toOutcome(existing, true);
      }
      const marked = await this.deps.store.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "lease_expired",
        failureCategory: WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.leaseExpired,
        now,
      });
      return toOutcome(marked.state ?? existing, true);
    }

    return toOutcome(existing, true);
  }

  private runModel(
    input: GenerateWorldStructureBackfillResultInput,
    request: WorldStructureBackfillRequestInput,
    world: World,
    promptSource: string,
  ): Promise<WorldStructureBackfillGenerationOutcome> {
    return runWithModelAttemptRequestContext({
      mode: "invoke",
      prompt: {
        promptId: worldStructureBackfillPrompt.id,
        promptVersion: worldStructureBackfillPrompt.version,
        taskType: worldStructureBackfillPrompt.taskType,
      },
    }, async () => {
      const requestState = getModelAttemptRequestState();
      if (!requestState) {
        throw new Error("Model attempt request context is unavailable.");
      }
      const modelRequestId = requestState.requestId;
      const started = await this.deps.store.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: resolveWorldStructureBackfillLeaseExpiresAt(this.clock(), this.leaseDurationMs),
        modelRequestId,
        onNotAcquired: "return_current",
      });
      if (!started.acquired) {
        return toOutcome(started.current ?? { operation: started.operation, result: started.result }, true);
      }

      let rawOutput: unknown;
      try {
        const run = await runStructuredPrompt({
          asset: worldStructureBackfillPrompt,
          promptInput: { promptSource },
          options: {
            provider: input.provider ?? undefined,
            model: input.model ?? undefined,
            temperature: WORLD_STRUCTURE_BACKFILL_TEMPERATURE,
            signal: input.signal,
            singleProviderTransportAttempt: true,
          },
        });
        rawOutput = run.output;
      } catch (error) {
        const category = input.signal?.aborted
          ? WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.cancelled
          : error instanceof StructuredOutputError
            ? error.category
            : WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.unstructuredError;
        return this.recordFailure(input, "provider_call", category);
      }

      let normalizedStructure: WorldStructureBackfillJsonObject;
      let bindingSupport: WorldStructureBackfillJsonObject;
      try {
        const nextStructure = normalizeWorldStructuredData(rawOutput, buildWorldStructureFromLegacySource(world));
        nextStructure.metadata = {
          ...nextStructure.metadata,
          schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
          seededFrom: "ai-backfill",
          lastBackfilledAt: this.clock().toISOString(),
        };
        normalizedStructure = toStoredJsonObject(nextStructure);
        bindingSupport = toStoredJsonObject(buildWorldBindingSupport(nextStructure));
      } catch {
        return this.recordFailure(
          input,
          "after_provider_output",
          WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.normalizationFailed,
        );
      }

      try {
        const persisted = await this.deps.store.persistResult({
          ...request,
          normalizedStructure,
          bindingSupport,
          modelRequestId,
          modelAttemptId: getModelAttemptRequestState()?.lastAttemptId ?? null,
        });
        return toOutcome(persisted, false);
      } catch {
        return this.recordFailure(
          input,
          "after_provider_output",
          WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES.persistFailed,
        );
      }
    });
  }

  private async recordFailure(
    input: GenerateWorldStructureBackfillResultInput,
    phase: WorldStructureBackfillFailurePhase,
    category: WorldStructureBackfillFailureCategory,
  ): Promise<WorldStructureBackfillGenerationOutcome> {
    const status = resolveWorldStructureBackfillFailureStatus({ phase, category });
    const marked = status === "failed_terminal"
      ? await this.deps.store.markFailed(input.worldId, input.operationId, category)
      : await this.deps.store.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "unknown_result",
        failureCategory: category,
      });
    if (!marked.state) {
      throw new WorldStructureBackfillStoreError(
        "OPERATION_NOT_FOUND",
        "No backfill operation belongs to this world and operationId.",
      );
    }
    // A row that had already settled keeps its stored category; never report the unwritten one.
    return toOutcome(
      marked.state,
      false,
      marked.changed ? category : marked.state.operation.failureCategory ?? null,
    );
  }
}
