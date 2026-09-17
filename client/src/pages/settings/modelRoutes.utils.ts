import type {
  APIKeyStatus,
  ModelRoutesResponse,
} from "@/api/settings";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";

export interface RouteDraft {
  provider: string;
  model: string;
  temperature: string;
  maxTokens: string;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}

export interface StructuredFallbackDraft extends RouteDraft {
  enabled: boolean;
  retryCount: string;
}

type SavedModelRoute = ModelRoutesResponse["routes"][number];

export interface RouteSavePayload {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}

export function getProviderConfig(providerConfigs: APIKeyStatus[], provider: string) {
  return providerConfigs.find((item) => item.provider === provider);
}

export function getProviderDisplayName(providerConfigs: APIKeyStatus[], provider: string): string {
  const config = getProviderConfig(providerConfigs, provider);
  return config?.displayName ?? config?.name ?? provider;
}

export function getPreferredModel(config: APIKeyStatus | undefined): string {
  return config?.currentModel || config?.models?.[0] || "";
}

export function getModelOptions(providerConfigs: APIKeyStatus[], provider: string, currentModel: string): string[] {
  const config = getProviderConfig(providerConfigs, provider);
  const models = config?.models ?? [];
  return [...new Set([currentModel, ...models].filter(Boolean))];
}

export function getStructuredResponseFormatOptions(
  requestProtocol: ModelRouteRequestProtocol,
): ModelRouteStructuredResponseFormat[] {
  return requestProtocol === "anthropic"
    ? ["prompt_json"]
    : ["auto", "json_schema", "json_object", "prompt_json"];
}

function parseTemperature(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMaxTokens(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

export function parseStructuredRetryCount(value: string, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(3, Math.max(0, Math.floor(parsed)));
}

export function buildRouteSavePayload(taskType: ModelRouteTaskType, draft: RouteDraft): RouteSavePayload {
  return {
    taskType,
    provider: draft.provider,
    model: draft.model,
    temperature: parseTemperature(draft.temperature, 0.7),
    maxTokens: parseMaxTokens(draft.maxTokens),
    requestProtocol: draft.requestProtocol,
    structuredResponseFormat: draft.structuredResponseFormat,
  };
}

export function isSameRouteDraft(draft: RouteDraft, route: SavedModelRoute | undefined): boolean {
  if (!route) {
    return false;
  }
  return draft.provider === route.provider
    && draft.model.trim() === route.model
    && parseTemperature(draft.temperature, 0.7) === route.temperature
    && parseMaxTokens(draft.maxTokens) === route.maxTokens
    && draft.requestProtocol === route.requestProtocol
    && draft.structuredResponseFormat === route.structuredResponseFormat;
}
