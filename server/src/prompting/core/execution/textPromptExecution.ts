import type { BaseMessage, BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getLLM } from "../../../llm/factory";
import { ReasoningStreamCollector } from "../../../llm/reasoning";
import { formatLivePrompt } from "../../../llm/structuredInvoke";
import {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
  type LlmTokenUsageSnapshot,
} from "../../../llm/usageTracking";
import { toText } from "../../../services/novel/novelP0Utils";
import { beginLlmLiveSession } from "../../../platform/llm/live/llmLiveSession";
import { resolveAdvancedPromptMessages } from "../../templates/templateRuntime";
import { selectContextBlocks } from "../contextSelection";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptInvocationMeta,
  PromptRenderContext,
  PromptRunResult,
  PromptStreamRunResult,
} from "../promptTypes";
import {
  buildPromptInvocationMeta,
  preparePromptExecution,
  resolvePromptOverlaysForAsset,
} from "./promptExecutionContext";
import { applyPromptPostValidate } from "./structuredPromptExecution";

type TextPromptLLMFactory = typeof getLLM;

type TextPromptResultInput = {
  asset: PromptAsset<unknown, unknown, unknown>;
  output: string;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  invocation: PromptInvocationMeta;
  renderedPromptChars?: number;
  tokenUsage?: LlmTokenUsageSnapshot | null;
};

type TextPromptFailureInput = {
  asset: PromptAsset<unknown, unknown, unknown>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  renderedPromptChars?: number;
  error: unknown;
};

export type TextPromptExecutionDependencies = {
  llmFactory: TextPromptLLMFactory;
  buildResult: (input: TextPromptResultInput) => PromptRunResult<string>;
  recordFailure: (input: TextPromptFailureInput) => void;
};

function estimateRenderedPromptChars(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + toText(message.content).length, 0);
}

export function buildPromptCallOptions(options?: PromptExecutionOptions): Record<string, unknown> {
  const callOptions: Record<string, unknown> = {};
  if (options?.signal) {
    callOptions.signal = options.signal;
  }
  return callOptions;
}

export function captureStreamOutput(
  rawStream: AsyncIterable<BaseMessageChunk>,
  onChunk?: (content: string) => void,
  onReasoning?: (content: string) => void,
): {
  stream: AsyncIterable<BaseMessageChunk>;
  completedText: Promise<string>;
  completedUsage: Promise<LlmTokenUsageSnapshot | null>;
} {
  let resolveText!: (value: string) => void;
  let rejectText!: (reason?: unknown) => void;
  let resolveUsage!: (value: LlmTokenUsageSnapshot | null) => void;
  let rejectUsage!: (reason?: unknown) => void;
  const completedText = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });
  const completedUsage = new Promise<LlmTokenUsageSnapshot | null>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  const stream = {
    async *[Symbol.asyncIterator]() {
      const chunks: string[] = [];
      let usage: LlmTokenUsageSnapshot | null = null;
      const reasoningCollector = new ReasoningStreamCollector();
      try {
        for await (const chunk of rawStream) {
          const content = toText(chunk.content);
          chunks.push(content);
          onChunk?.(content);
          onReasoning?.(reasoningCollector.push(chunk, content));
          usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
          yield chunk;
        }
        onReasoning?.(reasoningCollector.flush());
        resolveText(chunks.join(""));
        resolveUsage(usage);
      } catch (error) {
        rejectText(error);
        rejectUsage(error);
        throw error;
      }
    },
  };

  return {
    stream,
    completedText,
    completedUsage,
  };
}

export async function executeTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}, dependencies: TextPromptExecutionDependencies): Promise<PromptRunResult<string>> {
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
    const llm = await dependencies.llmFactory(input.options?.provider, {
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
    return dependencies.buildResult({
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
    dependencies.recordFailure({
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

export async function executeTextPromptStream<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}, dependencies: TextPromptExecutionDependencies): Promise<PromptStreamRunResult<string>> {
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
    const llm = await dependencies.llmFactory(input.options?.provider, {
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
    dependencies.recordFailure({
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
      const result = dependencies.buildResult({
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
      dependencies.recordFailure({
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
