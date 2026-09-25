import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { classifyStructuredOutputFailure } from "../../../llm/structuredOutput";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import {
  LlmRequestBudgetError,
  type LlmRequestBudgetSnapshot,
} from "../../../llm/requestBudget";
import {
  recordPromptQualityEvent,
  type PromptQualityFailureKind,
} from "../promptQualityTelemetry";
import type {
  PromptAsset,
  PromptInvocationMeta,
  PromptRenderContext,
  PromptRunResult,
} from "../promptTypes";

export function stringifyPromptError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return String(error);
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function estimateOutputChars(output: unknown): number {
  if (typeof output === "string") {
    return output.length;
  }
  return safeJsonStringify(output).length;
}

export function isPromptOutputEmpty(output: unknown): boolean {
  return typeof output === "string" && output.trim().length === 0;
}

export function markPromptQualityFailure(error: unknown, failureKind: PromptQualityFailureKind): unknown {
  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, "promptQualityFailureKind", {
        value: failureKind,
        configurable: true,
      });
    } catch {
      // Ignore non-extensible errors.
    }
  }
  return error;
}

export function classifyPromptQualityFailure(error: unknown): PromptQualityFailureKind {
  if (error instanceof LlmRequestBudgetError) {
    return "budget_exceeded";
  }
  const marked = error as { promptQualityFailureKind?: unknown };
  if (
    marked
    && typeof marked === "object"
    && (
      marked.promptQualityFailureKind === "llm_error"
      || marked.promptQualityFailureKind === "schema_repair_failed"
      || marked.promptQualityFailureKind === "post_validate_failed"
      || marked.promptQualityFailureKind === "empty_output"
      || marked.promptQualityFailureKind === "unknown"
    )
  ) {
    return marked.promptQualityFailureKind;
  }
  if (classifyStructuredOutputFailure({ error }) === "request_too_large") {
    return "request_too_large";
  }
  const message = stringifyPromptError(error).toLowerCase();
  if (message.includes("schema") || message.includes("json") || message.includes("zod") || message.includes("structured")) {
    return "schema_repair_failed";
  }
  if (message.includes("postvalidate") || message.includes("semantic")) {
    return "post_validate_failed";
  }
  return "llm_error";
}

export function logPromptCompletion(input: {
  meta: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
}): void {
  console.info(
    [
      "[prompt.runner]",
      `promptId=${input.meta.promptId}`,
      `promptVersion=${input.meta.promptVersion}`,
      `taskType=${input.meta.taskType}`,
      input.meta.novelId ? `novelId=${input.meta.novelId}` : "",
      input.meta.chapterId ? `chapterId=${input.meta.chapterId}` : "",
      input.meta.stage ? `stage=${input.meta.stage}` : "",
      typeof input.meta.sceneIndex === "number" ? `sceneIndex=${input.meta.sceneIndex}` : "",
      typeof input.meta.roundIndex === "number" ? `roundIndex=${input.meta.roundIndex}` : "",
      input.meta.triggerReason ? `triggerReason=${JSON.stringify(input.meta.triggerReason)}` : "",
      `contextBlockIds=${input.meta.contextBlockIds.join(",") || "none"}`,
      `droppedContextBlockIds=${input.meta.droppedContextBlockIds.join(",") || "none"}`,
      `summarizedContextBlockIds=${input.meta.summarizedContextBlockIds.join(",") || "none"}`,
      `estimatedInputTokens=${input.meta.estimatedInputTokens}`,
      `repairUsed=${input.meta.repairUsed}`,
      `repairAttempts=${input.meta.repairAttempts}`,
      `semanticRetryUsed=${input.meta.semanticRetryUsed}`,
      `semanticRetryAttempts=${input.meta.semanticRetryAttempts}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      `latencyMs=${input.latencyMs}`,
    ].join(" "),
  );
}

export function logPromptEvent(input: {
  event: string;
  asset: PromptAsset<unknown, unknown, unknown>;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  attempt?: number;
  validationError?: string;
}): void {
  console.info(
    [
      "[prompt.runner]",
      `event=${input.event}`,
      `promptId=${input.asset.id}`,
      `promptVersion=${input.asset.version}`,
      `taskType=${input.asset.taskType}`,
      `contextBlockIds=${input.context.selectedBlockIds.join(",") || "none"}`,
      `estimatedInputTokens=${input.context.estimatedInputTokens}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      typeof input.attempt === "number" ? `attempt=${input.attempt}` : "",
      input.validationError ? `validationError=${JSON.stringify(input.validationError.slice(0, 240))}` : "",
    ].filter(Boolean).join(" "),
  );
}

export function recordPromptCompletion(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  output: unknown;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  renderedPromptChars?: number;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  postValidateFailureRecovered?: boolean;
  requestBudget?: LlmRequestBudgetSnapshot;
}): void {
  recordPromptQualityEvent({
    event: "completed",
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    mode: input.asset.mode,
    provider: input.provider,
    model: input.model,
    stage: input.invocation.stage,
    entrypoint: input.invocation.entrypoint,
    latencyMs: input.latencyMs,
    estimatedInputTokens: input.context.estimatedInputTokens,
    renderedPromptChars: input.renderedPromptChars,
    outputChars: estimateOutputChars(input.output),
    repairUsed: input.invocation.repairUsed,
    repairAttempts: input.invocation.repairAttempts,
    semanticRetryUsed: input.invocation.semanticRetryUsed,
    semanticRetryAttempts: input.invocation.semanticRetryAttempts,
    postValidateFailureRecovered: input.postValidateFailureRecovered,
    emptyOutput: isPromptOutputEmpty(input.output),
    tokenUsage: input.tokenUsage,
    requestBudget: input.requestBudget,
  });
}

export function recordPromptFailure(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  renderedPromptChars?: number;
  error: unknown;
  requestBudget?: LlmRequestBudgetSnapshot;
}): void {
  recordPromptQualityEvent({
    event: "failed",
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    mode: input.asset.mode,
    provider: input.provider,
    model: input.model,
    stage: input.invocation.stage,
    entrypoint: input.invocation.entrypoint,
    latencyMs: input.latencyMs,
    estimatedInputTokens: input.context.estimatedInputTokens,
    renderedPromptChars: input.renderedPromptChars,
    repairUsed: input.invocation.repairUsed,
    repairAttempts: input.invocation.repairAttempts,
    semanticRetryUsed: input.invocation.semanticRetryUsed,
    semanticRetryAttempts: input.invocation.semanticRetryAttempts,
    failureKind: classifyPromptQualityFailure(input.error),
    requestBudget: input.requestBudget,
  });
}

export function buildPromptRunResult<T>(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  output: T;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  invocation: PromptInvocationMeta;
  renderedPromptChars?: number;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  postValidateFailureRecovered?: boolean;
  requestBudget?: LlmRequestBudgetSnapshot;
}): PromptRunResult<T> {
  const meta = {
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    invocation: input.invocation,
    tokenUsage: input.tokenUsage ?? null,
    requestBudget: input.requestBudget,
  };
  logPromptCompletion({
    meta: input.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
  });
  recordPromptCompletion({
    asset: input.asset,
    output: input.output,
    context: input.context,
    invocation: input.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
    renderedPromptChars: input.renderedPromptChars,
    tokenUsage: input.tokenUsage,
    postValidateFailureRecovered: input.postValidateFailureRecovered,
    requestBudget: input.requestBudget,
  });
  return {
    output: input.output,
    meta,
    context: input.context,
  };
}
