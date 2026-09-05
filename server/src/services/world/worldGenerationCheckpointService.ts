import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import {
  createEmptyWorldStructure,
  normalizeWorldStructuredData,
} from "./worldStructure";
import type {
  WorldSkeletonCheckpointResumeState,
  WorldSkeletonCheckpointStore,
  WorldSkeletonGenerateInput,
} from "./worldSkeletonGeneration";
import type {
  WorldSkeletonGenerationCheckpointSummary,
  WorldSkeletonGenerationPayload,
} from "@ai-novel/shared/types/worldWizard";

type PersistedWorldSkeletonRequest = Omit<
  WorldSkeletonGenerateInput,
  "checkpointStore" | "checkpointRunId" | "sourceRoute"
>;

interface StoredCheckpoint {
  runId: string;
  request: WorldSkeletonGenerateInput;
  structure: ReturnType<typeof normalizeWorldStructuredData>;
  nextStageIndex: number;
  status: "running" | "failed" | "succeeded";
  finalPayload?: WorldSkeletonGenerationPayload;
}

function serializeRequest(request: WorldSkeletonGenerateInput): string {
  const {
    checkpointStore: _checkpointStore,
    checkpointRunId: _checkpointRunId,
    sourceRoute: _sourceRoute,
    ...persisted
  } = request;
  return JSON.stringify(persisted);
}

function parseRequest(raw: string): WorldSkeletonGenerateInput {
  try {
    const parsed = JSON.parse(raw) as PersistedWorldSkeletonRequest;
    if (!parsed || typeof parsed !== "object" || typeof parsed.idea !== "string") {
      throw new Error("invalid world generation request");
    }
    return parsed;
  } catch {
    throw new Error("世界生成恢复记录缺少有效的原始请求。");
  }
}

function parseStructure(raw: string | null | undefined) {
  if (!raw) {
    return createEmptyWorldStructure();
  }
  try {
    return normalizeWorldStructuredData(JSON.parse(raw));
  } catch {
    throw new Error("世界生成恢复记录缺少有效的结构快照。");
  }
}

function parsePayload(raw: string | null | undefined): WorldSkeletonGenerationPayload | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as WorldSkeletonGenerationPayload;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function requestHash(requestJson: string): string {
  return createHash("sha256").update(requestJson).digest("hex");
}

export class WorldGenerationCheckpointService implements WorldSkeletonCheckpointStore {
  async startOrResume(input: {
    runId?: string;
    request: WorldSkeletonGenerateInput;
    sourceRoute: string;
  }): Promise<WorldSkeletonCheckpointResumeState> {
    const run = input.runId
      ? await prisma.worldGenerationRun.findUnique({
        where: { id: input.runId },
        include: { checkpoints: { orderBy: { sequence: "desc" }, take: 1 } },
      })
      : await prisma.worldGenerationRun.create({
        data: {
          requestHash: requestHash(serializeRequest(input.request)),
          requestJson: serializeRequest(input.request),
          sourceRoute: input.sourceRoute,
          status: "running",
        },
        include: { checkpoints: true },
      });

    if (!run) {
      throw new Error("世界生成恢复记录不存在。");
    }

    const persistedRequest = parseRequest(run.requestJson);
    const latestCheckpoint = run.checkpoints[0];
    const status = run.status === "succeeded" || run.status === "failed" ? run.status : "running";
    return {
      runId: run.id,
      request: persistedRequest,
      structure: parseStructure(latestCheckpoint?.structureJson),
      nextStageIndex: Math.max(0, run.nextStageIndex),
      status,
      finalPayload: parsePayload(run.finalPayloadJson),
    };
  }

  async saveStage(input: {
    runId: string;
    sequence: number;
    stage: string;
    structure: ReturnType<typeof normalizeWorldStructuredData>;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.worldGenerationCheckpoint.upsert({
        where: {
          runId_sequence: {
            runId: input.runId,
            sequence: input.sequence,
          },
        },
        create: {
          runId: input.runId,
          sequence: input.sequence,
          stage: input.stage,
          structureJson: JSON.stringify(input.structure),
          summary: `世界骨架阶段 ${input.stage} 已完成`,
        },
        update: {
          stage: input.stage,
          structureJson: JSON.stringify(input.structure),
          summary: `世界骨架阶段 ${input.stage} 已完成`,
        },
      }),
      prisma.worldGenerationRun.update({
        where: { id: input.runId },
        data: {
          status: "running",
          currentStage: input.stage,
          nextStageIndex: input.sequence,
          lastError: null,
        },
      }),
    ]);
  }

  async complete(input: {
    runId: string;
    sequence: number;
    payload: WorldSkeletonGenerationPayload;
  }): Promise<void> {
    await prisma.worldGenerationRun.update({
      where: { id: input.runId },
      data: {
        status: "succeeded",
        currentStage: null,
        nextStageIndex: input.sequence,
        finalPayloadJson: JSON.stringify(input.payload),
        lastError: null,
      },
    });
  }

  async fail(input: {
    runId: string;
    stage: string;
    error: unknown;
  }): Promise<void> {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    await prisma.worldGenerationRun.update({
      where: { id: input.runId },
      data: {
        status: "failed",
        currentStage: input.stage,
        lastError: message.slice(0, 2_000),
      },
    });
  }

  async getSummary(runId: string): Promise<WorldSkeletonGenerationCheckpointSummary | null> {
    const run = await prisma.worldGenerationRun.findUnique({
      where: { id: runId },
      include: { checkpoints: { orderBy: { sequence: "desc" }, take: 1 } },
    });
    if (!run) {
      return null;
    }
    const status = run.status === "succeeded" || run.status === "failed" ? run.status : "running";
    return {
      runId: run.id,
      status,
      currentStage: run.currentStage,
      nextStageIndex: Math.max(0, run.nextStageIndex),
      latestStage: run.checkpoints[0]?.stage ?? null,
      lastError: run.lastError,
      sourceRoute: run.sourceRoute,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}

export const worldGenerationCheckpointService = new WorldGenerationCheckpointService();
