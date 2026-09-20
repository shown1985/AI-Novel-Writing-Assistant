import type { BaseMessage, BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getLLM, getResolvedLLMClientOptionsFromInstance } from "../../llm/factory";
import {
  invokeStructuredLlmDetailed,
} from "../../llm/structuredInvoke";
import {
  buildStructuredResponseFormat,
  classifyStructuredOutputFailure,
  resolveStructuredOutputProfile,
  selectStructuredOutputStrategy,
} from "../../llm/structuredOutput";
import type { LlmTokenUsageSnapshot } from "../../llm/usageTracking";
import { logMemoryUsage } from "../../runtime/memoryTelemetry";
import { toText } from "../../services/novel/novelP0Utils";
import { beginLlmLiveSession } from "../../platform/llm/live/llmLiveSession";
import { resolveAdvancedPromptMessages } from "../templates/templateRuntime";
import { selectContextBlocks } from "./contextSelection";
import {
  recordPromptQualityEvent,
  type PromptQualityFailureKind,
} from "./promptQualityTelemetry";
import { appendStructuredOutputHintMessages } from "./structuredOutputHint";
import {
  captureStreamOutput,
  executeTextPrompt,
  executeTextPromptStream,
  preparePromptExecution,
  resolvePromptOverlaysForAsset,
  resolveStructuredOutput,
  resolveStructuredRepairAttempts,
  resolveStructuredStreamOutput,
} from "./execution";
import {
  evaluateLlmRequestBudget,
  LlmRequestBudgetError,
  type LlmRequestBudgetSnapshot,
} from "../../llm/requestBudget";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptInvocationMeta,
  PromptRenderContext,
  PromptRunResult,
  PromptStreamRunResult,
} from "./promptTypes";
import {
  buildPromptInvocationAttribution,
  getModelAttemptExecutionEvidence,
  getModelAttemptRequestState,
  runWithModelAttemptRequestContext,
  runWithModelAttemptRequestState,
  startModelTransportAttempt,
  type ModelAttemptCandidate,
} from "../../platform/llm/provenance";

type PromptRunnerLLMFactory = typeof getLLM;
type PromptRunnerStructuredInvoker = typeof invokeStructuredLlmDetailed;

let promptRunnerLLMFactory: PromptRunnerLLMFactory = getLLM;
let promptRunnerStructuredInvoker: PromptRunnerStructuredInvoker = invokeStructuredLlmDetailed;

function stringifyPromptError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return String(error);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function estimateRenderedPromptChars(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + toText(message.content).length, 0);
}

function estimateOutputChars(output: unknown): number {
  if (typeof output === "string") {
    return output.length;
  }
  return safeJsonStringify(output).length;
}

function isPromptOutputEmpty(output: unknown): boolean {
  return typeof output === "string" && output.trim().length === 0;
}

function classifyPromptQualityFailure(error: unknown): PromptQualityFailureKind {
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

export { preparePromptExecution };

function logPromptCompletion(input: {
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

function logPromptEvent(input: {
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

function logPromptBudget(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  budget: LlmRequestBudgetSnapshot;
  stage?: string;
  provider?: LLMProvider;
  model?: string;
}): void {
  console.info(
    [
      "[prompt.budget]",
      `promptId=${input.asset.id}`,
      `promptVersion=${input.asset.version}`,
      input.stage ? `stage=${input.stage}` : "",
      input.provider ? `provider=${input.provider}` : "",
      input.model ? `model=${input.model}` : "",
      `estimatedInputTokens=${input.budget.estimatedInputTokens}`,
      `inputTokenLimit=${input.budget.effectiveInputTokenLimit ?? "unknown"}`,
      `inputTokenLimitSource=${input.budget.inputTokenLimitSource}`,
      `requestedOutputTokens=${input.budget.requestedOutputTokens ?? "unknown"}`,
      `outputTokenLimit=${input.budget.outputTokenLimit ?? "unknown"}`,
      `outputLimitExceeded=${input.budget.outputLimitExceeded}`,
      `capabilityKey=${input.budget.capabilityKey ?? "unknown"}`,
      `status=${input.budget.status}`,
    ].filter(Boolean).join(" "),
  );
}

function recordPromptCompletion(input: {
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

function recordPromptFailure(input: {
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

function buildPromptRunResult<T>(input: {
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
  attemptEvidence?: ReturnType<typeof getModelAttemptExecutionEvidence>;
}): PromptRunResult<T> {
  const meta = {
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    invocation: input.invocation,
    tokenUsage: input.tokenUsage ?? null,
    requestBudget: input.requestBudget,
    attemptEvidence: input.attemptEvidence,
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

export async function runStructuredPrompt<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<O>> {
  return runWithModelAttemptRequestContext({
    mode: "invoke",
    prompt: {
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      taskType: input.asset.taskType,
    },
    attribution: buildPromptInvocationAttribution({
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      entrypoint: input.options?.entrypoint,
    }),
  }, () => runStructuredPromptInContext(input));
}

async function runStructuredPromptInContext<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<O>> {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a structured prompt.`);
  }

  const outputSchema = input.asset.outputSchema;
  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const resolvedTemplateMessages = await resolveAdvancedPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const messages = resolvedTemplateMessages === prepared.messages
    ? prepared.messages
    : appendStructuredOutputHintMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    messages: resolvedTemplateMessages,
  });
  logPromptEvent({
    event: "started",
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    context: prepared.context,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  const startedAt = Date.now();
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const requestBudget = evaluateLlmRequestBudget({
    renderedPromptChars,
    inputTokenLimit: input.options?.requestBudget?.inputTokenLimit,
    safetyMarginTokens: input.options?.requestBudget?.safetyMarginTokens,
    maxTokens: input.options?.maxTokens,
    provider: input.options?.provider,
    model: input.options?.model,
    baseURL: input.options?.baseURL,
  });
  logPromptBudget({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    budget: requestBudget,
    stage: input.options?.stage,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  try {
    if (
      input.options?.requestBudget?.mode === "reject"
      && requestBudget.status === "exceeds_limit"
    ) {
      throw new LlmRequestBudgetError(requestBudget);
    }
    const result = await promptRunnerStructuredInvoker<R>({
      label: `${input.asset.id}@${input.asset.version}`,
      provider: input.options?.provider,
      model: input.options?.model,
      baseURL: input.options?.baseURL,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      signal: input.options?.signal,
      sessionId: input.options?.sessionId,
      reasoningEnabled: input.options?.reasoningEnabled,
      reasoningEffort: input.options?.reasoningEffort,
      taskType: input.asset.taskType,
      messages,
      schema: outputSchema,
      deferModelAttemptAdoption: true,
      maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
      promptMeta: prepared.invocation,
    });
    logMemoryUsage({
      event: "structured_invoke_done",
      component: "runStructuredPrompt",
      taskId: input.options?.taskId,
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      volumeId: input.options?.volumeId,
      stage: input.options?.stage,
      itemKey: input.options?.itemKey,
      scope: input.options?.scope ?? input.options?.triggerReason,
      entrypoint: input.options?.entrypoint,
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      provider: input.options?.provider,
      model: input.options?.model,
      renderedPromptChars,
    });
    const resolved = await resolveStructuredOutput({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      baseMessages: messages,
      outputSchema,
      initialResult: result,
      structuredInvoker: promptRunnerStructuredInvoker,
      options: input.options,
    });
    logMemoryUsage({
      event: "before_prompt_result_return",
      component: "runStructuredPrompt",
      taskId: input.options?.taskId,
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      volumeId: input.options?.volumeId,
      stage: input.options?.stage,
      itemKey: input.options?.itemKey,
      scope: input.options?.scope ?? input.options?.triggerReason,
      entrypoint: input.options?.entrypoint,
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      provider: input.options?.provider,
      model: input.options?.model,
      renderedPromptChars,
    });
    return buildPromptRunResult({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      output: resolved.output,
      context: prepared.context,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      invocation: resolved.invocation,
      renderedPromptChars,
      tokenUsage: result.tokenUsage,
      postValidateFailureRecovered: resolved.postValidateFailureRecovered,
      requestBudget,
      attemptEvidence: getModelAttemptExecutionEvidence(),
    });
  } catch (error) {
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
      requestBudget,
    });
    throw error;
  }
}

export async function runTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<string>> {
  return executeTextPrompt(input, {
    llmFactory: promptRunnerLLMFactory,
    buildResult: buildPromptRunResult,
    recordFailure: recordPromptFailure,
  });
}

export async function streamTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<string>> {
  return executeTextPromptStream(input, {
    llmFactory: promptRunnerLLMFactory,
    buildResult: buildPromptRunResult,
    recordFailure: recordPromptFailure,
  });
}

export async function streamStructuredPrompt<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<O>> {
  return runWithModelAttemptRequestContext({
    mode: "stream",
    prompt: {
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      taskType: input.asset.taskType,
    },
    attribution: buildPromptInvocationAttribution({
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      entrypoint: input.options?.entrypoint,
    }),
  }, () => streamStructuredPromptInContext(input));
}

async function streamStructuredPromptInContext<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<O>> {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a structured prompt.`);
  }

  const outputSchema = input.asset.outputSchema;
  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const startedAt = Date.now();
  const renderedPromptChars = estimateRenderedPromptChars(prepared.messages);
  const requestState = getModelAttemptRequestState();
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "structured",
    requestId: requestState?.requestId ?? null,
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  let strategy!: ReturnType<typeof selectStructuredOutputStrategy>;
  let profile!: ReturnType<typeof resolveStructuredOutputProfile>;
  let modelAttempt: ModelAttemptCandidate | null = null;
  let transportCompleted = false;
  let transportUsage: LlmTokenUsageSnapshot | null = null;
  try {
    const llm = await promptRunnerLLMFactory(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      baseURL: input.options?.baseURL,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
      executionMode: "structured",
    });
    const resolvedLLM = getResolvedLLMClientOptionsFromInstance(llm);
    profile = resolvedLLM?.structuredProfile ?? resolveStructuredOutputProfile({
      provider: resolvedLLM?.provider ?? input.options?.provider ?? "deepseek",
      model: resolvedLLM?.model ?? input.options?.model,
      baseURL: resolvedLLM?.baseURL,
      requestProtocol: resolvedLLM?.requestProtocol,
      executionMode: "structured",
    });
    strategy = resolvedLLM?.structuredStrategy ?? selectStructuredOutputStrategy(profile, outputSchema);
    modelAttempt = await startModelTransportAttempt({
      provider: resolvedLLM?.provider ?? input.options?.provider ?? "unknown",
      model: resolvedLLM?.model ?? input.options?.model ?? "unknown",
      modelRoute: resolvedLLM?.modelRoute ?? null,
      structuredStrategy: strategy,
    });
    const invokeOptions: Record<string, unknown> = {};
    const responseFormat = buildStructuredResponseFormat({
      strategy,
      schema: outputSchema,
      label: `${input.asset.id}@${input.asset.version}`,
    });
    if (responseFormat) {
      invokeOptions.response_format = responseFormat;
    }
    if (input.options?.signal) {
      invokeOptions.signal = input.options.signal;
    }
    liveSession.phase("streaming", "模型正在返回结构化结果");
    const rawStream = await llm.stream(prepared.messages, invokeOptions);
    captured = captureStreamOutput(
      rawStream as AsyncIterable<BaseMessageChunk>,
      (content) => liveSession.delta(content),
      (content) => liveSession.reasoning(content),
      async (terminal) => {
        const runTerminal = () => {
          transportUsage = terminal.usage;
          if (terminal.status === "completed") {
            transportCompleted = true;
            return;
          }
          if (terminal.status === "cancelled") {
            return modelAttempt?.finalizeCancelled();
          }
          return modelAttempt?.finalizeFailed(terminal.error, input.options?.signal);
        };
        if (requestState) {
          return runWithModelAttemptRequestState(requestState, runTerminal);
        }
        return runTerminal();
      },
    );
  } catch (error) {
    if (requestState) {
      await runWithModelAttemptRequestState(
        requestState,
        () => modelAttempt?.finalizeFailed(error, input.options?.signal),
      );
    } else {
      await modelAttempt?.finalizeFailed(error, input.options?.signal);
    }
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }

  return {
    stream: captured.stream,
    complete: captured.completedText.then(async (rawContent) => {
      const runComplete = async (): Promise<PromptRunResult<O>> => {
        liveSession.phase("validating", "正在检查生成结果");
        const parsed = await resolveStructuredStreamOutput({
          rawContent,
          asset: input.asset,
          messages: prepared.messages,
          outputSchema,
          invocation: prepared.invocation,
          structuredInvoker: promptRunnerStructuredInvoker,
          strategy,
          profile,
          options: input.options,
          modelAttemptCandidate: modelAttempt,
          onRepairStart: () => liveSession.phase("repairing", "正在修复生成结果"),
          onRepairOutputDelta: (content) => liveSession.delta(content),
        });
        const resolved = await resolveStructuredOutput({
          asset: input.asset,
          promptInput: input.promptInput,
          context: prepared.context,
          baseMessages: prepared.messages,
          outputSchema,
          initialResult: parsed,
          structuredInvoker: promptRunnerStructuredInvoker,
          options: input.options,
        });
        const tokenUsage = parsed.tokenUsage ?? await captured.completedUsage.catch(() => null);
        if (!parsed.modelAttemptCandidate) {
          await modelAttempt?.finalizeSucceeded(tokenUsage, "adopted");
        }
        const result = buildPromptRunResult({
          asset: input.asset as PromptAsset<unknown, unknown, unknown>,
          output: resolved.output,
          context: prepared.context,
          provider: input.options?.provider,
          model: input.options?.model,
          latencyMs: Date.now() - startedAt,
          invocation: resolved.invocation,
          renderedPromptChars,
          tokenUsage,
          postValidateFailureRecovered: resolved.postValidateFailureRecovered,
          attemptEvidence: getModelAttemptExecutionEvidence(),
        });
        liveSession.usage(tokenUsage ? {
          ...tokenUsage,
          reasoningTokens: tokenUsage.reasoningTokens ?? null,
        } : null);
        liveSession.complete();
        return result;
      };
      if (requestState) {
        return runWithModelAttemptRequestState(requestState, runComplete);
      }
      return runComplete();
    }).catch(async (error) => {
      const runFailure = async () => {
        if (transportCompleted) {
          await modelAttempt?.finalizeSucceeded(transportUsage, "not_adopted");
        } else {
          await modelAttempt?.finalizeFailed(error, input.options?.signal);
        }
        liveSession.fail(error);
        recordPromptFailure({
          asset: input.asset as PromptAsset<unknown, unknown, unknown>,
          context: prepared.context,
          invocation: prepared.invocation,
          provider: input.options?.provider,
          model: input.options?.model,
          latencyMs: Date.now() - startedAt,
          renderedPromptChars,
          error,
        });
        throw error;
      };
      if (requestState) {
        return runWithModelAttemptRequestState(requestState, runFailure);
      }
      return runFailure();
    }),
    context: prepared.context,
    invocation: prepared.invocation,
  };
}

export function setPromptRunnerLLMFactoryForTests(factory?: PromptRunnerLLMFactory): void {
  promptRunnerLLMFactory = factory ?? getLLM;
}

export function setPromptRunnerStructuredInvokerForTests(invoker?: PromptRunnerStructuredInvoker): void {
  promptRunnerStructuredInvoker = invoker ?? invokeStructuredLlmDetailed;
}
