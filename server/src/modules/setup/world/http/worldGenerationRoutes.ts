import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { initSSE, streamToSSE, writeSSEFrame } from "../../../../llm/streaming";
import { validate } from "../../../../middleware/validate";
import type { WorldSkeletonGenerateInput } from "../../../../services/world/worldSkeletonGeneration";
import {
  inspirationSchema,
  libraryCreateSchema,
  libraryListQuerySchema,
  libraryUseParamsSchema,
  libraryUseSchema,
  requireWorldWizard,
  worldGenerateSchema,
  worldGenerationRunParamsSchema,
  worldSkeletonGenerateSchema,
  worldRefineSchema,
  worldIdSchema,
  worldService,
} from "./worldHttpContext";
import { summarizeStructuredOutputFailure } from "../../../../llm/structuredInvoke";
import { AppError } from "../../../../middleware/errorHandler";

interface CheckpointFailureDetails {
  generationRunId: string;
  stage: string;
}

function getCheckpointFailureDetails(error: unknown): CheckpointFailureDetails | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  return typeof record.worldGenerationRunId === "string"
    && typeof record.worldGenerationStage === "string"
    ? {
      generationRunId: record.worldGenerationRunId,
      stage: record.worldGenerationStage,
    }
    : undefined;
}

function buildGenerationErrorDetails(error: unknown, message: string): string | Record<string, string> {
  const checkpoint = getCheckpointFailureDetails(error);
  return checkpoint ? { message, ...checkpoint } : message;
}

export function registerGenerationWorldRoutes(router: Router): void {
  router.get("/templates", requireWorldWizard, async (_req, res, next) => {
    try {
      const data = await worldService.getTemplates();
      res.status(200).json({
        success: true,
        data,
        message: "Templates loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspiration/analyze", requireWorldWizard, validate({ body: inspirationSchema }), async (req, res, next) => {
    try {
      const data = await worldService.analyzeInspiration(req.body as z.infer<typeof inspirationSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Inspiration analyzed.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/library", requireWorldWizard, validate({ query: libraryListQuerySchema }), async (req, res, next) => {
    try {
      const query = libraryListQuerySchema.parse(req.query);
      const data = await worldService.listLibrary(query);
      res.status(200).json({
        success: true,
        data,
        message: "Library loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/library", requireWorldWizard, validate({ body: libraryCreateSchema }), async (req, res, next) => {
    try {
      const data = await worldService.createLibraryItem(req.body as z.infer<typeof libraryCreateSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "Library item created.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/library/:libraryId/use",
    requireWorldWizard,
    validate({ params: libraryUseParamsSchema, body: libraryUseSchema }),
    async (req, res, next) => {
      try {
        const { libraryId } = req.params as z.infer<typeof libraryUseParamsSchema>;
        const data = await worldService.useLibraryItem(libraryId, req.body as z.infer<typeof libraryUseSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Library item used.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/generate", validate({ body: worldGenerateSchema }), async (req, res, next) => {
    try {
      const { stream, onDone } = await worldService.createWorldGenerateStream(
        req.body as z.infer<typeof worldGenerateSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/skeleton/generate",
    requireWorldWizard,
    validate({ body: worldSkeletonGenerateSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as z.infer<typeof worldSkeletonGenerateSchema>;
        const { generationRunId, ...generationInput } = body;
        const data = await worldService.generateSkeleton({
          ...generationInput,
          checkpointRunId: generationRunId,
          sourceRoute: "/worlds/new",
        } as WorldSkeletonGenerateInput);
        res.status(200).json({
          success: true,
          data,
          message: "World skeleton generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        const failure = summarizeStructuredOutputFailure({ error, fallbackAvailable: false });
        if ([
          "incomplete_json",
          "malformed_json",
          "schema_mismatch",
          "reasoning_budget_exhausted",
          "output_truncated",
          "empty_content",
          "request_too_large",
        ].includes(failure.category)) {
          const userMessage = failure.category === "reasoning_budget_exhausted"
            ? "模型思考占用了本次输出额度，请降低思考深度后重试。"
            : failure.category === "output_truncated"
              ? "世界骨架输出达到额度上限，请降低世界规模后重试。"
              : failure.category === "request_too_large"
                ? "世界骨架携带的上下文超过模型限制，请减少参考内容或拆分生成。"
              : failure.category === "empty_content"
                ? "模型没有返回世界骨架，请重试或切换模型。"
                : "世界骨架未能完整生成，请降低世界规模后重试。";
          next(new AppError(
            userMessage,
            422,
            buildGenerationErrorDetails(
              error,
              "本次没有保存不完整内容。请调整生成规模或思考深度后重新生成；仍失败时可切换模型。",
            ),
          ));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (/timed?\s*out|timeout|超时/i.test(message)) {
          next(new AppError(
            "世界骨架生成超时，请降低世界规模后重试。",
            504,
            buildGenerationErrorDetails(error, "本次没有保存未完成内容；仍超时时请切换模型后重新生成。"),
          ));
          return;
        }
        next(error);
      }
    },
  );

  router.get(
    "/skeleton/generate/latest",
    requireWorldWizard,
    async (_req, res, next) => {
      try {
        const data = await worldService.getLatestUnfinishedSkeletonGenerationSummary();
        res.status(200).json({
          success: true,
          data,
          message: data ? "已找到未完成的世界生成记录。" : "没有未完成的世界生成记录。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/skeleton/generate/:runId",
    requireWorldWizard,
    validate({ params: worldGenerationRunParamsSchema }),
    async (req, res, next) => {
      try {
        const { runId } = req.params as z.infer<typeof worldGenerationRunParamsSchema>;
        const data = await worldService.getSkeletonGenerationSummary(runId);
        if (!data) {
          res.status(404).json({
            success: false,
            error: "世界生成恢复记录不存在。",
          } satisfies ApiResponse<null>);
          return;
        }
        res.status(200).json({
          success: true,
          data,
          message: "世界生成状态已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/skeleton/generate/:runId/recover",
    requireWorldWizard,
    validate({ params: worldGenerationRunParamsSchema }),
    async (req, res, next) => {
      try {
        const { runId } = req.params as z.infer<typeof worldGenerationRunParamsSchema>;
        const summary = await worldService.getSkeletonGenerationSummary(runId);
        if (!summary) {
          res.status(404).json({
            success: false,
            error: "世界生成恢复记录不存在。",
          } satisfies ApiResponse<null>);
          return;
        }
        const data = await worldService.resumeSkeleton(runId);
        res.status(200).json({
          success: true,
          data,
          message: "已从最近完成的世界骨架阶段继续生成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        const failure = summarizeStructuredOutputFailure({ error, fallbackAvailable: false });
        if ([
          "incomplete_json",
          "malformed_json",
          "schema_mismatch",
          "reasoning_budget_exhausted",
          "output_truncated",
          "empty_content",
          "request_too_large",
        ].includes(failure.category)) {
          const userMessage = failure.category === "reasoning_budget_exhausted"
            ? "模型思考占用了本次输出额度，请降低思考深度后重试。"
            : failure.category === "output_truncated"
              ? "世界骨架输出达到额度上限，请降低世界规模后重试。"
              : failure.category === "request_too_large"
                ? "世界骨架携带的上下文超过模型限制，请减少参考内容或拆分生成。"
              : failure.category === "empty_content"
                ? "模型没有返回世界骨架，请重试或切换模型。"
                : "世界骨架未能完整生成，请降低世界规模后重试。";
          next(new AppError(
            userMessage,
            422,
            buildGenerationErrorDetails(
              error,
              "系统保留了已完成阶段，可以从世界生成页面继续；仍失败时可切换模型。",
            ),
          ));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (/timed?\s*out|timeout|超时/i.test(message)) {
          next(new AppError(
            "世界骨架生成超时，请稍后从世界生成页面继续。",
            504,
            buildGenerationErrorDetails(error, "已保留最近完成阶段；仍超时时请切换模型后继续。"),
          ));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/inspiration/analyze/stream",
    requireWorldWizard,
    validate({ body: inspirationSchema }),
    async (req, res) => {
      const runId = `world-inspiration-${Date.now()}`;
      const disposeHeartbeat = initSSE(res);
      const body = req.body as z.infer<typeof inspirationSchema>;
      const isReferenceMode = body.mode === "reference";

      try {
        writeSSEFrame(res, {
          type: "run_status",
          runId,
          status: "queued",
          message: isReferenceMode ? "已开始分析参考作品" : "已开始分析世界灵感",
        });

        const data = await worldService.analyzeInspiration(
          body,
          (message) => {
            writeSSEFrame(res, {
              type: "run_status",
              runId,
              status: "running",
              message,
            });
          },
        );

        writeSSEFrame(res, {
          type: "run_status",
          runId,
          status: "succeeded",
          message: isReferenceMode ? "原作锚点与架空方向已生成" : "概念卡与属性选项已生成",
        });
        writeSSEFrame(res, {
          type: "done",
          fullContent: JSON.stringify(data),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "世界灵感分析失败。";
        writeSSEFrame(res, {
          type: "run_status",
          runId,
          status: "failed",
          message,
        });
        writeSSEFrame(res, {
          type: "error",
          error: message,
        });
      } finally {
        disposeHeartbeat();
        if (!res.writableEnded) {
          res.end();
        }
      }
    },
  );

  router.post("/:id/refine", validate({ params: worldIdSchema, body: worldRefineSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const { stream, onDone } = await worldService.createRefineStream(
        id,
        req.body as z.infer<typeof worldRefineSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      next(error);
    }
  });
}
