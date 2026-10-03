export const LLM_PROVIDERS = [
  "deepseek",
  "siliconflow",
  "openai",
  "anthropic",
  "grok",
  "kimi",
  "minimax",
  "glm",
  "qwen",
  "gemini",
  "ollama",
] as const;

export type BuiltinLLMProvider = typeof LLM_PROVIDERS[number];
export type LLMProvider = BuiltinLLMProvider | (string & {});

export const REASONING_EFFORTS = ["low", "high", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const PROVIDER_AUTH_MODES = ["bearer", "x-api-key", "none"] as const;
export type ProviderAuthMode = typeof PROVIDER_AUTH_MODES[number];

export function isBuiltinLLMProvider(provider: string): provider is BuiltinLLMProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(provider);
}

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  name: string;
  provider: LLMProvider;
  baseURL: string;
  defaultModel: string;
  models: string[];
  envKey: string;
}

export type ModelSelectionSource =
  | "explicit_request"
  | "task_route"
  | "task_route_default"
  | "provider_configuration"
  | "environment"
  | "built_in_default"
  | "fallback_default"
  | "system_default"
  | "unknown";

export type ModelSelectionAdjustmentKind =
  | "provider_limit"
  | "legacy_4096_unset"
  | "capability_fixed"
  | "capability_clamped_min"
  | "capability_clamped_max"
  | "structured_cap"
  | "structured_omit";

export interface ModelSelectionAdjustment<T = string | number | null> {
  kind: ModelSelectionAdjustmentKind;
  /** Provider whose deterministic compatibility rule produced this adjustment. */
  provider: LLMProvider;
  before: T | null;
  after: T | null;
  reason: string;
}

export interface ModelSelectionFieldProvenance<T> {
  requested: T | null;
  effective: T | null;
  source: ModelSelectionSource;
  adjustments: ModelSelectionAdjustment<T>[];
}

export type ModelRouteDegradedReason =
  | "strict_route_not_configured"
  | "route_lookup_failed"
  | null;

/**
 * Sanitized field-level evidence produced by the resolver itself.
 * It intentionally excludes credentials, endpoints, auth modes and request/session metadata.
 */
export interface ModelSelectionProvenance {
  provider: ModelSelectionFieldProvenance<LLMProvider>;
  model: ModelSelectionFieldProvenance<string>;
  temperature: ModelSelectionFieldProvenance<number>;
  maxTokens: ModelSelectionFieldProvenance<number>;
  routeKey: string | null;
  routeDegraded: boolean;
  routeDegradedReason: ModelRouteDegradedReason;
}

export type ModelAttemptRole = "primary" | "retry" | "repair" | "fallback" | "unknown";

/** S2-04a freezes lineage shape only; later stories attach and persist identifiers. */
export interface ModelAttemptLineage {
  requestId: string | null;
  attemptId: string | null;
  parentAttemptId: string | null;
  attemptIndex: number | null;
  role: ModelAttemptRole;
}

/**
 * Public, read-only model-attempt evidence used by the live execution view.
 * Keep this contract deliberately smaller than the server-side attempt record:
 * prompt identity, usage, attribution identity, and provider response details
 * never cross this boundary.
 */
export type LlmAttemptProvenanceStatus = "found" | "not_found" | "error";
export type LlmAttemptAttributionStatus = "complete" | "partial" | "unattributed";
export type LlmAttemptProvenanceRole = ModelAttemptRole;
export type LlmAttemptProvenanceRouteTier = "primary" | "fallback" | "unknown";
export type LlmAttemptProvenanceAttemptStatus = "started" | "succeeded" | "failed" | "cancelled" | "unknown";
export type LlmAttemptProvenanceAdoption = "pending" | "adopted" | "not_adopted" | "unknown";
export type LlmAttemptFailureCategory = "transport" | "timeout" | "cancelled" | "validation" | "unknown";
export type LlmAttemptFailureCode =
  | "transport_unknown"
  | "transport_error"
  | "upstream_timeout"
  | "stream_missing_output"
  | "request_cancelled"
  | "validation_failed"
  | "rate_limited"
  | "authentication_failed"
  | "provider_unavailable";

export interface LlmAttemptProvenanceAttempt {
  attemptId: string;
  parentAttemptId: string | null;
  attemptIndex: number;
  role: LlmAttemptProvenanceRole;
  routeTier: LlmAttemptProvenanceRouteTier;
  status: LlmAttemptProvenanceAttemptStatus;
  finalAdoption: LlmAttemptProvenanceAdoption;
  provider: string | null;
  model: string | null;
  failureCode: LlmAttemptFailureCode | null;
  failureCategory: LlmAttemptFailureCategory | null;
  retryable: boolean | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface LlmAttemptProvenance {
  status: LlmAttemptProvenanceStatus;
  requestId: string;
  attributionStatus: LlmAttemptAttributionStatus;
  adoptedAttemptId: string | null;
  attempts: LlmAttemptProvenanceAttempt[];
}
