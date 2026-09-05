import { createHash, randomUUID } from "node:crypto";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { PromptInvocationMeta } from "../../prompting/core/promptTypes";
import { isOpenCodeHost } from "./capabilities";
export const OPEN_CODE_USER_AGENT = "AI-Novel-Writing-Assistant/0.4.17";
const PROCESS_FALLBACK_SESSION = randomUUID();

export interface OpenCodeRequestIdentityInput {
  provider: LLMProvider;
  baseURL?: string;
  sessionId?: string;
  promptMeta?: Pick<PromptInvocationMeta, "taskId" | "novelId" | "chapterId" | "entrypoint">;
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function toStableHeaderValue(source: string): string {
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 32);
  return `ai-novel-${digest}`;
}

export function resolveOpenCodeSessionId(input: OpenCodeRequestIdentityInput): string | undefined {
  if (!isOpenCodeHost(input.baseURL)) {
    return undefined;
  }

  const explicitSessionId = normalize(input.sessionId);
  const stableScope = explicitSessionId
    ?? normalize(input.promptMeta?.taskId)
    ?? normalize(input.promptMeta?.novelId)
    ?? normalize(input.promptMeta?.chapterId)
    ?? normalize(input.promptMeta?.entrypoint)
    ?? PROCESS_FALLBACK_SESSION;

  return toStableHeaderValue(`${input.provider}:${stableScope}`);
}

export function buildOpenCodeRequestHeaders(
  input: OpenCodeRequestIdentityInput,
): Record<string, string> | undefined {
  const sessionId = resolveOpenCodeSessionId(input);
  if (!sessionId) {
    return undefined;
  }
  return {
    "user-agent": OPEN_CODE_USER_AGENT,
    "x-opencode-session": sessionId,
  };
}
