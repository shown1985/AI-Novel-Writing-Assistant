import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  resolveLlmRequestCapabilities,
  type LlmCapabilityValueSource,
  type LlmRequestCapabilities,
} from "./requestCapabilities";

/**
 * A conservative, provider-agnostic request budget estimate.
 *
 * This is deliberately a soft policy. Providers expose different tokenizers
 * and context limits, so the estimate is useful for telemetry and a future
 * preflight gate, but must not be treated as an exact provider response.
 */

export type LlmRequestBudgetStatus = "unknown" | "ok" | "near_limit" | "exceeds_limit";

export interface LlmRequestBudgetInput {
  renderedPromptChars: number;
  inputTokenLimit?: number;
  safetyMarginTokens?: number;
  maxTokens?: number;
  provider?: LLMProvider;
  model?: string;
  baseURL?: string;
  capabilities?: LlmRequestCapabilities;
}

export interface LlmRequestBudgetSnapshot {
  estimatedInputTokens: number;
  inputTokenLimit: number | null;
  effectiveInputTokenLimit: number | null;
  safetyMarginTokens: number;
  requestedOutputTokens: number | null;
  estimatedTotalTokens: number | null;
  utilization: number | null;
  status: LlmRequestBudgetStatus;
  capabilityKey: string | null;
  inputTokenLimitSource: LlmCapabilityValueSource;
  outputTokenLimit: number | null;
  outputTokenLimitSource: LlmCapabilityValueSource;
  outputLimitExceeded: boolean;
}

const DEFAULT_CHARS_PER_TOKEN = 4;
const DEFAULT_SAFETY_MARGIN_TOKENS = 256;
const NEAR_LIMIT_RATIO = 0.8;

function normalizeNonNegativeInteger(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

/**
 * Estimate tokens without pulling a provider-specific tokenizer into the
 * request path. Chinese prompts usually use fewer characters per token than
 * English prompts; four is intentionally conservative for a preflight hint.
 */
export function estimatePromptTokensFromChars(chars: number): number {
  const normalizedChars = normalizeNonNegativeInteger(chars);
  return Math.ceil(normalizedChars / DEFAULT_CHARS_PER_TOKEN);
}

export function evaluateLlmRequestBudget(input: LlmRequestBudgetInput): LlmRequestBudgetSnapshot {
  const estimatedInputTokens = estimatePromptTokensFromChars(input.renderedPromptChars);
  const capabilities = input.capabilities ?? (input.provider
    ? resolveLlmRequestCapabilities({
      provider: input.provider,
      model: input.model,
      baseURL: input.baseURL,
      inputTokenLimit: input.inputTokenLimit,
    })
    : null);
  const explicitInputTokenLimit = normalizePositiveInteger(input.inputTokenLimit);
  const inputTokenLimit = explicitInputTokenLimit ?? capabilities?.inputTokenLimit ?? null;
  const inputTokenLimitSource: LlmCapabilityValueSource = explicitInputTokenLimit != null
    ? "explicit"
    : capabilities?.inputTokenLimitSource ?? "unknown";
  const requestedOutputTokens = normalizePositiveInteger(input.maxTokens);
  const outputTokenLimit = capabilities?.outputTokenLimit ?? null;
  const outputLimitExceeded = outputTokenLimit != null
    && requestedOutputTokens != null
    && requestedOutputTokens > outputTokenLimit;
  const safetyMarginTokens = inputTokenLimit == null
    ? 0
    : Math.min(
      normalizeNonNegativeInteger(input.safetyMarginTokens, DEFAULT_SAFETY_MARGIN_TOKENS),
      Math.max(0, inputTokenLimit - 1),
    );
  const effectiveInputTokenLimit = inputTokenLimit == null
    ? null
    : Math.max(1, inputTokenLimit - safetyMarginTokens);
  const estimatedTotalTokens = requestedOutputTokens == null
    ? null
    : estimatedInputTokens + requestedOutputTokens;

  if (effectiveInputTokenLimit == null) {
    return {
      estimatedInputTokens,
      inputTokenLimit,
      effectiveInputTokenLimit,
      safetyMarginTokens,
      requestedOutputTokens,
      estimatedTotalTokens,
      utilization: null,
      status: "unknown",
      capabilityKey: capabilities?.capabilityKey ?? null,
      inputTokenLimitSource,
      outputTokenLimit,
      outputTokenLimitSource: capabilities?.outputTokenLimitSource ?? "unknown",
      outputLimitExceeded,
    };
  }

  const utilization = estimatedInputTokens / effectiveInputTokenLimit;
  const status: LlmRequestBudgetStatus = utilization >= 1
    ? "exceeds_limit"
    : utilization >= NEAR_LIMIT_RATIO
      ? "near_limit"
      : "ok";

  return {
    estimatedInputTokens,
    inputTokenLimit,
    effectiveInputTokenLimit,
    safetyMarginTokens,
    requestedOutputTokens,
    estimatedTotalTokens,
    utilization,
    status,
    capabilityKey: capabilities?.capabilityKey ?? null,
    inputTokenLimitSource,
    outputTokenLimit,
    outputTokenLimitSource: capabilities?.outputTokenLimitSource ?? "unknown",
    outputLimitExceeded,
  };
}

export class LlmRequestBudgetError extends Error {
  readonly code = "LLM_REQUEST_BUDGET_EXCEEDED";

  readonly budget: LlmRequestBudgetSnapshot;

  constructor(budget: LlmRequestBudgetSnapshot) {
    super(
      [
        "[LLM_BUDGET] 渲染后的提示内容超过本阶段输入预算。",
        `估算输入 ${budget.estimatedInputTokens} tokens，软上限 ${budget.effectiveInputTokenLimit ?? "未设置"} tokens。`,
        "请减少可选上下文或拆分生成阶段后重试。",
      ].join(" "),
    );
    this.name = "LlmRequestBudgetError";
    this.budget = budget;
  }
}
