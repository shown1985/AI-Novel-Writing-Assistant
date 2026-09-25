import { getLLM } from "../../../llm/factory";
import { invokeStructuredLlmDetailed } from "../../../llm/structuredInvoke";
import type { PromptExecutionOptions } from "../promptTypes";

// Swappable LLM dependencies of the prompt runner. Tests replace them through
// setPromptRunnerLLMFactoryForTests / setPromptRunnerStructuredInvokerForTests
// exported by ../promptRunner; every runner module reads them at call time.
export type PromptRunnerLLMFactory = typeof getLLM;
export type PromptRunnerStructuredInvoker = typeof invokeStructuredLlmDetailed;

let promptRunnerLLMFactory: PromptRunnerLLMFactory = getLLM;
let promptRunnerStructuredInvoker: PromptRunnerStructuredInvoker = invokeStructuredLlmDetailed;

export function getPromptRunnerLLMFactory(): PromptRunnerLLMFactory {
  return promptRunnerLLMFactory;
}

export function getPromptRunnerStructuredInvoker(): PromptRunnerStructuredInvoker {
  return promptRunnerStructuredInvoker;
}

export function setPromptRunnerLLMFactory(factory?: PromptRunnerLLMFactory): void {
  promptRunnerLLMFactory = factory ?? getLLM;
}

export function setPromptRunnerStructuredInvoker(invoker?: PromptRunnerStructuredInvoker): void {
  promptRunnerStructuredInvoker = invoker ?? invokeStructuredLlmDetailed;
}

export function buildPromptCallOptions(options?: PromptExecutionOptions): Record<string, unknown> {
  const callOptions: Record<string, unknown> = {};
  if (options?.signal) {
    callOptions.signal = options.signal;
  }
  return callOptions;
}
