import type { BaseMessageChunk } from "@langchain/core/messages";
import { getResolvedLLMClientOptionsFromInstance } from "../../llm/factory";
import {
  parseStructuredLlmRawContentDetailed,
  formatLivePrompt,
} from "../../llm/structuredInvoke";
import {
  buildStructuredResponseFormat,
  resolveStructuredOutputProfile,
  selectStructuredOutputStrategy,
} from "../../llm/structuredOutput";
import {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
  type LlmTokenUsageSnapshot,
} from "../../llm/usageTracking";
import { logMemoryUsage } from "../../runtime/memoryTelemetry";
import { toText } from "../../services/novel/novelP0Utils";
import { beginLlmLiveSession } from "../../platform/llm/live/llmLiveSession";
import { ReasoningStreamCollector } from "../../llm/reasoning";
import { resolveAdvancedPromptMessages } from "../templates/templateRuntime";
import { selectContextBlocks } from "./contextSelection";
import { appendStructuredOutputHintMessages } from "./structuredOutputHint";
import {
  evaluateLlmRequestBudget,
  LlmRequestBudgetError,
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
  buildPromptCallOptions,
  getPromptRunnerLLMFactory,
  getPromptRunnerStructuredInvoker,
  setPromptRunnerLLMFactory,
  setPromptRunnerStructuredInvoker,
  type PromptRunnerLLMFactory,
  type PromptRunnerStructuredInvoker,
} from "./runner/llmBindings";
import {
  assertRegistered,
  buildPromptInvocationMeta,
  buildRenderContext,
} from "./runner/promptPreparation";
import { resolvePromptOverlaysForAsset } from "./runner/slotOverlays";
import { estimateRenderedPromptChars, logPromptBudget } from "./runner/requestBudget";
import {
  buildPromptRunResult,
  logPromptEvent,
  recordPromptFailure,
} from "./runner/promptTelemetry";
import { captureStreamOutput } from "./runner/streamCapture";
import {
  applyPromptPostValidate,
  resolveStructuredOutput,
  resolveStructuredRepairAttempts,
} from "./runner/outputResolution";

export function preparePromptExecution<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
  resolvedSlots?: import("../slots/slotTypes").ResolvedSlots;
}): {
  messages: ReturnType<PromptAsset<I, O, R>["render"]>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
} {
  assertRegistered(input.asset as PromptAsset<unknown, unknown, unknown>);
  const context = buildRenderContext(
    input.asset as PromptAsset<unknown, unknown, unknown>,
    input.contextBlocks ?? [],
    input.resolvedSlots,
  );
  const renderedMessages = input.asset.render(input.promptInput, context);
  return {
    messages: appendStructuredOutputHintMessages({
      asset: input.asset,
      promptInput: input.promptInput,
      context,
      messages: renderedMessages,
    }),
    context,
    invocation: buildPromptInvocationMeta(
      input.asset as PromptAsset<unknown, unknown, unknown>,
      context,
      false,
      0,
      false,
      0,
      input.options,
    ),
  };
}

export async function runStructuredPrompt<I, O, R = O>(input: {
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
    const result = await getPromptRunnerStructuredInvoker()<R>({
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
  if (input.asset.mode !== "text") {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a text prompt.`);
  }

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
  const messages = await resolveAdvancedPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "text",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
    promptText: formatLivePrompt(messages),
  });
  try {
    const llm = await getPromptRunnerLLMFactory()(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      baseURL: input.options?.baseURL,
      temperature: input.options?.temperature,
      reasoningEnabled: input.options?.reasoningEnabled,
      reasoningEffort: input.options?.reasoningEffort,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      sessionId: input.options?.sessionId,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
    });
    liveSession.phase("streaming", "模型正在返回内容");
    const stream = await llm.stream(messages, buildPromptCallOptions(input.options));
    let rawOutput = "";
    let tokenUsage: LlmTokenUsageSnapshot | null = null;
    const reasoningCollector = new ReasoningStreamCollector();
    for await (const chunk of stream) {
      const content = toText(chunk.content);
      rawOutput += content;
      liveSession.delta(content);
      liveSession.reasoning(reasoningCollector.push(chunk, content));
      tokenUsage = mergeStreamTokenUsage(tokenUsage, extractLlmTokenUsage(chunk));
    }
    liveSession.reasoning(reasoningCollector.flush());
    liveSession.phase("validating", "正在整理生成结果");
    const output = applyPromptPostValidate({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      rawOutput,
    });
    liveSession.usage(tokenUsage ? {
      ...tokenUsage,
      reasoningTokens: tokenUsage.reasoningTokens ?? null,
    } : null);
    liveSession.complete();
    return buildPromptRunResult({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      output,
      context: prepared.context,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      invocation: buildPromptInvocationMeta(
        input.asset as PromptAsset<unknown, unknown, unknown>,
        prepared.context,
        false,
        0,
        false,
        0,
        input.options,
      ),
      renderedPromptChars,
      tokenUsage,
    });
  } catch (error) {
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
}

export async function streamTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<string>> {
  if (input.asset.mode !== "text") {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a text prompt.`);
  }

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
  const messages = await resolveAdvancedPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "text",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
    promptText: formatLivePrompt(prepared.messages),
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  try {
    const llm = await getPromptRunnerLLMFactory()(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      baseURL: input.options?.baseURL,
      temperature: input.options?.temperature,
      reasoningEnabled: input.options?.reasoningEnabled,
      reasoningEffort: input.options?.reasoningEffort,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      sessionId: input.options?.sessionId,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
    });
    liveSession.phase("streaming", "模型正在返回内容");
    const rawStream = await llm.stream(messages, buildPromptCallOptions(input.options));
    captured = captureStreamOutput(
      rawStream as AsyncIterable<BaseMessageChunk>,
      (content) => liveSession.delta(content),
      (content) => liveSession.reasoning(content),
    );
  } catch (error) {
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
    complete: captured.completedText.then(async (content) => {
      liveSession.phase("validating", "正在整理生成结果");
      const output = applyPromptPostValidate({
        asset: input.asset,
        promptInput: input.promptInput,
        context: prepared.context,
        rawOutput: content,
      });
      const tokenUsage = await captured.completedUsage.catch(() => null);
      const result = buildPromptRunResult({
        asset: input.asset as PromptAsset<unknown, unknown, unknown>,
        output,
        context: prepared.context,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        invocation: buildPromptInvocationMeta(
          input.asset as PromptAsset<unknown, unknown, unknown>,
          prepared.context,
          false,
          0,
          false,
          0,
          input.options,
        ),
        renderedPromptChars,
        tokenUsage,
      });
      liveSession.usage(tokenUsage ? {
        ...tokenUsage,
        reasoningTokens: tokenUsage.reasoningTokens ?? null,
      } : null);
      liveSession.complete();
      return result;
    }).catch((error) => {
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
    }),
    context: prepared.context,
    invocation: prepared.invocation,
  };
}

export async function streamStructuredPrompt<I, O, R = O>(input: {
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
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "structured",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  let strategy!: ReturnType<typeof selectStructuredOutputStrategy>;
  let profile!: ReturnType<typeof resolveStructuredOutputProfile>;
  try {
    const llm = await getPromptRunnerLLMFactory()(input.options?.provider, {
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
    );
  } catch (error) {
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
      liveSession.phase("validating", "正在检查生成结果");
      let repairStarted = false;
      const parsed = rawContent.trim()
        ? await parseStructuredLlmRawContentDetailed({
          rawContent,
          schema: outputSchema,
          provider: input.options?.provider,
          model: input.options?.model,
          temperature: input.options?.temperature,
          maxTokens: input.options?.maxTokens,
          timeoutMs: input.options?.timeoutMs,
          signal: input.options?.signal,
          taskType: input.asset.taskType,
          label: `${input.asset.id}@${input.asset.version}`,
          maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
          promptMeta: prepared.invocation,
          onRepairOutputDelta: (content) => {
            if (!repairStarted) {
              repairStarted = true;
              liveSession.phase("repairing", "正在修复生成结果");
            }
            liveSession.delta(content);
          },
          strategy,
          profile,
        })
        : await getPromptRunnerStructuredInvoker()<R>({
          label: `${input.asset.id}@${input.asset.version}#empty-stream-fallback`,
          provider: input.options?.provider,
          model: input.options?.model,
          temperature: input.options?.temperature,
          maxTokens: input.options?.maxTokens,
          timeoutMs: input.options?.timeoutMs,
          signal: input.options?.signal,
          taskType: input.asset.taskType,
          messages: prepared.messages,
          schema: outputSchema,
          structuredStrategy: "prompt_json",
          maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
          promptMeta: prepared.invocation,
        });
      const resolved = await resolveStructuredOutput({
        asset: input.asset,
        promptInput: input.promptInput,
        context: prepared.context,
        baseMessages: prepared.messages,
        outputSchema,
        initialResult: parsed,
        options: input.options,
      });
      const tokenUsage = parsed.tokenUsage ?? await captured.completedUsage.catch(() => null);
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
      });
      liveSession.usage(tokenUsage ? {
        ...tokenUsage,
        reasoningTokens: tokenUsage.reasoningTokens ?? null,
      } : null);
      liveSession.complete();
      return result;
    }).catch((error) => {
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
    }),
    context: prepared.context,
    invocation: prepared.invocation,
  };
}

export function setPromptRunnerLLMFactoryForTests(factory?: PromptRunnerLLMFactory): void {
  setPromptRunnerLLMFactory(factory);
}

export function setPromptRunnerStructuredInvokerForTests(invoker?: PromptRunnerStructuredInvoker): void {
  setPromptRunnerStructuredInvoker(invoker);
}
