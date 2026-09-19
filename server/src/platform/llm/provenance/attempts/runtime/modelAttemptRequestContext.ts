import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type {
  ModelAttemptAttribution,
  ModelAttemptExecutionEvidence,
  ModelAttemptMode,
  ModelAttemptObservationIssue,
  ModelAttemptPromptIdentity,
} from "../contracts";
import { LEGACY_UNKNOWN_ATTRIBUTION } from "../contracts";

export interface ModelAttemptRequestContextInput {
  mode: Exclude<ModelAttemptMode, "legacy_unknown">;
  prompt?: Partial<ModelAttemptPromptIdentity>;
}

export interface ModelAttemptRequestState {
  requestId: string;
  mode: Exclude<ModelAttemptMode, "legacy_unknown">;
  attribution: ModelAttemptAttribution;
  prompt: ModelAttemptPromptIdentity;
  nextAttemptIndex: number;
  lastAttemptId: string | null;
  successfulEvidenceWrites: number;
  observationIssues: ModelAttemptObservationIssue[];
}

const requestStore = new AsyncLocalStorage<ModelAttemptRequestState>();

function createPromptIdentity(
  prompt: Partial<ModelAttemptPromptIdentity> | undefined,
): ModelAttemptPromptIdentity {
  return {
    promptId: prompt?.promptId ?? null,
    promptVersion: prompt?.promptVersion ?? null,
    taskType: prompt?.taskType ?? null,
    modelRoute: prompt?.modelRoute ?? null,
  };
}

export function getModelAttemptRequestState(): ModelAttemptRequestState | undefined {
  return requestStore.getStore();
}

/**
 * Re-enter an already-created request scope from a deferred stream callback.
 * Async generators can be consumed after the function that created them has
 * returned, so relying on the caller's current async-local scope would lose
 * the request lineage. The state object is intentionally shared and mutable:
 * all callbacks for one logical request must observe the same next index and
 * observation status.
 */
export function runWithModelAttemptRequestState<T>(
  state: ModelAttemptRequestState,
  operation: () => T,
): T {
  return requestStore.run(state, operation);
}

export function runWithModelAttemptRequestContext<T>(
  input: ModelAttemptRequestContextInput,
  operation: () => T,
): T {
  if (requestStore.getStore()) {
    return operation();
  }
  return requestStore.run({
    requestId: randomUUID(),
    mode: input.mode,
    attribution: { ...LEGACY_UNKNOWN_ATTRIBUTION },
    prompt: createPromptIdentity(input.prompt),
    nextAttemptIndex: 0,
    lastAttemptId: null,
    successfulEvidenceWrites: 0,
    observationIssues: [],
  }, operation);
}

export function updateModelAttemptPromptIdentity(
  prompt: Partial<ModelAttemptPromptIdentity>,
): void {
  const state = requestStore.getStore();
  if (!state) {
    return;
  }
  state.prompt = {
    promptId: prompt.promptId ?? state.prompt.promptId,
    promptVersion: prompt.promptVersion ?? state.prompt.promptVersion,
    taskType: prompt.taskType ?? state.prompt.taskType,
    modelRoute: prompt.modelRoute ?? state.prompt.modelRoute,
  };
}

export function getModelAttemptExecutionEvidence(): ModelAttemptExecutionEvidence | undefined {
  const state = requestStore.getStore();
  if (!state) {
    return undefined;
  }
  const evidenceStatus = state.observationIssues.length === 0
    ? "complete"
    : state.successfulEvidenceWrites > 0 ? "partial" : "missing";
  return {
    requestId: state.requestId,
    evidenceStatus,
    observationIssues: state.observationIssues.map((issue) => ({ ...issue })),
  };
}
