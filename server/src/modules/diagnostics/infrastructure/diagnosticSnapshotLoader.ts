import type {
  DiagnosticCapabilityResult,
  DiagnosticRecommendation,
  DiagnosticScope,
  DiagnosticStructuredCapabilityDetails,
  DiagnosticTargetResult,
} from "@ai-novel/shared/types/diagnostics";
import type { ProviderAuthMode } from "@ai-novel/shared/types/llm";
import { ragConfig } from "../../../config/rag";
import { prisma } from "../../../db/prisma";
import {
  llmConnectivityService,
  type ConnectivityProbeStatus,
  type LLMConnectivityStatus,
  type StructuredConnectivityProbeStatus,
} from "../../../llm/connectivity";
import { MODEL_ROUTE_TASK_TYPES, resolveModel } from "../../../llm/modelRouter";
import {
  getProviderDefaultBaseUrl,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
} from "../../../llm/providers";
import { ragServices } from "../../../services/rag";
import { getRagEmbeddingSettings } from "../../../services/settings/RagSettingsService";
import { getRagRuntimeSettings } from "../../../services/settings/RagRuntimeSettingsService";
import { QDRANT_API_KEY_KEY } from "../../../services/settings/ragSettingKeys";
import type { DiagnosticSnapshot, DiagnosticSnapshotLoader } from "../application/diagnosticPorts";
import { ConfigurationFingerprint } from "./configurationFingerprint";
import { sanitizeDiagnosticError } from "./diagnosticSanitization";

type ProviderSecretRow = {
  provider: string;
  key: string | null;
  baseURL: string | null;
  authMode: string;
  isActive: boolean;
  updatedAt: Date;
};

function normalizeAuthMode(value: string | null | undefined): ProviderAuthMode {
  return value === "x-api-key" || value === "none" ? value : "bearer";
}

function normalizeStructuredStrategy(value: string | null): DiagnosticStructuredCapabilityDetails["strategy"] {
  return value === "auto" || value === "json_schema" || value === "json_object" || value === "prompt_json"
    ? value
    : null;
}

function emptyCapability(capability: DiagnosticCapabilityResult["capability"]): DiagnosticCapabilityResult {
  return {
    capability,
    checkState: "not_checked",
    latencyMs: null,
    errorSummary: null,
    requestProtocol: null,
    structuredDetails: null,
  };
}

function checkedCapability(
  capability: DiagnosticCapabilityResult["capability"],
  status: ConnectivityProbeStatus | StructuredConnectivityProbeStatus | null,
): DiagnosticCapabilityResult {
  const ok = status?.ok === true;
  const structuredDetails = capability === "structured" && status && "strategy" in status ? {
    strategy: normalizeStructuredStrategy(status.strategy),
    reasoningForcedOff: status.reasoningForcedOff,
    fallbackAvailable: status.fallbackAvailable,
    fallbackUsed: status.fallbackUsed,
    errorCategory: status.errorCategory,
    nativeJsonObject: status.nativeJsonObject,
    nativeJsonSchema: status.nativeJsonSchema,
    profileFamily: status.profileFamily,
  } : null;
  return {
    capability,
    checkState: ok ? "healthy" : "failed",
    latencyMs: status?.latency ?? null,
    errorSummary: ok ? null : sanitizeDiagnosticError(status?.error ?? "probe_failed"),
    requestProtocol: status?.requestProtocol ?? null,
    structuredDetails,
  };
}

function buildRecommendation(
  target: DiagnosticTargetResult,
  status: LLMConnectivityStatus,
): DiagnosticRecommendation | null {
  if (status.plain?.ok !== true && status.structured?.ok !== true) return null;
  const requestProtocol = status.structured?.requestProtocol ?? status.plain?.requestProtocol ?? null;
  const strategy = status.structured?.strategy;
  const structuredResponseFormat = strategy === "json_schema" || strategy === "json_object" || strategy === "prompt_json"
    ? strategy
    : null;
  if (!requestProtocol && !structuredResponseFormat) return null;
  return {
    recommendationId: `compatibility:${target.targetId}:${target.revision}`,
    requestProtocol,
    structuredResponseFormat,
    reason: "检测到可工作的连接协议与结构化输出方式，请确认后再应用到模型路由。",
  };
}

function targetFromProbe(target: DiagnosticTargetResult, status: LLMConnectivityStatus): DiagnosticTargetResult {
  const capabilities = [
    checkedCapability("plain", status.plain),
    checkedCapability("structured", status.structured),
  ];
  const healthy = capabilities.every((capability) => capability.checkState === "healthy");
  return {
    ...target,
    provider: status.provider,
    model: status.model,
    checkState: healthy ? "healthy" : "failed",
    checkedAt: new Date().toISOString(),
    errorSummary: healthy ? null : sanitizeDiagnosticError(status.error ?? "probe_failed"),
    capabilities,
    recommendation: buildRecommendation(target, status),
  };
}

function normalizeBaseUrl(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/+$/, "") : undefined;
}

async function loadModelRouteSnapshot(fingerprint: ConfigurationFingerprint): Promise<DiagnosticSnapshot> {
  const [routeRows, secretRows, resolvedRoutes] = await Promise.all([
    prisma.modelRouteConfig.findMany(),
    prisma.aPIKey.findMany(),
    Promise.all(MODEL_ROUTE_TASK_TYPES.map(async (taskType) => ({ taskType, ...(await resolveModel(taskType)) }))),
  ]);
  const routeByTask = new Map(routeRows.map((row) => [row.taskType, row]));
  const secretByProvider = new Map(secretRows.map((row) => [row.provider, row as ProviderSecretRow]));
  const resolved = resolvedRoutes.map((route) => {
    const routeRow = routeByTask.get(route.taskType);
    const secret = secretByProvider.get(route.provider);
    const activeSecret = secret?.isActive ? secret : undefined;
    const apiKey = activeSecret?.key?.trim() || getProviderEnvApiKey(route.provider);
    const baseURL = normalizeBaseUrl(activeSecret?.baseURL)
      ?? getProviderEnvBaseUrl(route.provider)
      ?? getProviderDefaultBaseUrl(route.provider);
    const authMode = normalizeAuthMode(activeSecret?.authMode);
    return {
      route,
      revision: routeRow?.revision ?? 0,
      apiKey,
      baseURL,
      authMode,
      secretVersion: secret ? {
        isActive: secret.isActive,
        updatedAt: secret.updatedAt.toISOString(),
        credential: secret.isActive
          ? (secret.key?.trim() || getProviderEnvApiKey(route.provider) || null)
          : (getProviderEnvApiKey(route.provider) ?? null),
      } : {
        isActive: true,
        updatedAt: null,
        credential: getProviderEnvApiKey(route.provider) ?? null,
      },
    };
  });
  const configurationFingerprint = await fingerprint.create(resolved.map((item) => ({
    taskType: item.route.taskType,
    provider: item.route.provider,
    model: item.route.model,
    requestProtocol: item.route.requestProtocol,
    structuredResponseFormat: item.route.structuredResponseFormat,
    baseURL: item.baseURL ?? null,
    authMode: item.authMode,
    revision: item.revision,
    secretVersion: item.secretVersion,
  })));
  const targets: DiagnosticTargetResult[] = resolved.map((item) => ({
    targetId: `model-route:${item.route.taskType}`,
    targetKind: "model_route",
    taskType: item.route.taskType,
    provider: item.route.provider,
    model: item.route.model,
    checkState: "not_checked",
    checkedAt: null,
    errorSummary: null,
    capabilities: [emptyCapability("plain"), emptyCapability("structured")],
    recommendation: null,
    revision: item.revision,
  }));
  return {
    scope: "model_routes",
    configurationFingerprint,
    targets,
    async probe() {
      const checks = new Map<string, Promise<LLMConnectivityStatus>>();
      for (const item of resolved) {
        const key = [
          item.route.provider,
          item.route.model,
          item.baseURL,
          item.authMode,
          item.route.requestProtocol,
          item.route.structuredResponseFormat,
        ].join("::");
        if (!checks.has(key)) {
          checks.set(key, llmConnectivityService.testConnection({
            provider: item.route.provider,
            model: item.route.model,
            apiKey: item.apiKey,
            baseURL: item.baseURL,
            authMode: item.authMode,
            requestProtocol: item.route.requestProtocol,
            structuredResponseFormat: item.route.structuredResponseFormat,
            probeMode: "both",
          }));
        }
      }
      return Promise.all(resolved.map(async (item, index) => {
        const key = [
          item.route.provider,
          item.route.model,
          item.baseURL,
          item.authMode,
          item.route.requestProtocol,
          item.route.structuredResponseFormat,
        ].join("::");
        return targetFromProbe(targets[index], await checks.get(key)!);
      }));
    },
  };
}

async function loadRagSnapshot(fingerprint: ConfigurationFingerprint): Promise<DiagnosticSnapshot> {
  // Both settings readers deliberately project persisted values into ragConfig.
  // Keep their order deterministic so a check and its immediate read hash the
  // same effective runtime configuration.
  const embedding = await getRagEmbeddingSettings();
  const runtime = await getRagRuntimeSettings();
  const [qdrantCredentialSetting, providerSecrets] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: QDRANT_API_KEY_KEY } }),
    prisma.aPIKey.findMany(),
  ]);
  const embeddingSecret = providerSecrets.find((row) => row.provider === embedding.embeddingProvider);
  const configurationFingerprint = await fingerprint.create({
    enabled: runtime.enabled,
    embedding: {
      provider: embedding.embeddingProvider,
      model: embedding.embeddingModel,
      timeoutMs: embedding.embeddingTimeoutMs,
      maxRetries: embedding.embeddingMaxRetries,
    },
    vectorStore: {
      url: runtime.qdrantUrl,
      timeoutMs: runtime.qdrantTimeoutMs,
      collectionName: embedding.collectionName,
    },
    embeddingCredential: embeddingSecret?.isActive ? {
      value: embeddingSecret.key?.trim() || getProviderEnvApiKey(embedding.embeddingProvider) || null,
      baseURL: normalizeBaseUrl(embeddingSecret.baseURL)
        ?? getProviderEnvBaseUrl(embedding.embeddingProvider)
        ?? getProviderDefaultBaseUrl(embedding.embeddingProvider)
        ?? null,
      authMode: normalizeAuthMode(embeddingSecret.authMode),
      updatedAt: embeddingSecret.updatedAt.toISOString(),
    } : {
      value: getProviderEnvApiKey(embedding.embeddingProvider) ?? null,
      baseURL: getProviderEnvBaseUrl(embedding.embeddingProvider)
        ?? getProviderDefaultBaseUrl(embedding.embeddingProvider)
        ?? null,
      authMode: "bearer",
      updatedAt: null,
    },
    qdrantCredential: {
      value: ragConfig.qdrantApiKey || null,
      updatedAt: qdrantCredentialSetting?.updatedAt.toISOString() ?? null,
    },
  });
  const targets: DiagnosticTargetResult[] = [
    {
      targetId: "rag:embedding",
      targetKind: "rag_embedding",
      taskType: null,
      provider: embedding.embeddingProvider,
      model: embedding.embeddingModel,
      checkState: "not_checked",
      checkedAt: null,
      errorSummary: null,
      capabilities: [emptyCapability("embedding")],
      recommendation: null,
      revision: 0,
    },
    {
      targetId: "rag:vector-store",
      targetKind: "rag_vector_store",
      taskType: null,
      provider: "qdrant",
      model: embedding.collectionName,
      checkState: "not_checked",
      checkedAt: null,
      errorSummary: null,
      capabilities: [emptyCapability("vector_store")],
      recommendation: null,
      revision: 0,
    },
  ];
  return {
    scope: "rag",
    configurationFingerprint,
    targets,
    async probe() {
      const checkedAt = new Date().toISOString();
      const [embeddingStatus, vectorStatus] = await Promise.all([
        ragServices.embeddingService.healthCheck(),
        ragServices.vectorStoreService.healthCheck(),
      ]);
      return [
        {
          ...targets[0],
          provider: embeddingStatus.provider,
          model: embeddingStatus.model,
          checkState: embeddingStatus.ok ? "healthy" as const : "failed" as const,
          checkedAt,
          errorSummary: embeddingStatus.ok ? null : sanitizeDiagnosticError(embeddingStatus.detail ?? "probe_failed"),
          capabilities: [{
            capability: "embedding" as const,
            checkState: embeddingStatus.ok ? "healthy" as const : "failed" as const,
            latencyMs: null,
            errorSummary: embeddingStatus.ok ? null : sanitizeDiagnosticError(embeddingStatus.detail ?? "probe_failed"),
          }],
        },
        {
          ...targets[1],
          checkState: vectorStatus.ok ? "healthy" as const : "failed" as const,
          checkedAt,
          errorSummary: vectorStatus.ok ? null : sanitizeDiagnosticError(vectorStatus.detail ?? "probe_failed"),
          capabilities: [{
            capability: "vector_store" as const,
            checkState: vectorStatus.ok ? "healthy" as const : "failed" as const,
            latencyMs: null,
            errorSummary: vectorStatus.ok ? null : sanitizeDiagnosticError(vectorStatus.detail ?? "probe_failed"),
          }],
        },
      ];
    },
  };
}

export function createDiagnosticSnapshotLoader(
  fingerprint = new ConfigurationFingerprint(),
): DiagnosticSnapshotLoader {
  return (scope: DiagnosticScope) => scope === "model_routes"
    ? loadModelRouteSnapshot(fingerprint)
    : loadRagSnapshot(fingerprint);
}
