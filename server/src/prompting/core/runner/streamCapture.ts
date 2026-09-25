import type { BaseMessageChunk } from "@langchain/core/messages";
import { ReasoningStreamCollector } from "../../../llm/reasoning";
import {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
  type LlmTokenUsageSnapshot,
} from "../../../llm/usageTracking";
import { toText } from "../../../services/novel/novelP0Utils";

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
