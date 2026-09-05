import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskStep, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  WORLD_GENERATION_TASK_STEPS,
  buildSteps,
} from "../taskCenter.shared";
import {
  buildTaskRecoveryHint,
  normalizeFailureSummary,
} from "../taskSupport";
import {
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";

type WorldGenerationRow = {
  id: string;
  requestJson: string;
  sourceRoute: string;
  status: string;
  currentStage: string | null;
  nextStageIndex: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  checkpoints: Array<{ stage: string }>;
};

const WORLD_GENERATION_STAGE_KEYS = WORLD_GENERATION_TASK_STEPS.map((item) => item.key);

function normalizeStatus(status: string): TaskStatus | null {
  return status === "running" || status === "failed" || status === "succeeded" ? status : null;
}

function parseRequest(raw: string): { idea?: string; provider?: string; model?: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      idea: typeof parsed.idea === "string" ? parsed.idea : undefined,
      provider: typeof parsed.provider === "string" ? parsed.provider : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
    };
  } catch {
    return {};
  }
}

function resolveCurrentStage(row: WorldGenerationRow, status: TaskStatus): string | null {
  if (status === "succeeded") {
    return null;
  }
  if (status === "failed") {
    return row.currentStage ?? WORLD_GENERATION_STAGE_KEYS[Math.min(row.nextStageIndex, WORLD_GENERATION_STAGE_KEYS.length - 1)] ?? null;
  }
  return WORLD_GENERATION_STAGE_KEYS[Math.min(Math.max(row.nextStageIndex, 0), WORLD_GENERATION_STAGE_KEYS.length - 1)] ?? null;
}

function resolveProgress(row: WorldGenerationRow, status: TaskStatus): number {
  if (status === "succeeded") {
    return 1;
  }
  return Math.min(0.99, Math.max(0, row.nextStageIndex / WORLD_GENERATION_TASK_STEPS.length));
}

function buildSummary(row: WorldGenerationRow): UnifiedTaskSummary | null {
  const status = normalizeStatus(row.status);
  if (!status) {
    return null;
  }
  const request = parseRequest(row.requestJson);
  const currentStage = resolveCurrentStage(row, status);
  const currentStageLabel = WORLD_GENERATION_TASK_STEPS.find((item) => item.key === currentStage)?.label ?? null;
  const failureSummary = status === "failed"
    ? normalizeFailureSummary(row.lastError, "世界骨架生成失败，但没有记录明确错误。")
    : null;
  return {
    id: row.id,
    kind: "world_generation",
    title: `世界骨架生成：${request.idea?.trim().slice(0, 60) || "未命名世界"}`,
    status,
    progress: resolveProgress(row, status),
    currentStage,
    currentItemLabel: currentStageLabel,
    displayStatus: status === "failed" ? "等待从世界生成页面继续" : currentStageLabel ?? "世界骨架已完成",
    attemptCount: 0,
    maxAttempts: 1,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    heartbeatAt: status === "running" ? row.updatedAt.toISOString() : null,
    ownerId: row.id,
    ownerLabel: "世界生成向导",
    sourceRoute: row.sourceRoute,
    lastHealthyStage: row.checkpoints[0]?.stage ?? null,
    failureCode: status === "failed" ? "WORLD_SKELETON_GENERATION_FAILED" : null,
    failureSummary,
    recoveryHint: buildTaskRecoveryHint("world_generation", status),
    sourceResource: {
      type: "world",
      id: row.id,
      label: "世界生成向导",
      route: row.sourceRoute,
    },
    targetResources: [{
      type: "world",
      id: row.id,
      label: "世界骨架检查点",
      route: row.sourceRoute,
    }],
  } satisfies UnifiedTaskSummary;
}

export class WorldGenerationTaskAdapter {
  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "queued" || input.status === "waiting_approval" || input.status === "cancelled") {
      return [];
    }
    const archivedIds = await getArchivedTaskIds("world_generation");
    const rows = await prisma.worldGenerationRun.findMany({
      where: {
        status: input.status ? input.status : { in: ["running", "failed", "succeeded"] },
        ...(archivedIds.length ? { id: { notIn: archivedIds } } : {}),
        ...(input.keyword
          ? {
            OR: [
              { id: { contains: input.keyword } },
              { requestJson: { contains: input.keyword } },
              { currentStage: { contains: input.keyword } },
            ],
          }
          : {}),
      },
      include: { checkpoints: { orderBy: { sequence: "desc" }, take: 1 } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });
    return rows.map((row) => buildSummary(row as WorldGenerationRow)).filter((item): item is UnifiedTaskSummary => Boolean(item));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("world_generation", id)) {
      return null;
    }
    const row = await prisma.worldGenerationRun.findUnique({
      where: { id },
      include: { checkpoints: { orderBy: { sequence: "desc" }, take: 1 } },
    });
    if (!row) {
      return null;
    }
    const summary = buildSummary(row as WorldGenerationRow);
    if (!summary) {
      return null;
    }
    const request = parseRequest(row.requestJson);
    const steps: UnifiedTaskStep[] = buildSteps(
      WORLD_GENERATION_TASK_STEPS,
      summary.status,
      summary.currentStage,
      summary.createdAt,
      summary.updatedAt,
    );
    return {
      ...summary,
      provider: request.provider ?? null,
      model: request.model ?? null,
      startedAt: summary.createdAt,
      finishedAt: summary.status === "succeeded" || summary.status === "failed" ? summary.updatedAt : null,
      retryCountLabel: "阶段内最多重试一次",
      meta: {
        checkpointRunId: row.id,
        latestStage: row.checkpoints[0]?.stage ?? null,
        nextStageIndex: row.nextStageIndex,
        sourceRoute: row.sourceRoute,
      },
      steps,
      failureDetails: row.lastError,
    };
  }

  async retry(_id: string): Promise<UnifiedTaskDetail> {
    throw new AppError("世界生成恢复请回到世界生成页面处理。", 409);
  }

  async cancel(_id: string): Promise<UnifiedTaskDetail> {
    throw new AppError("世界生成恢复请回到世界生成页面处理。", 409);
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("world_generation", id)) {
      return null;
    }
    throw new AppError("世界生成记录只能在世界生成页面处理。", 409);
  }
}
