import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { LlmRequestBudgetSnapshot } from "../../../llm/requestBudget";
import { toText } from "../../../services/novel/novelP0Utils";
import type { PromptAsset } from "../promptTypes";

export function estimateRenderedPromptChars(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + toText(message.content).length, 0);
}

export function logPromptBudget(input: {
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
