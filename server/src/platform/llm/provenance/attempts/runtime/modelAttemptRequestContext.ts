import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type {
  ModelAttemptAttribution,
  ModelAttemptAttributionIssue,
  ModelAttemptExecutionEvidence,
  ModelAttemptMode,
  ModelAttemptObservationIssue,
  ModelAttemptPromptIdentity,
} from "../contracts";
import { LEGACY_UNKNOWN_ATTRIBUTION } from "../contracts";

export interface ModelAttemptRequestContextInput {
  mode: Exclude<ModelAttemptMode, "legacy_unknown">;
  prompt?: Partial<ModelAttemptPromptIdentity>;
  /**
   * Explicit product attribution captured at the request boundary. The
   * absence of this value is intentional for legacy/other entry points.
   */
  attribution?: ModelAttemptAttribution;
  attributionIssue?: ModelAttemptAttributionIssue;
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
  /** A conflicting nested context must never be merged into the request fact. */
  attributionIssue?: ModelAttemptAttributionIssue;
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

function cloneAttribution(attribution: ModelAttemptAttribution): ModelAttemptAttribution {
  return { ...attribution };
}

function isDirectorAttribution(attribution: ModelAttemptAttribution): boolean {
  return attribution.source === "director_runtime" && attribution.kind === "auto_director";
}

function sameAttribution(left: ModelAttemptAttribution, right: ModelAttemptAttribution): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyNestedAttribution(
  state: ModelAttemptRequestState,
  incoming: ModelAttemptAttribution,
): void {
  if (sameAttribution(state.attribution, incoming)) {
    return;
  }

  if (state.attributionIssue && state.attribution.kind === "unattributed") {
    return;
  }

  // A complete director frame is the only source allowed to dominate a
  // nested prompt invocation. It is captured before any physical attempt is
  // opened; after that point a disagreement is recorded as a conflict rather
  // than silently selecting whichever object arrived last.
  if (isDirectorAttribution(state.attribution)) {
    if (!isDirectorAttribution(incoming)) {
      return;
    }
  } else if (isDirectorAttribution(incoming) && state.nextAttemptIndex === 0) {
    state.attribution = cloneAttribution(incoming);
    return;
  }

  state.attribution = { ...LEGACY_UNKNOWN_ATTRIBUTION };
  state.attributionIssue = "nested_attribution_conflict";
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
  const existing = requestStore.getStore();
  if (existing) {
    // The director boundary does not know whether its node will invoke or
    // stream. Let the first concrete prompt boundary establish the mode,
    // while keeping a request stable once a physical attempt exists.
    if (existing.nextAttemptIndex === 0 && existing.mode !== input.mode) {
      existing.mode = input.mode;
    }
    if (input.attribution) {
      applyNestedAttribution(existing, input.attribution);
    }
    if (input.attributionIssue) {
      existing.attributionIssue = input.attributionIssue;
    }
    return operation();
  }
  return requestStore.run({
    requestId: randomUUID(),
    mode: input.mode,
    attribution: input.attribution
      ? cloneAttribution(input.attribution)
      : { ...LEGACY_UNKNOWN_ATTRIBUTION },
    prompt: createPromptIdentity(input.prompt),
    nextAttemptIndex: 0,
    lastAttemptId: null,
    successfulEvidenceWrites: 0,
    observationIssues: [],
    attributionIssue: input.attributionIssue,
  }, operation);
}

/**
 * Build attribution only for the three explicitly contracted prompt entry
 * points. No URL, label, model setting, or ambient usage metadata is used.
 */
export function buildPromptInvocationAttribution(input: {
  novelId?: string | null;
  chapterId?: string | null;
  entrypoint?: string | null;
}): ModelAttemptAttribution | undefined {
  const novelId = input.novelId?.trim() || null;
  const chapterId = input.chapterId?.trim() || null;
  const entrypoint = input.entrypoint?.trim() || null;
  if (entrypoint === "novel-world-generate") {
    return {
      kind: "novel_world_generate",
      source: "prompt_invocation",
      novelId,
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId: null,
      entrypoint,
    };
  }
  if (entrypoint === "ai-revision-preview") {
    return {
      kind: "ai_revision_preview",
      source: "prompt_invocation",
      novelId,
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId,
      entrypoint,
    };
  }
  return undefined;
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
    ...(state.attributionIssue ? { attributionIssue: state.attributionIssue } : {}),
  };
}
