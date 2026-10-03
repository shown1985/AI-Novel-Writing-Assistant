import type {
  LLMProvider,
  ModelSelectionAdjustment,
  ModelSelectionFieldProvenance,
  ModelSelectionProvenance,
  ModelSelectionSource,
} from "@ai-novel/shared/types/llm";

export type {
  ModelAttemptLineage,
  ModelAttemptRole,
  ModelRouteDegradedReason,
  ModelSelectionAdjustment,
  ModelSelectionAdjustmentKind,
  ModelSelectionFieldProvenance,
  ModelSelectionProvenance,
  ModelSelectionSource,
} from "@ai-novel/shared/types/llm";

export function createModelSelectionField<T>(input: {
  requested: T | null | undefined;
  effective?: T | null | undefined;
  source: ModelSelectionSource;
  adjustments?: ModelSelectionAdjustment<T>[];
}): ModelSelectionFieldProvenance<T> {
  const hasEffective = Object.prototype.hasOwnProperty.call(input, "effective");
  return {
    requested: input.requested ?? null,
    effective: hasEffective ? input.effective ?? null : input.requested ?? null,
    source: input.source,
    adjustments: [...(input.adjustments ?? [])],
  };
}

export function appendModelSelectionAdjustment<T>(
  field: ModelSelectionFieldProvenance<T>,
  adjustment: ModelSelectionAdjustment<T>,
): ModelSelectionFieldProvenance<T> {
  return {
    ...field,
    effective: adjustment.after,
    adjustments: [...field.adjustments, adjustment],
  };
}

export function createUnknownModelSelectionProvenance(input: {
  provider?: LLMProvider | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  routeKey?: string | null;
} = {}): ModelSelectionProvenance {
  return {
    provider: createModelSelectionField({
      requested: null,
      effective: input.provider,
      source: "unknown",
    }),
    model: createModelSelectionField({
      requested: null,
      effective: input.model,
      source: "unknown",
    }),
    temperature: createModelSelectionField({
      requested: null,
      effective: input.temperature,
      source: "unknown",
    }),
    maxTokens: createModelSelectionField({
      requested: null,
      effective: input.maxTokens,
      source: "unknown",
    }),
    routeKey: input.routeKey ?? null,
    routeDegraded: false,
    routeDegradedReason: null,
  };
}

/** Return a detached public value containing only fields allowed by the shared contract. */
export function projectModelSelectionProvenance(
  provenance: ModelSelectionProvenance,
): ModelSelectionProvenance {
  const cloneField = <T>(field: ModelSelectionFieldProvenance<T>): ModelSelectionFieldProvenance<T> => ({
    requested: field.requested,
    effective: field.effective,
    source: field.source,
    adjustments: field.adjustments.map((adjustment) => ({ ...adjustment })),
  });
  return {
    provider: cloneField(provenance.provider),
    model: cloneField(provenance.model),
    temperature: cloneField(provenance.temperature),
    maxTokens: cloneField(provenance.maxTokens),
    routeKey: provenance.routeKey,
    routeDegraded: provenance.routeDegraded,
    routeDegradedReason: provenance.routeDegradedReason,
  };
}

export {
  getModelAttemptExecutionEvidence,
  getModelAttemptRequestState,
  buildPromptInvocationAttribution,
  runWithModelAttemptRequestContext,
  runWithModelAttemptRequestState,
  startModelTransportAttempt,
  updateModelAttemptPromptIdentity,
  readModelAttemptRequest,
  projectModelAttemptRead,
  projectModelAttemptProvenance,
  setModelAttemptRepositoryForTests,
  type ModelAttemptCandidate,
  type ModelAttemptAttributionStatus,
  type ModelAttemptAttributionIssue,
  type ModelAttemptReadProjection,
  type ModelAttemptReadStatus,
} from "./attempts/runtime";
