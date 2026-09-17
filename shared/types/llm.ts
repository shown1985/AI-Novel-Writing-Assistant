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
