import { Prisma } from "@prisma/client";
import type {
  CreationDirection,
  CreationIntentInterpretation,
  CreationStudioConfirmRequest,
  CreationStudioInterpretRequest,
  CreationStudioRegenerateRequest,
  CreationStudioReplaceDirectionRequest,
  CreationStudioTaskProjection,
  NarrativeForm,
} from "@ai-novel/shared/types/creationStudio";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import type { WritingPlatform, WritingPlatformPreference } from "@ai-novel/shared/types/writingPlatform";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { creationDirectionReplacePrompt, creationIntentInterpretPrompt, requestedCreationDirectionCount } from "../../../../prompting/prompts/creation/creationIntent.prompts";
import { NovelDirectorService } from "../../../../services/novel/director/NovelDirectorService";
import { novelCreateResourceRecommendationService } from "../../../../services/novel/NovelCreateResourceRecommendationService";
import { NovelWorkflowService } from "../../../../services/novel/workflow/NovelWorkflowService";
import { parseSeedPayload, resumeTargetToRoute } from "../../../../services/novel/workflow/novelWorkflow.shared";
import { shortStoryProductionService } from "../../short-story/application/ShortStoryProductionService";
import { supportsWritingPlatformForm, writingPlatformProfileService } from "../../writing-platform";
import { canClaimDirectionEdit, canClaimDirectionRegeneration, canRestorePriorDirections, matchesCurrentDirectionVersion } from "../domain/directionIntentState";

interface CreationStudioSeed {
  idea: string;
  derivedFromNovelId?: string;
  currentIntentVersionId?: string;
  selectedDirectionId?: string;
  productionTaskId?: string;
  confirmedNarrativeForm?: NarrativeForm;
  writingPlatformPreference?: WritingPlatformPreference;
  confirmedWritingPlatform?: WritingPlatform;
  directionConfirmationClaimed?: boolean;
}

export interface CreationStudioConfirmationResult {
  taskId: string;
  novelId: string;
  productionTaskId: string;
  narrativeForm: NarrativeForm;
  resumeRoute: string;
}

function parseInterpretation(value: string): CreationIntentInterpretation {
  return JSON.parse(value) as CreationIntentInterpretation;
}

function targetChapterCount(targetWordCount: number): number {
  return Math.max(30, Math.min(2000, Math.ceil(targetWordCount / 2500)));
}

function toDirectorCandidate(direction: CreationDirection, targetWordCount: number, writingPlatform: WritingPlatform): DirectorCandidate {
  return {
    id: direction.id,
    workingTitle: direction.title,
    logline: direction.premise,
    positioning: direction.coreExperience,
    sellingPoint: direction.coreExperience,
    coreConflict: direction.centralConflict,
    protagonistPath: direction.protagonist,
    endingDirection: direction.endingPromise,
    hookStrategy: `围绕“${direction.centralConflict}”尽快建立第一轮追读问题。`,
    progressionLoop: "通过冲突升级、人物选择与阶段回报持续推进。",
    whyItFits: "该方向来自用户在创作工作室确认的意图。",
    recommendedWritingPlatform: writingPlatform === "zhihu_story" ? "fanqie_free" : writingPlatform,
    writingPlatformReason: "平台已在创作工作室由用户确认，自动导演沿用该选择。",
    toneKeywords: direction.styleKeywords,
    targetChapterCount: targetChapterCount(targetWordCount),
  };
}

export class CreationStudioService {
  private readonly workflowService = new NovelWorkflowService();
  private readonly directorService = new NovelDirectorService();
  private readonly editingTasks = new Set<string>();

  private async withEditLock<T>(taskId: string, action: () => Promise<T>): Promise<T> {
    if (this.editingTasks.has(taskId)) throw new AppError("方向正在处理中，请稍后重试。", 409);
    this.editingTasks.add(taskId);
    try { return await action(); } finally { this.editingTasks.delete(taskId); }
  }

  async interpret(input: CreationStudioInterpretRequest): Promise<CreationStudioTaskProjection> {
    const idea = input.idea.trim();
    if (!idea) {
      throw new AppError("请先写下你想创作的内容。", 400);
    }
    const task = await this.workflowService.bootstrapTask({
      lane: "creation_studio",
      title: "把想法写成作品",
      forceNew: true,
      seedPayload: { idea },
    });
    return this.runInterpretation(task.id, {
      idea,
      preferredNarrativeForm: input.preferredNarrativeForm,
      targetWordCount: input.targetWordCount,
      writingPlatformPreference: input.writingPlatformPreference,
      directionCount: input.preferredNarrativeForm === "short_story" ? input.directionCount ?? 4 : 2,
      source: "initial",
    });
  }

  async createDerivedLongForm(sourceNovelId: string): Promise<CreationStudioTaskProjection> {
    const source = await prisma.novel.findUnique({
      where: { id: sourceNovelId },
      include: {
        shortStorySegments: { orderBy: { order: "asc" } },
        intentVersions: {
          where: { status: "active" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    if (!source || source.narrativeForm !== "short_story") {
      throw new AppError("只能从短篇作品发展成长篇。", 400);
    }
    const activeIntent = source.intentVersions[0];
    const storyDigest = source.shortStorySegments
      .map((segment) => segment.content.trim())
      .join("\n\n")
      .slice(0, 8000);
    const idea = [
      `请把短篇《${source.title}》发展成一部长篇，同时保留原作的核心人物、核心冲突和结尾意义。`,
      activeIntent ? `原始创作意图：${activeIntent.originalExpression}` : "",
      `短篇成稿摘要素材：${storyDigest}`,
    ].filter(Boolean).join("\n\n");
    const task = await this.workflowService.bootstrapTask({
      lane: "creation_studio",
      title: `发展《${source.title}》成长篇`,
      forceNew: true,
      seedPayload: { idea, derivedFromNovelId: source.id },
    });
    return this.runInterpretation(task.id, {
      idea,
      preferredNarrativeForm: "long_novel",
      targetWordCount: 200000,
      source: "derived",
    });
  }

  async regenerate(taskId: string, input: CreationStudioRegenerateRequest): Promise<CreationStudioTaskProjection> {
    return this.withEditLock(taskId, () => this.regenerateUnlocked(taskId, input));
  }

  private async regenerateUnlocked(taskId: string, input: CreationStudioRegenerateRequest): Promise<CreationStudioTaskProjection> {
    this.assertTarget(input.narrativeForm, input.targetWordCount);
    const task = await this.requireCreationTask(taskId);
    const seed = parseSeedPayload<CreationStudioSeed>(task.seedPayloadJson);
    if (!seed?.idea) {
      throw new AppError("当前创作任务缺少原始想法，请重新开始。", 409);
    }
    if (task.novelId) {
      throw new AppError("作品已开始生成，不能再替换确认前方向。", 409);
    }
    const confirmation = await prisma.creationStudioConfirmation.findUnique({ where: { workflowTaskId: taskId } });
    if (!canClaimDirectionRegeneration({
      status: task.status,
      novelId: task.novelId,
      hasConfirmation: Boolean(confirmation),
      directionConfirmationClaimed: seed.directionConfirmationClaimed,
    })) throw new AppError("方向正在处理或已进入确认流程，请刷新后重试。", 409);
    const claimed = await prisma.novelWorkflowTask.updateMany({
      where: {
        id: taskId,
        status: task.status,
        novelId: null,
        seedPayloadJson: task.seedPayloadJson,
      },
      data: { status: "running" },
    });
    if (claimed.count !== 1) throw new AppError("方向正在处理或已更新，请刷新后重试。", 409);
    return this.runInterpretation(task.id, {
      idea: seed.idea,
      preferredNarrativeForm: input.narrativeForm,
      targetWordCount: input.targetWordCount,
      feedback: input.feedback,
      writingPlatformPreference: input.writingPlatformPreference,
      directionCount: input.narrativeForm === "short_story" ? input.directionCount ?? 4 : 2,
      source: "regenerated",
    });
  }

  async replaceDirection(taskId: string, input: CreationStudioReplaceDirectionRequest): Promise<CreationStudioTaskProjection> {
    return this.withEditLock(taskId, async () => {
      const task = await this.requireCreationTask(taskId);
      const seed = parseSeedPayload<CreationStudioSeed>(task.seedPayloadJson);
      if (task.novelId || task.status !== "waiting_approval" || !seed || !canClaimDirectionEdit(seed, input.intentVersionId)) {
        throw new AppError("当前方向不能替换，请刷新后重试。", 409);
      }
      const confirmation = await prisma.creationStudioConfirmation.findUnique({ where: { workflowTaskId: taskId } });
      if (confirmation) throw new AppError("方向正在确认中，不能替换。", 409);
      const intent = await prisma.novelIntentVersion.findUnique({ where: { id: seed.currentIntentVersionId } });
      if (!intent) throw new AppError("当前方向已失效，请刷新后重试。", 409);
      const interpretation = parseInterpretation(intent.structuredIntentJson);
      if (interpretation.recommendedNarrativeForm !== "short_story") throw new AppError("仅短篇方向可以单独替换。", 400);
      const current = interpretation.directions.find((item) => item.id === input.directionId);
      if (!current) throw new AppError("所选方向已失效，请刷新后重试。", 400);
      const others = interpretation.directions.filter((item) => item.id !== input.directionId);
      const generated = await runStructuredPrompt({
        asset: creationDirectionReplacePrompt,
        promptInput: {
          idea: seed.idea,
          understanding: interpretation.understanding,
          targetWordCount: interpretation.recommendedTargetWordCount,
          writingPlatform: interpretation.recommendedWritingPlatform,
          currentDirection: current,
          otherDirections: others,
          feedback: input.feedback,
        },
        options: { taskId, stage: "creation_intent", itemKey: `replace:${input.directionId}`, entrypoint: "creation_studio", temperature: 0.8 },
      });
      const replacement = { ...generated.output, id: current.id };
      if (others.some((item) => item.title === replacement.title || item.premise === replacement.premise)) {
        throw new AppError("新方向与保留的方向太相似，请补充反馈后重试。", 422);
      }
      const updated: CreationIntentInterpretation = {
        ...interpretation,
        productionFoundation: undefined,
        directions: interpretation.directions.map((item) => item.id === current.id ? replacement : item),
      };
      await prisma.$transaction(async (tx) => {
        const [currentTask, currentConfirmation] = await Promise.all([
          tx.novelWorkflowTask.findUnique({ where: { id: taskId } }),
          tx.creationStudioConfirmation.findUnique({ where: { workflowTaskId: taskId } }),
        ]);
        const currentSeed = parseSeedPayload<CreationStudioSeed>(currentTask?.seedPayloadJson);
        if (currentTask?.novelId || currentTask?.status !== "waiting_approval" || currentConfirmation || !canClaimDirectionEdit(currentSeed, input.intentVersionId) || input.intentVersionId !== intent.id) {
          throw new AppError("方向正在确认或已更新，请刷新后重试。", 409);
        }
        const latest = await tx.novelIntentVersion.findFirst({ where: { workflowTaskId: taskId }, orderBy: { version: "desc" } });
        if (latest?.id !== intent.id) throw new AppError("方向已更新，请刷新后重试。", 409);
        const created = await tx.novelIntentVersion.create({
          data: {
            workflowTaskId: taskId, previousVersionId: intent.id, version: intent.version + 1,
            status: "proposed", source: "regenerated", originalExpression: seed.idea,
            structuredIntentJson: JSON.stringify(updated),
          },
        });
        await tx.novelIntentVersion.update({ where: { id: intent.id }, data: { status: "superseded" } });
        const replaced = await tx.novelWorkflowTask.updateMany({
          where: { id: taskId, status: "waiting_approval", novelId: null, seedPayloadJson: currentTask.seedPayloadJson },
          data: { seedPayloadJson: JSON.stringify({ ...currentSeed, currentIntentVersionId: created.id, selectedDirectionId: undefined }) },
        });
        if (replaced.count !== 1) throw new AppError("方向正在确认或已更新，请刷新后重试。", 409);
      });
      return this.getProjection(taskId);
    });
  }

  async getProjection(taskId: string): Promise<CreationStudioTaskProjection> {
    const task = await this.requireCreationTask(taskId);
    const seed = parseSeedPayload<CreationStudioSeed>(task.seedPayloadJson) ?? { idea: "" };
    const intent = seed.currentIntentVersionId
      ? await prisma.novelIntentVersion.findUnique({ where: { id: seed.currentIntentVersionId } })
      : await prisma.novelIntentVersion.findFirst({
        where: { workflowTaskId: task.id },
        orderBy: { version: "desc" },
      });
    const interpretation = intent ? parseInterpretation(intent.structuredIntentJson) : null;
    const confirmation = await prisma.creationStudioConfirmation.findUnique({
      where: { workflowTaskId: task.id },
    });
    const resumeTarget = task.resumeTargetJson
      ? JSON.parse(task.resumeTargetJson) as Parameters<typeof resumeTargetToRoute>[0]
      : null;
    const resumeRoute = confirmation?.narrativeForm === "long_novel" && confirmation.novelId
      ? `/novels/${confirmation.novelId}/edit`
      : resumeTargetToRoute(resumeTarget);
    return {
      taskId: task.id,
      intentVersionId: intent?.id ?? null,
      status: task.status,
      progress: task.progress,
      currentAction: task.currentItemLabel,
      idea: seed.idea,
      interpretation,
      selectedDirectionId: seed.selectedDirectionId ?? null,
      novelId: confirmation?.novelId ?? task.novelId,
      productionTaskId: confirmation?.productionTaskId ?? seed.productionTaskId ?? null,
      resumeRoute,
      error: task.lastError,
    };
  }

  async confirm(taskId: string, input: CreationStudioConfirmRequest): Promise<CreationStudioConfirmationResult> {
    return this.withEditLock(taskId, () => this.confirmUnlocked(taskId, input));
  }

  private async confirmUnlocked(taskId: string, input: CreationStudioConfirmRequest): Promise<CreationStudioConfirmationResult> {
    const task = await this.requireCreationTask(taskId);
    const currentSeed = parseSeedPayload<CreationStudioSeed>(task.seedPayloadJson);
    if (!matchesCurrentDirectionVersion(currentSeed?.currentIntentVersionId, input.intentVersionId)) {
      throw new AppError("方向已更新，请重新选择后继续。", 409);
    }
    const existing = await prisma.creationStudioConfirmation.findUnique({ where: { workflowTaskId: task.id } });
    if (existing) {
      if (existing.idempotencyKey !== input.idempotencyKey) {
        throw new AppError("该创作方向已确认，请继续原有作品。", 409);
      }
      if (!existing.novelId || !existing.productionTaskId) {
        if (existing.status !== "failed") {
          throw new AppError("确认请求正在处理中，请稍后重试。", 409);
        }
        const claimed = await prisma.creationStudioConfirmation.updateMany({
          where: { id: existing.id, status: "failed", novelId: null, productionTaskId: null },
          data: { status: "claimed" },
        });
        if (claimed.count !== 1) {
          const latest = await prisma.creationStudioConfirmation.findUnique({ where: { id: existing.id } });
          if (latest?.novelId && latest.productionTaskId) {
            return this.buildConfirmationResult(task.id, latest.narrativeForm, latest.novelId, latest.productionTaskId);
          }
          throw new AppError("确认请求正在处理中，请稍后重试。", 409);
        }
      } else {
        return this.buildConfirmationResult(task.id, existing.narrativeForm, existing.novelId, existing.productionTaskId);
      }
    }

    const seed = parseSeedPayload<CreationStudioSeed>(task.seedPayloadJson);
    const intent = seed?.currentIntentVersionId
      ? await prisma.novelIntentVersion.findUnique({ where: { id: seed.currentIntentVersionId } })
      : null;
    if (!seed?.idea || !intent) {
      throw new AppError("请先完成想法理解并选择一个方向。", 409);
    }
    if (!matchesCurrentDirectionVersion(intent.id, input.intentVersionId)) {
      throw new AppError("方向已更新，请重新选择后继续。", 409);
    }
    const interpretation = parseInterpretation(intent.structuredIntentJson);
    const direction = interpretation.directions.find((item) => item.id === input.directionId);
    if (!direction) {
      throw new AppError("所选方向已失效，请重新选择。", 400);
    }
    this.assertTarget(input.narrativeForm, input.targetWordCount);
    if (!supportsWritingPlatformForm(input.writingPlatform, input.narrativeForm)) {
      throw new AppError("所选平台不支持当前作品规模，请重新选择。", 400);
    }

    if (!existing) {
      try {
        await prisma.$transaction(async (tx) => {
          const currentTask = await tx.novelWorkflowTask.findUnique({ where: { id: task.id } });
          const currentSeed = parseSeedPayload<CreationStudioSeed>(currentTask?.seedPayloadJson);
          if (currentTask?.novelId || currentTask?.status !== "waiting_approval" || !canClaimDirectionEdit(currentSeed, intent.id)) {
            throw new AppError("方向已更新，请重新选择后继续。", 409);
          }
          const claimed = await tx.novelWorkflowTask.updateMany({
            where: { id: task.id, status: "waiting_approval", novelId: null, seedPayloadJson: currentTask.seedPayloadJson },
            data: { seedPayloadJson: JSON.stringify({ ...currentSeed, directionConfirmationClaimed: true }) },
          });
          if (claimed.count !== 1) throw new AppError("方向已更新，请重新选择后继续。", 409);
          await tx.creationStudioConfirmation.create({
            data: {
              workflowTaskId: task.id,
              idempotencyKey: input.idempotencyKey,
              narrativeForm: input.narrativeForm,
            },
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return this.confirmUnlocked(taskId, input);
        }
        throw error;
      }
    }

    if (input.narrativeForm === "short_story") {
      return this.confirmShortStory(task.id, seed, intent.id, direction, input);
    }
    return this.confirmLongNovel(task.id, seed, intent.id, direction, input);
  }

  private async runInterpretation(taskId: string, input: {
    idea: string;
    preferredNarrativeForm?: NarrativeForm;
    targetWordCount?: number;
    feedback?: string;
    writingPlatformPreference?: WritingPlatformPreference;
    directionCount?: 2 | 4 | 6;
    source: "initial" | "regenerated" | "derived";
  }): Promise<CreationStudioTaskProjection> {
    if (input.targetWordCount !== undefined) {
      const inferredForm = input.preferredNarrativeForm
        ?? (input.targetWordCount > 30000 ? "long_novel" : "short_story");
      this.assertTarget(inferredForm, input.targetWordCount);
    }
    try {
      await this.workflowService.markTaskRunning(taskId, {
        stage: "creation_intent",
        itemKey: "interpret",
        itemLabel: "正在理解你的想法",
        progress: 0.04,
      });
      const generated = await runStructuredPrompt({
        asset: creationIntentInterpretPrompt,
        promptInput: input,
        options: {
          taskId,
          stage: "creation_intent",
          itemKey: "interpret",
          entrypoint: "creation_studio",
          temperature: 0.7,
        },
      });
      const expectedCount = requestedCreationDirectionCount(input, generated.output.recommendedNarrativeForm);
      if (generated.output.directions.length !== expectedCount) {
        throw new Error(`AI 应提供 ${expectedCount} 个创作方向。`);
      }
      const productionFoundation = generated.output.recommendedNarrativeForm === "long_novel" ? await novelCreateResourceRecommendationService.resolveRequired({
        title: generated.output.directions[0].title,
        description: [
          generated.output.understanding,
          ...generated.output.directions.map((item) => `${item.title}：${item.premise}`),
        ].join("\n"),
        targetAudience: generated.output.directions[0].coreExperience,
        bookSellingPoint: generated.output.directions[0].coreExperience,
        styleTone: generated.output.directions[0].styleKeywords.join("、"),
        projectMode: "auto_pipeline",
        writingMode: "original",
      }) : null;
      const interpretedOutput: CreationIntentInterpretation = {
        ...generated.output,
        ...(productionFoundation ? { productionFoundation: productionFoundation.recommendation } : {}),
      };
      const latest = await prisma.novelIntentVersion.findFirst({
        where: { workflowTaskId: taskId },
        orderBy: { version: "desc" },
      });
      const version = (latest?.version ?? 0) + 1;
      const created = await prisma.$transaction(async (tx) => {
        if (latest) {
          await tx.novelIntentVersion.update({
            where: { id: latest.id },
            data: { status: "superseded" },
          });
        }
        return tx.novelIntentVersion.create({
          data: {
            workflowTaskId: taskId,
            previousVersionId: latest?.id,
            version,
            status: "proposed",
            source: input.source,
            originalExpression: input.idea,
            structuredIntentJson: JSON.stringify(interpretedOutput),
          },
        });
      });
      await this.workflowService.markTaskWaitingApproval(taskId, {
        stage: "creation_intent",
        itemKey: "direction_confirmation",
        itemLabel: "方向已准备好，请选择一个继续",
        progress: 0.12,
        seedPayload: {
          idea: input.idea,
          currentIntentVersionId: created.id,
          writingPlatformPreference: input.writingPlatformPreference,
        },
      });
      return this.getProjection(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 暂时无法理解这个想法，请重试。";
      const currentTask = await this.requireCreationTask(taskId);
      const currentSeed = parseSeedPayload<CreationStudioSeed>(currentTask.seedPayloadJson);
      const priorIntent = currentSeed?.currentIntentVersionId
        ? await prisma.novelIntentVersion.findUnique({ where: { id: currentSeed.currentIntentVersionId } })
        : null;
      if (canRestorePriorDirections({ taskId, currentIntentVersionId: currentSeed?.currentIntentVersionId, priorIntent })) {
        await this.workflowService.markTaskWaitingApproval(taskId, {
          stage: "creation_intent",
          itemKey: "direction_confirmation",
          itemLabel: "原有方向可继续选择；更新未完成",
          progress: 0.12,
        });
        throw error;
      }
      await this.workflowService.markTaskFailed(taskId, message, {
        stage: "creation_intent",
        itemKey: "interpret",
        itemLabel: "想法理解未完成，可以重试",
      });
      throw error;
    }
  }

  private async confirmShortStory(
    taskId: string,
    seed: CreationStudioSeed,
    intentVersionId: string,
    direction: CreationDirection,
    input: CreationStudioConfirmRequest,
  ): Promise<CreationStudioConfirmationResult> {
    const novel = await (async () => {
      try {
        const platformSnapshot = await writingPlatformProfileService.snapshot(input.writingPlatform, "short_story");
        const foundation = await novelCreateResourceRecommendationService.resolveRequired({
          title: direction.title,
          description: direction.premise,
          bookSellingPoint: direction.coreExperience,
          styleTone: direction.styleKeywords.join("、"),
          writingMode: "original",
          projectMode: "ai_led",
        });
        return await prisma.$transaction(async (tx) => {
          const created = await tx.novel.create({
            data: {
              title: direction.title,
              description: direction.premise,
              bookSellingPoint: direction.coreExperience,
              narrativeForm: "short_story",
              targetWordCount: input.targetWordCount,
              creationExperience: "professional",
              writingMode: "original",
              projectMode: "ai_led",
              genreId: foundation.genreId,
              primaryStoryModeId: foundation.primaryStoryModeId,
              secondaryStoryModeId: foundation.secondaryStoryModeId,
              writingPlatform: input.writingPlatform,
              writingPlatformProfileVersion: platformSnapshot.profileVersion,
              writingPlatformSnapshotJson: JSON.stringify(platformSnapshot),
            },
          });
          await tx.novelIntentVersion.update({
            where: { id: intentVersionId },
            data: {
              novelId: created.id,
              status: "active",
              impactScopeJson: JSON.stringify({ selectedDirectionId: direction.id }),
            },
          });
          await tx.creationStudioConfirmation.update({
            where: { workflowTaskId: taskId },
            data: {
              novelId: created.id,
              productionTaskId: taskId,
              status: "confirmed",
            },
          });
          return created;
        });
      } catch (error) {
        await prisma.creationStudioConfirmation.updateMany({
          where: { workflowTaskId: taskId, status: "claimed", novelId: null },
          data: { status: "failed" },
        });
        throw error;
      }
    })();
    await this.workflowService.attachNovelToTask(taskId, novel.id, "short_story_plan");
    await this.workflowService.markTaskRunning(taskId, {
      stage: "short_story_plan",
      itemKey: "short_story_plan",
      itemLabel: "正在规划完整短篇",
      progress: 0.16,
      seedPayload: {
        ...seed,
        selectedDirectionId: direction.id,
        productionTaskId: taskId,
        confirmedNarrativeForm: "short_story",
        confirmedWritingPlatform: input.writingPlatform,
      },
    });
    shortStoryProductionService.schedule(taskId);
    return this.buildConfirmationResult(taskId, "short_story", novel.id, taskId);
  }

  private async confirmLongNovel(
    taskId: string,
    seed: CreationStudioSeed,
    intentVersionId: string,
    direction: CreationDirection,
    input: CreationStudioConfirmRequest,
  ): Promise<CreationStudioConfirmationResult> {
    try {
      const platformSnapshot = await writingPlatformProfileService.snapshot(input.writingPlatform, "long_novel");
      const intent = await prisma.novelIntentVersion.findUnique({ where: { id: intentVersionId } });
      const interpretation = intent ? parseInterpretation(intent.structuredIntentJson) : null;
      const foundation = interpretation?.productionFoundation
        ? {
          genreId: interpretation.productionFoundation.genre.id,
          primaryStoryModeId: interpretation.productionFoundation.primaryStoryMode.id,
          secondaryStoryModeId: interpretation.productionFoundation.secondaryStoryMode?.id,
        }
        : await novelCreateResourceRecommendationService.resolveRequired({
          title: direction.title,
          description: direction.premise,
          bookSellingPoint: direction.coreExperience,
          styleTone: direction.styleKeywords.join("、"),
          writingMode: "original",
          projectMode: "auto_pipeline",
        });
      const result = await this.directorService.confirmCandidate({
        idea: seed.idea,
        candidate: toDirectorCandidate(direction, input.targetWordCount, input.writingPlatform),
        title: direction.title,
        description: direction.premise,
        bookSellingPoint: direction.coreExperience,
        styleTone: direction.styleKeywords.join("、"),
        estimatedChapterCount: targetChapterCount(input.targetWordCount),
        defaultChapterLength: 2500,
        projectMode: "auto_pipeline",
        writingMode: "original",
        writingPlatformPreference: input.writingPlatform,
        genreId: foundation.genreId,
        primaryStoryModeId: foundation.primaryStoryModeId,
        secondaryStoryModeId: foundation.secondaryStoryModeId,
      });
      const productionTaskId = result.workflowTaskId;
      if (!productionTaskId) {
        throw new Error("长篇自动导演未返回生产任务。");
      }
      await prisma.$transaction([
        prisma.novelIntentVersion.update({
          where: { id: intentVersionId },
          data: {
            novelId: result.novel.id,
            status: "active",
            impactScopeJson: JSON.stringify({ selectedDirectionId: direction.id }),
          },
        }),
        prisma.creationStudioConfirmation.update({
          where: { workflowTaskId: taskId },
          data: {
            novelId: result.novel.id,
            productionTaskId,
            status: "handed_off",
          },
        }),
      ]);
      if (seed.derivedFromNovelId) {
        await prisma.novel.update({
          where: { id: result.novel.id },
          data: { derivedFromNovelId: seed.derivedFromNovelId },
        });
      }
      await prisma.novel.update({
        where: { id: result.novel.id },
        data: {
          writingPlatform: input.writingPlatform,
          writingPlatformProfileVersion: platformSnapshot.profileVersion,
          writingPlatformSnapshotJson: JSON.stringify(platformSnapshot),
        },
      });
      await this.workflowService.recordCheckpoint(taskId, {
        stage: "creation_intent",
        checkpointType: "workflow_completed",
        checkpointSummary: "创作方向已交给长篇自动导演继续完成。",
        itemLabel: "长篇创作已开始",
        progress: 1,
        seedPayload: {
          ...seed,
          selectedDirectionId: direction.id,
          productionTaskId,
          confirmedNarrativeForm: "long_novel",
          confirmedWritingPlatform: input.writingPlatform,
        },
      });
      return this.buildConfirmationResult(
        taskId,
        "long_novel",
        result.novel.id,
        productionTaskId,
      );
    } catch (error) {
      await prisma.creationStudioConfirmation.update({
        where: { workflowTaskId: taskId },
        data: { status: "failed" },
      });
      throw error;
    }
  }

  private async requireCreationTask(taskId: string) {
    const task = await this.workflowService.getTaskByIdWithoutHealing(taskId);
    if (!task || task.lane !== "creation_studio") {
      throw new AppError("创作任务不存在。", 404);
    }
    return task;
  }

  private assertTarget(form: NarrativeForm, targetWordCount: number): void {
    if (!Number.isInteger(targetWordCount)) {
      throw new AppError("目标字数必须是整数。", 400);
    }
    if (form === "short_story" && (targetWordCount < 3000 || targetWordCount > 30000)) {
      throw new AppError("短篇目标字数需在 3000～30000 字之间。", 400);
    }
    if (form === "long_novel" && (targetWordCount <= 30000 || targetWordCount > 3_000_000)) {
      throw new AppError("长篇目标字数需高于 30000 字。", 400);
    }
  }

  private buildConfirmationResult(
    taskId: string,
    form: NarrativeForm,
    novelId: string,
    productionTaskId: string,
  ): CreationStudioConfirmationResult {
    return {
      taskId,
      novelId,
      productionTaskId,
      narrativeForm: form,
      resumeRoute: form === "short_story"
        ? `/novels/${novelId}/story`
        : `/novels/${novelId}/edit?directorTaskId=${encodeURIComponent(productionTaskId)}`,
    };
  }
}

export const creationStudioService = new CreationStudioService();
