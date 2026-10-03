import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getJsonCapability } from "./capabilities";
import { isBuiltInProvider, PROVIDERS, resolveProviderBaseUrl } from "./providers";
import { supportsReasoningEffort } from "./reasoning";

export type LlmCapabilityValueSource = "explicit" | "provider_default" | "unknown";

export interface LlmRequestCapabilities {
  capabilityKey: string;
  provider: LLMProvider;
  model: string | null;
  endpoint: string | null;
  inputTokenLimit: number | null;
  inputTokenLimitSource: LlmCapabilityValueSource;
  outputTokenLimit: number | null;
  outputTokenLimitSource: LlmCapabilityValueSource;
  supportsJsonObject: boolean;
  supportsJsonSchema: boolean;
  supportsReasoningEffort: boolean;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

/**
 * Keep endpoint diagnostics safe to log. Query strings and credentials are
 * intentionally excluded because custom URLs may contain secrets.
 */
function normalizeEndpoint(baseURL: string | undefined): string | null {
  const normalized = normalizeText(baseURL);
  if (!normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function resolveDefaultOutputLimit(provider: LLMProvider): number | null {
  return isBuiltInProvider(provider)
    ? normalizePositiveInteger(PROVIDERS[provider].maxTokens)
    : null;
}

export function resolveLlmRequestCapabilities(input: {
  provider: LLMProvider;
  model?: string;
  baseURL?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}): LlmRequestCapabilities {
  const model = normalizeText(input.model);
  const endpoint = normalizeEndpoint(resolveProviderBaseUrl(input.provider, input.baseURL));
  const explicitInputLimit = normalizePositiveInteger(input.inputTokenLimit);
  const explicitOutputLimit = normalizePositiveInteger(input.outputTokenLimit);
  const defaultOutputLimit = resolveDefaultOutputLimit(input.provider);
  const jsonCapability = getJsonCapability(input.provider, model ?? undefined, endpoint ?? undefined);

  const capabilityKey = [
    input.provider,
    model ?? "unknown-model",
    endpoint ?? "unknown-endpoint",
  ].join("|");

  return {
    capabilityKey,
    provider: input.provider,
    model,
    endpoint,
    inputTokenLimit: explicitInputLimit,
    inputTokenLimitSource: explicitInputLimit == null ? "unknown" : "explicit",
    outputTokenLimit: explicitOutputLimit ?? defaultOutputLimit,
    outputTokenLimitSource: explicitOutputLimit != null
      ? "explicit"
      : defaultOutputLimit == null
        ? "unknown"
        : "provider_default",
    supportsJsonObject: jsonCapability.supportsJsonObject,
    supportsJsonSchema: jsonCapability.supportsJsonSchema,
    supportsReasoningEffort: supportsReasoningEffort(input.provider, endpoint ?? undefined, model ?? undefined),
  };
}
