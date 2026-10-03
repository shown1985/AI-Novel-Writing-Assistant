import { randomUUID } from "node:crypto";
import type {
  ModelAttemptFailure,
  ModelAttemptFinalAdoption,
  ModelAttemptRole,
  ModelAttemptRouteTier,
  ModelAttemptUsage,
} from "../contracts";
import type { LlmTokenUsageSnapshot } from "../../../../../llm/usageTracking";
import { getModelAttemptRepository } from "./modelAttemptRepositoryProvider";
import {
  getModelAttemptRequestState,
  updateModelAttemptPromptIdentity,
} from "./modelAttemptRequestContext";

export interface StartModelTransportAttemptInput {
  provider: string;
  model: string;
  structuredStrategy?: string | null;
  modelRoute?: string | null;
  role?: Exclude<ModelAttemptRole, "legacy_unknown">;
  routeTier?: Exclude<ModelAttemptRouteTier, "legacy_unknown">;
  parentAttemptId?: string | null;
}

export interface ModelAttemptCandidate {
  readonly attemptId: string;
  readonly requestId: string;
  readonly startedAtMs: number;
  readonly startObserved: boolean;
  isFinalized(): boolean;
  finalizeSucceeded(
    usage: LlmTokenUsageSnapshot | ModelAttemptUsage | null | undefined,
    adoption: Extract<ModelAttemptFinalAdoption, "adopted" | "not_adopted">,
  ): Promise<void>;
  finalizeFailed(error: unknown, signal?: AbortSignal): Promise<void>;
  finalizeCancelled(): Promise<void>;
}

function normalizeUsage(
  usage: LlmTokenUsageSnapshot | ModelAttemptUsage | null | undefined,
): ModelAttemptUsage | null {
  if (!usage) {
    return null;
  }
  return {
    promptTokens: Math.max(0, Math.round(usage.promptTokens)),
    completionTokens: Math.max(0, Math.round(usage.completionTokens)),
    reasoningTokens: usage.reasoningTokens == null
      ? null
      : Math.max(0, Math.round(usage.reasoningTokens)),
    totalTokens: Math.max(0, Math.round(usage.totalTokens)),
  };
}

function errorCategory(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("category" in error)) {
    return null;
  }
  return typeof (error as { category?: unknown }).category === "string"
    ? (error as { category: string }).category
    : null;
}

function classifyFailure(error: unknown, signal?: AbortSignal): ModelAttemptFailure {
  const category = errorCategory(error);
  const cancelled = signal?.aborted
    || (error instanceof Error && (error.name === "AbortError" || /cancel|abort|取消/i.test(error.message)));
  if (cancelled) {
    return { code: "request_cancelled", category: "cancelled", retryable: false };
  }
  if (category === "rate_limited") {
    return { code: "rate_limited", category: "transport", retryable: true };
  }
  if (category === "upstream_timeout") {
    return { code: "upstream_timeout", category: "timeout", retryable: true };
  }
  if (category === "authentication_failed") {
    return { code: "authentication_failed", category: "transport", retryable: false };
  }
  if (category === "provider_unavailable") {
    return { code: "provider_unavailable", category: "transport", retryable: true };
  }
  if (category === "schema_mismatch" || category === "empty_content") {
    return { code: "validation_failed", category: "validation", retryable: false };
  }
  if (category === "transport_error") {
    return { code: "transport_error", category: "transport", retryable: true };
  }
  return { code: "transport_unknown", category: "unknown", retryable: false };
}

async function observe(
  phase: "start" | "finalize",
  attemptId: string,
  writer: () => Promise<void>,
): Promise<boolean> {
  const state = getModelAttemptRequestState();
  if (!state) {
    return false;
  }
  try {
    await writer();
    state.successfulEvidenceWrites += 1;
    return true;
  } catch {
    state.observationIssues.push({
      phase,
      attemptId,
      code: "attempt_evidence_write_failed",
    });
    return false;
  }
}

export async function startModelTransportAttempt(
  input: StartModelTransportAttemptInput,
): Promise<ModelAttemptCandidate | null> {
  const state = getModelAttemptRequestState();
  if (!state) {
    return null;
  }
  const attemptIndex = state.nextAttemptIndex;
  state.nextAttemptIndex += 1;
  const attemptId = randomUUID();
  const parentAttemptId = attemptIndex === 0
    ? null
    : input.parentAttemptId ?? state.lastAttemptId;
  const role = attemptIndex === 0 ? "primary" : input.role ?? "strategy_retry";
  const routeTier = input.routeTier ?? "primary";
  const startedAtMs = Date.now();
  state.lastAttemptId = attemptId;
  updateModelAttemptPromptIdentity({ modelRoute: input.modelRoute ?? undefined });

  const startObserved = await observe("start", attemptId, () => getModelAttemptRepository().startAttempt({
    requestId: state.requestId,
    attemptId,
    parentAttemptId,
    attemptIndex,
    role,
    routeTier,
    mode: state.mode,
    provider: input.provider,
    model: input.model,
    structuredStrategy: input.structuredStrategy ?? null,
    attribution: state.attribution,
    prompt: state.prompt,
    startedAt: new Date(startedAtMs).toISOString(),
  }));

  let finalized = false;
  const finalize = async (input: {
    status: "succeeded" | "failed" | "cancelled";
    adoption: "adopted" | "not_adopted";
    usage: ModelAttemptUsage | null;
    failure: ModelAttemptFailure | null;
  }): Promise<void> => {
    if (finalized) {
      return;
    }
    finalized = true;
    const finishedAtMs = Date.now();
    await observe("finalize", attemptId, () => getModelAttemptRepository().finalizeAttempt({
      requestId: state.requestId,
      attemptId,
      status: input.status,
      finalAdoption: input.adoption,
      usage: input.usage,
      failure: input.failure,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
    }));
  };

  return {
    attemptId,
    requestId: state.requestId,
    startedAtMs,
    startObserved,
    isFinalized: () => finalized,
    finalizeSucceeded: (usage, adoption) => finalize({
      status: "succeeded",
      adoption,
      usage: normalizeUsage(usage),
      failure: null,
    }),
    finalizeFailed: (error, signal) => {
      const failure = classifyFailure(error, signal);
      return finalize({
        status: failure.category === "cancelled" ? "cancelled" : "failed",
        adoption: "not_adopted",
        usage: null,
        failure,
      });
    },
    finalizeCancelled: () => finalize({
      status: "cancelled",
      adoption: "not_adopted",
      usage: null,
      failure: { code: "request_cancelled", category: "cancelled", retryable: false },
    }),
  };
}
