import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { DiagnosticReadinessReport } from "@ai-novel/shared/types/diagnostics";
import { PROVIDER_AUTH_MODES } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { llmConnectivityService } from "../llm/connectivity";
import { getStructuredFallbackSettings, saveStructuredFallbackSettings } from "../llm/structuredFallbackSettings";
import { filterHiddenModels, getProviderModels, parseHiddenModels } from "../llm/modelCatalog";
import { listModelRouteConfigs, MODEL_ROUTE_TASK_TYPES, upsertModelRouteConfig } from "../llm/modelRouter";
import { llmProviderSchema } from "../llm/providerSchema";
import { getProviderEnvApiKey, getProviderEnvModel, isBuiltInProvider, PROVIDERS } from "../llm/providers";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { checkModelRouteReadiness, getModelRouteReadiness } from "../modules/diagnostics";
import {
  projectModelAttemptProvenance,
  readModelAttemptRequest,
} from "../platform/llm/provenance";

const router = Router();

function projectLegacyConnectivityResponse(report: DiagnosticReadinessReport) {
  return {
    testedAt: report.checkedAt ?? new Date().toISOString(),
    statuses: report.targets.flatMap((target) => {
      if (target.targetKind !== "model_route" || !target.taskType || !target.provider || !target.model) {
        return [];
      }
      const plain = target.capabilities.find((capability) => capability.capability === "plain") ?? null;
      const structured = target.capabilities.find((capability) => capability.capability === "structured") ?? null;
      const top = plain ?? structured;
      const requestProtocol = top?.requestProtocol ?? target.recommendation?.requestProtocol ?? null;
      const structuredDetails = structured?.structuredDetails ?? null;
      return [{
        taskType: target.taskType,
        provider: target.provider,
        model: target.model,
        ok: top?.checkState === "healthy",
        latency: top?.latencyMs ?? null,
        error: top?.errorSummary ?? target.errorSummary,
        requestProtocol,
        plain: plain ? {
          ok: plain.checkState === "healthy",
          latency: plain.latencyMs,
          error: plain.errorSummary,
          requestProtocol: plain.requestProtocol ?? null,
        } : null,
        structured: structured ? {
          ok: structured.checkState === "healthy",
          latency: structured.latencyMs,
          error: structured.errorSummary,
          requestProtocol: structured.requestProtocol ?? null,
          strategy: structuredDetails?.strategy ?? target.recommendation?.structuredResponseFormat ?? null,
          reasoningForcedOff: structuredDetails?.reasoningForcedOff ?? false,
          fallbackAvailable: structuredDetails?.fallbackAvailable ?? false,
          fallbackUsed: structuredDetails?.fallbackUsed ?? false,
          errorCategory: structuredDetails?.errorCategory ?? null,
          nativeJsonObject: structuredDetails?.nativeJsonObject ?? false,
          nativeJsonSchema: structuredDetails?.nativeJsonSchema ?? false,
          profileFamily: structuredDetails?.profileFamily ?? null,
        } : null,
      }];
    }),
  };
}

const llmTestSchema = z.object({
  provider: llmProviderSchema,
  apiKey: z.string().trim().optional(),
  model: z.string().trim().optional(),
  baseURL: z.string().trim().url("API URL 格式不正确。").optional(),
  authMode: z.enum(PROVIDER_AUTH_MODES).optional(),
  probeMode: z.enum(["plain", "structured", "both"]).optional(),
});

const structuredFallbackSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.union([z.number().int().min(64).max(32768), z.null()]).optional(),
  retryCount: z.number().int().min(0).max(3).optional(),
});

const attemptRequestProvenanceParamsSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
});

router.use(authMiddleware);

router.get("/attempt-requests/provenance", (_req, _res, next) => {
  next(new AppError("请求参数校验失败。", 400));
});

router.get(
  "/attempt-requests/:requestId/provenance",
  validate({ params: attemptRequestProvenanceParamsSchema }),
  async (req, res, next) => {
    try {
      const { requestId } = attemptRequestProvenanceParamsSchema.parse(req.params);
      const projection = await readModelAttemptRequest({ requestId });
      const data = projectModelAttemptProvenance(projection);
      const message = data.status === "found"
        ? "本次调用的模型来源已加载。"
        : data.status === "not_found"
          ? "暂未找到本次调用的来源记录，无法确认实际采用模型。"
          : "本次调用的来源记录暂时无法读取，无法确认实际采用模型。";
      res.status(200).json({
        success: true,
        data,
        message,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/providers", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany({ orderBy: [{ createdAt: "asc" }] });
    const keyMap = new Map(keys.map((item) => [item.provider, item]));

    const builtInEntries = await Promise.all(
      Object.entries(PROVIDERS).map(async ([provider, config]) => {
        const keyConfig = keyMap.get(provider);
        const currentModel = keyConfig?.model?.trim()
          || getProviderEnvModel(provider)
          || config.defaultModel;
        const models = filterHiddenModels(await getProviderModels(provider, {
          apiKey: keyConfig?.key ?? getProviderEnvApiKey(provider),
          baseURL: keyConfig?.baseURL ?? undefined,
          fallbackModel: currentModel,
          fallbackModels: [...config.models, currentModel],
        }), parseHiddenModels(keyConfig?.hiddenModels), currentModel);
        return [provider, {
          name: config.name,
          defaultModel: currentModel,
          models,
        }] as const;
      }),
    );

    const customEntries = await Promise.all(
      keys
        .filter((item) => !isBuiltInProvider(item.provider))
        .map(async (item) => {
          const currentModel = item.model?.trim() || "";
          const models = filterHiddenModels(await getProviderModels(item.provider, {
            apiKey: item.key ?? undefined,
            baseURL: item.baseURL ?? undefined,
            authMode: item.authMode === "x-api-key" || item.authMode === "none" ? item.authMode : "bearer",
            fallbackModel: currentModel,
            fallbackModels: [currentModel],
          }), parseHiddenModels(item.hiddenModels), currentModel);
          return [item.provider, {
            name: item.displayName?.trim() || item.provider,
            defaultModel: currentModel,
            models,
          }] as const;
        }),
    );

    const data = Object.fromEntries([...builtInEntries, ...customEntries]);
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: "获取模型配置成功。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/model-routes", async (_req, res, next) => {
  try {
    const data = {
      taskTypes: MODEL_ROUTE_TASK_TYPES,
      routes: await listModelRouteConfigs(),
    };
    res.status(200).json({
      success: true,
      data,
      message: "模型路由配置已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/model-routes/connectivity", async (_req, res, next) => {
  try {
    const data = await getModelRouteReadiness();
    res.status(200).json({
      success: true,
      data,
      message: "模型路由检测状态已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/model-routes/connectivity", async (_req, res, next) => {
  try {
    const report = await checkModelRouteReadiness();
    const data = projectLegacyConnectivityResponse(report);
    res.status(200).json({
      success: true,
      data,
      message: report.pending ? "相同配置正在检测，请稍后查看结果。" : "模型路由连通性检测完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/structured-fallback", async (_req, res, next) => {
  try {
    const data = await getStructuredFallbackSettings();
    res.status(200).json({
      success: true,
      data,
      message: "结构化备用模型配置已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/structured-fallback",
  validate({ body: structuredFallbackSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof structuredFallbackSchema>;
      if ((body.enabled ?? false) && (!body.provider || !body.model)) {
        throw new AppError("启用结构化备用模型时，provider 和 model 不能为空。", 400);
      }
      const data = await saveStructuredFallbackSettings(body);
      res.status(200).json({
        success: true,
        data,
        message: "结构化备用模型配置已更新。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

const modelRouteUpsertSchema = z.object({
  taskType: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.union([z.number().int().min(64).max(16384), z.null()]).optional(),
  requestProtocol: z.enum(["auto", "openai_compatible", "anthropic"]).optional(),
  structuredResponseFormat: z.enum(["auto", "json_schema", "json_object", "prompt_json"]).optional(),
});

router.put(
  "/model-routes",
  validate({ body: modelRouteUpsertSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof modelRouteUpsertSchema>;
      await upsertModelRouteConfig(body.taskType, {
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens ?? null,
        requestProtocol: body.requestProtocol,
        structuredResponseFormat: body.structuredResponseFormat,
      });
      res.status(200).json({
        success: true,
        message: "模型路由已更新。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/test",
  validate({ body: llmTestSchema }),
  async (req, res, next) => {
    try {
      const { provider, apiKey, model, baseURL, authMode, probeMode } = req.body as z.infer<typeof llmTestSchema>;
      const result = await llmConnectivityService.testConnection({ provider, apiKey, model, baseURL, authMode, probeMode });
      const shouldFail =
        probeMode === "structured"
          ? result.structured?.ok === false
          : probeMode === "plain"
            ? result.plain?.ok === false
            : result.plain?.ok === false && result.structured?.ok === false;
      if (shouldFail) {
        if (/API Key|未配置/.test(result.error ?? "")) {
          next(new AppError(result.error ?? "未配置可用的模型连接。", 400));
          return;
        }
        next(new AppError(result.error ?? "模型连通性测试失败。", 400));
        return;
      }
      const response: ApiResponse<{
        success: boolean;
        model: string;
        latency: number;
        plain: typeof result.plain;
        structured: typeof result.structured;
      }> = {
        success: true,
        data: {
          success: result.ok || result.structured?.ok === true,
          model: result.model,
          latency: result.latency ?? 0,
          plain: result.plain,
          structured: result.structured,
        },
        message: "模型连通性与结构化兼容性测试已完成。",
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
