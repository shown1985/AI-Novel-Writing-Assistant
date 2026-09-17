import type {
  LLMProvider,
  ModelRouteDegradedReason,
  ModelSelectionAdjustment,
  ModelSelectionProvenance,
  ModelSelectionSource,
} from "@ai-novel/shared/types/llm";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import { createModelSelectionField } from "../platform/llm/provenance";
import { isBuiltInProvider, PROVIDERS } from "./providers";
import type { StructuredOutputStrategy } from "./structuredOutput";

export type TaskType =
  | ModelRouteTaskType
  | "outline_planning"
  | "chapter_drafting"
  | "chapter_review"
  | "chapter_repair"
  | "summary_generation"
  | "chat"
  | "default";

const TASK_TYPE_ALIASES: Partial<Record<TaskType, ModelRouteTaskType>> = {
  outline_planning: "planner",
  chapter_drafting: "writer",
  chapter_review: "review",
  chapter_repair: "repair",
  summary_generation: "summary",
  fact_extraction: "fact_extraction",
};

export const MODEL_ROUTE_TASK_TYPES: ModelRouteTaskType[] = [
  "planner",
  "writer",
  "review",
  "light_review",
  "critical_review",
  "repair",
  "replan",
  "state_resolution",
  "summary",
  "fact_extraction",
  "chat",
];

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
  routeKey: ModelRouteTaskType | "default";
  routeDegraded: boolean;
  routeDegradedReason: ModelRouteDegradedReason;
  selectionProvenance: ModelSelectionProvenance;
}

const STRICT_ROUTE_TASK_TYPES = new Set<ModelRouteTaskType>([
  "critical_review",
  "replan",
  "state_resolution",
]);

const DEFAULT_ROUTES: Record<
  ModelRouteTaskType | "default",
  Omit<ResolvedModel, "routeKey" | "routeDegraded" | "routeDegradedReason" | "selectionProvenance">
> = {
  planner: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.3,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  writer: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.8,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  light_review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  critical_review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.1,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  repair: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  replan: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  state_resolution: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.1,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  summary: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  fact_extraction: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  chat: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  default: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
};

function normalizeProviderId(value: string | null | undefined): LLMProvider {
  if (typeof value !== "string") {
    return "deepseek";
  }
  const trimmed = value.trim();
  return trimmed || "deepseek";
}

interface NormalizedMaxTokens {
  effective?: number;
  adjustments: ModelSelectionAdjustment<number>[];
}

function normalizeMaxTokens(provider: LLMProvider, maxTokens?: number): NormalizedMaxTokens {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return { effective: undefined, adjustments: [] };
  }
  const normalized = Math.floor(maxTokens);
  if (normalized < 1) {
    return { effective: undefined, adjustments: [] };
  }
  // Historical UI defaults persisted 4096 as a placeholder for "use provider defaults".
  if (normalized === 4096) {
    return {
      effective: undefined,
      adjustments: [{
        kind: "legacy_4096_unset",
        before: normalized,
        after: null,
        reason: "历史值 4096 表示沿用厂商默认 Token 上限。",
      }],
    };
  }
  const providerLimit = isBuiltInProvider(provider) ? PROVIDERS[provider].maxTokens : undefined;
  if (typeof providerLimit === "number" && normalized > providerLimit) {
    return {
      effective: providerLimit,
      adjustments: [{
        kind: "provider_limit",
        before: normalized,
        after: providerLimit,
        reason: "请求的 Token 上限超过厂商支持范围。",
      }],
    };
  }
  return { effective: normalized, adjustments: [] };
}

function createRouteSelectionProvenance(input: {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  source: ModelSelectionSource;
  routeKey: ModelRouteTaskType | "default";
  routeDegraded: boolean;
  routeDegradedReason: ModelRouteDegradedReason;
}): ModelSelectionProvenance {
  const normalizedMaxTokens = normalizeMaxTokens(input.provider, input.maxTokens);
  return {
    provider: createModelSelectionField({ requested: input.provider, source: input.source }),
    model: createModelSelectionField({ requested: input.model, source: input.source }),
    temperature: createModelSelectionField({ requested: input.temperature, source: input.source }),
    maxTokens: createModelSelectionField({
      requested: input.maxTokens,
      effective: normalizedMaxTokens.effective,
      source: input.source,
      adjustments: normalizedMaxTokens.adjustments,
    }),
    routeKey: input.routeKey,
    routeDegraded: input.routeDegraded,
    routeDegradedReason: input.routeDegradedReason,
  };
}

export function normalizeRequestProtocol(value?: string | null): ModelRouteRequestProtocol {
  if (value === "openai_compatible" || value === "anthropic") {
    return value;
  }
  return "auto";
}

export function normalizeStructuredResponseFormat(value?: string | null): ModelRouteStructuredResponseFormat {
  if (value === "json_schema" || value === "json_object" || value === "prompt_json") {
    return value;
  }
  return "auto";
}

function normalizeRoutePreferences(input: {
  requestProtocol?: string | null;
  structuredResponseFormat?: string | null;
}): {
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
} {
  const requestProtocol = normalizeRequestProtocol(input.requestProtocol);
  const structuredResponseFormat = requestProtocol === "anthropic"
    ? "prompt_json"
    : normalizeStructuredResponseFormat(input.structuredResponseFormat);
  return {
    requestProtocol,
    structuredResponseFormat,
  };
}

export function toStructuredOutputStrategy(
  value: ModelRouteStructuredResponseFormat,
): StructuredOutputStrategy | null {
  return value === "auto" ? null : value;
}

function applyOverrides(
  base: ResolvedModel,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): ResolvedModel {
  const provider = userOverride?.provider ?? base.provider;
  const model = userOverride?.model ?? base.model;
  const temperature = userOverride?.temperature ?? base.temperature;
  const maxTokensInput = userOverride?.maxTokens ?? base.maxTokens;
  const normalizedMaxTokens = normalizeMaxTokens(provider, maxTokensInput);
  const merged: ResolvedModel = {
    ...base,
    provider,
    model,
    temperature,
    maxTokens: normalizedMaxTokens.effective,
    ...(userOverride?.requestProtocol != null && { requestProtocol: userOverride.requestProtocol }),
    ...(userOverride?.structuredResponseFormat != null && {
      structuredResponseFormat: userOverride.structuredResponseFormat,
    }),
  };
  const routePreferences = normalizeRoutePreferences({
    requestProtocol: merged.requestProtocol,
    structuredResponseFormat: merged.structuredResponseFormat,
  });
  return {
    ...merged,
    ...routePreferences,
    routeKey: merged.routeKey,
    routeDegraded: merged.routeDegraded,
    routeDegradedReason: merged.routeDegradedReason,
    selectionProvenance: {
      provider: userOverride?.provider != null
        ? createModelSelectionField({ requested: userOverride.provider, source: "explicit_request" })
        : base.selectionProvenance.provider,
      model: userOverride?.model != null
        ? createModelSelectionField({ requested: userOverride.model, source: "explicit_request" })
        : base.selectionProvenance.model,
      temperature: userOverride?.temperature != null
        ? createModelSelectionField({ requested: userOverride.temperature, source: "explicit_request" })
        : base.selectionProvenance.temperature,
      maxTokens: userOverride?.maxTokens != null
        ? createModelSelectionField({
          requested: userOverride.maxTokens,
          effective: normalizedMaxTokens.effective,
          source: "explicit_request",
          adjustments: normalizedMaxTokens.adjustments,
        })
        : {
          ...base.selectionProvenance.maxTokens,
          effective: normalizedMaxTokens.effective ?? null,
          adjustments: [
            ...base.selectionProvenance.maxTokens.adjustments,
            ...normalizedMaxTokens.adjustments,
          ],
        },
      routeKey: merged.routeKey,
      routeDegraded: merged.routeDegraded,
      routeDegradedReason: merged.routeDegradedReason,
    },
  };
}

function normalizeTaskType(taskType: TaskType): ModelRouteTaskType | "default" {
  const aliased = TASK_TYPE_ALIASES[taskType];
  if (aliased) {
    return aliased;
  }
  if (taskType === "default") {
    return "default";
  }
  if (MODEL_ROUTE_TASK_TYPES.includes(taskType as ModelRouteTaskType)) {
    return taskType as ModelRouteTaskType;
  }
  return "default";
}

export async function resolveModel(
  taskType: TaskType,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): Promise<ResolvedModel> {
  const normalizedTaskType = normalizeTaskType(taskType);
  const base = DEFAULT_ROUTES[normalizedTaskType] ?? DEFAULT_ROUTES.default;
  let routeLookupFailed = false;

  try {
    const row = await prisma.modelRouteConfig.findUnique({
      where: { taskType: normalizedTaskType },
    });
    if (row) {
      const provider = normalizeProviderId(row.provider);
      const normalizedMaxTokens = normalizeMaxTokens(provider, row.maxTokens ?? undefined);
      const routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in row ? row.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in row ? row.structuredResponseFormat : null,
      });
      const resolved: ResolvedModel = {
        provider,
        model: row.model,
        temperature: row.temperature,
        maxTokens: normalizedMaxTokens.effective,
        ...routePreferences,
        routeKey: normalizedTaskType,
        routeDegraded: false,
        routeDegradedReason: null,
        selectionProvenance: createRouteSelectionProvenance({
          provider,
          model: row.model,
          temperature: row.temperature,
          maxTokens: row.maxTokens ?? undefined,
          source: "task_route",
          routeKey: normalizedTaskType,
          routeDegraded: false,
          routeDegradedReason: null,
        }),
      };
      return applyOverrides(resolved, userOverride);
    }
  } catch {
    // table may not exist yet
    routeLookupFailed = true;
  }

  const routeDegraded = normalizedTaskType !== "default"
    && STRICT_ROUTE_TASK_TYPES.has(normalizedTaskType);
  const routeDegradedReason: ModelRouteDegradedReason = routeLookupFailed
    ? "route_lookup_failed"
    : routeDegraded ? "strict_route_not_configured" : null;
  return applyOverrides({
    ...base,
    routeKey: normalizedTaskType,
    routeDegraded,
    routeDegradedReason,
    selectionProvenance: createRouteSelectionProvenance({
      ...base,
      source: "task_route_default",
      routeKey: normalizedTaskType,
      routeDegraded,
      routeDegradedReason,
    }),
  }, userOverride);
}

export async function listModelRouteConfigs(): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>> {
  try {
    const rows = await prisma.modelRouteConfig.findMany({
      orderBy: { taskType: "asc" },
    });
    return rows.map((r) => {
      const provider = normalizeProviderId(r.provider);
      const routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in r ? r.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in r ? r.structuredResponseFormat : null,
      });
      return {
        provider,
        taskType: r.taskType,
        model: r.model,
        temperature: r.temperature,
        maxTokens: normalizeMaxTokens(provider, r.maxTokens ?? undefined).effective ?? null,
        ...routePreferences,
      };
    });
  } catch {
    return [];
  }
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number | null;
    requestProtocol?: string | null;
    structuredResponseFormat?: string | null;
  },
): Promise<void> {
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  const provider = normalizeProviderId(data.provider);
  const normalizedMaxTokens = normalizeMaxTokens(provider, data.maxTokens ?? undefined).effective ?? null;
  const {
    requestProtocol,
    structuredResponseFormat,
  } = normalizeRoutePreferences({
    requestProtocol: data.requestProtocol,
    structuredResponseFormat: data.structuredResponseFormat,
  });
  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
      revision: 1,
    },
    update: {
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
      revision: { increment: 1 },
    },
  });
}
