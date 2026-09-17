import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import { ragConfig } from "../config/rag";
import { checkRagReadiness, getRagReadiness } from "../modules/diagnostics";

const router = Router();

const reindexSchema = z.object({
  scope: z.enum(["novel", "world", "all"]),
  id: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
});

const jobsQuerySchema = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const jobParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

router.use(authMiddleware);

router.post("/reindex", validate({ body: reindexSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof reindexSchema>;
    const data = await ragServices.ragIndexService.enqueueReindex(body.scope, body.id, body.tenantId);
    res.status(202).json({
      success: true,
      data,
      message: "RAG reindex jobs queued.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", validate({ query: jobsQuerySchema }), async (req, res, next) => {
  try {
    const query = jobsQuerySchema.parse(req.query);
    const data = await ragServices.ragIndexService.listJobSummaries(query.limit, query.status);
    res.status(200).json({
      success: true,
      data,
      message: "RAG job list loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/finished", async (_req, res, next) => {
  try {
    const data = await ragServices.ragJobCleanupService.clearFinishedJobs();
    res.status(200).json({
      success: true,
      data,
      message: data.deletedCount > 0
        ? `已清理 ${data.deletedCount} 个已结束任务。`
        : "没有可清理的已结束任务。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/:jobId", validate({ params: jobParamsSchema }), async (req, res, next) => {
  try {
    const { jobId } = req.params as z.infer<typeof jobParamsSchema>;
    const data = await ragServices.ragJobCleanupService.deleteFinishedJob(jobId);
    if (data.deletedCount === 0) {
      throw new AppError("排队中或执行中的任务不能删除。", 409);
    }
    res.status(200).json({
      success: true,
      data: {
        jobId,
        ...data,
      },
      message: "任务记录已删除。",
    } satisfies ApiResponse<{ jobId: string; deletedCount: number; status: string }>);
  } catch (error) {
    if (error instanceof Error && error.message === "RAG job not found.") {
      next(new AppError("没有找到这个任务。", 404));
      return;
    }
    next(error);
  }
});

router.get("/readiness", async (_req, res, next) => {
  try {
    const data = await getRagReadiness();
    res.status(200).json({
      success: true,
      data,
      message: "知识库连接状态已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/readiness", async (_req, res, next) => {
  try {
    const data = await checkRagReadiness();
    res.status(200).json({
      success: true,
      data,
      message: data.pending ? "相同配置正在检测，请稍后查看结果。" : "知识库连接检测完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

/** Legacy passive projection. New consumers must use /readiness. */
router.get("/health", async (_req, res, next) => {
  try {
    const readiness = await getRagReadiness();
    const embeddingTarget = readiness.targets.find((target) => target.targetKind === "rag_embedding");
    const vectorTarget = readiness.targets.find((target) => target.targetKind === "rag_vector_store");
    const data = {
      embedding: {
        ok: embeddingTarget?.checkState === "healthy",
        provider: embeddingTarget?.provider ?? "",
        model: embeddingTarget?.model ?? "",
        detail: embeddingTarget?.errorSummary ?? undefined,
        timeoutMs: ragConfig.embeddingTimeoutMs,
        batchSize: ragConfig.embeddingBatchSize,
        maxRetries: ragConfig.embeddingMaxRetries,
      },
      qdrant: {
        ok: vectorTarget?.checkState === "healthy",
        detail: vectorTarget?.errorSummary ?? undefined,
        timeoutMs: ragConfig.qdrantTimeoutMs,
      },
      ok: readiness.checkState === "healthy",
      checkState: readiness.checkState,
      checkedAt: readiness.checkedAt,
    };
    const isFailed = readiness.checkState === "failed";
    res.status(isFailed ? 503 : 200).json({
      success: !isFailed,
      data,
      message: isFailed ? "RAG health check failed." : "RAG readiness loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
