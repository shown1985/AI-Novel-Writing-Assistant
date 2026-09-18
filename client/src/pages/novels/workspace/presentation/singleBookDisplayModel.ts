import type { ChapterQualityDebtDetails } from "@ai-novel/shared/types/chapterQualityLoop";
import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
  DirectorRuntimeProjection,
  DirectorTaskSnapshot,
} from "@ai-novel/shared/types/directorRuntime";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type {
  SingleBookDisplayModel,
  SingleBookFactFreshness,
  SingleBookProgressFact,
} from "../../components/NovelEditView.types";

export type {
  SingleBookDisplayModel,
  SingleBookFactFreshness,
  SingleBookProgressFact,
} from "../../components/NovelEditView.types";

export interface SingleBookDisplayInput {
  novelId: string;
  resolvedDirectorTaskId: string | null;
  novel: { id: string; estimatedChapterCount?: number | null } | null;
  savedChapters: Array<{ novelId: string; content?: string | null }> | null;
  bookAutomationProjection: DirectorBookAutomationProjection | null;
  directorTask: UnifiedTaskDetail | null;
  directorSnapshot: DirectorTaskSnapshot | null;
  runtimeProjection: DirectorRuntimeProjection | null;
  chapterQualityDebt: ChapterQualityDebtDetails[];
  qualityPauseForManual: boolean;
  freshness: Record<
    "novel" | "savedChapters" | "bookProjection" | "directorTask" | "snapshot" | "runtime",
    SingleBookFactFreshness
  >;
}

export function resolveSingleBookFactFreshness(input: {
  enabled: boolean;
  hasValue: boolean;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  isSuccess: boolean;
}): SingleBookFactFreshness {
  if (!input.enabled) return "empty";
  if (input.isError) return "error";
  if (input.isPending && !input.hasValue) return "loading";
  if (input.isFetching && input.hasValue) return "stale";
  if (input.isSuccess) return input.hasValue ? "fresh" : "empty";
  return input.hasValue ? "stale" : "loading";
}

function hasUsableCachedValue(state: SingleBookFactFreshness, value: unknown): boolean {
  return value !== null && value !== undefined && (state === "fresh" || state === "stale" || state === "error");
}

function resolveIdentity(input: SingleBookDisplayInput): SingleBookDisplayModel["identity"] {
  const taskId = input.resolvedDirectorTaskId?.trim() || null;
  if (!taskId) {
    return { status: "missing", directorTaskId: null };
  }
  const projection = input.bookAutomationProjection;
  const task = input.directorTask;
  const snapshot = input.directorSnapshot;
  if (!projection || !task || !snapshot) {
    return { status: "missing", directorTaskId: taskId };
  }
  const snapshotNovelIds = [snapshot.task.novelId, snapshot.run?.novelId]
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
  const taskSourceNovelId = task.sourceResource?.type === "novel"
    ? task.sourceResource.id?.trim() || null
    : null;
  const matches = projection.novelId === input.novelId
    && projection.focusNovel.id === input.novelId
    && projection.latestTask?.id === taskId
    && task.id === taskId
    && snapshot.task.id === taskId
    && snapshotNovelIds.length > 0
    && snapshotNovelIds.every((novelId) => novelId === input.novelId)
    && (!taskSourceNovelId || taskSourceNovelId === input.novelId);
  return { status: matches ? "verified" : "mismatch", directorTaskId: taskId };
}

function buildSavedProgress(input: SingleBookDisplayInput): SingleBookProgressFact {
  const state = input.freshness.savedChapters;
  if (!hasUsableCachedValue(state, input.savedChapters)) {
    return {
      state,
      value: null,
      label: state === "empty" ? "尚无已保存正文" : "已保存正文读取中",
      description: state === "error" ? "正文读取失败，请稍后重试。" : null,
    };
  }
  const count = input.savedChapters!.filter((chapter) => (
    chapter.novelId === input.novelId && Boolean(chapter.content?.trim())
  )).length;
  return {
    state,
    value: count,
    label: `已保存正文 ${count} 章`,
    description: state === "fresh"
      ? "只统计本书已持久保存且正文非空的章节。"
      : state === "error"
        ? "显示上次读取到的本书正文；最新数据读取失败。"
        : "显示上次读取到的本书正文，数据正在更新。",
  };
}

function buildBookTarget(input: SingleBookDisplayInput): SingleBookProgressFact {
  const state = input.freshness.novel;
  const rawTarget = input.novel?.id === input.novelId ? input.novel.estimatedChapterCount : null;
  const target = typeof rawTarget === "number" && Number.isFinite(rawTarget) && Number.isInteger(rawTarget) && rawTarget > 0
    ? rawTarget
    : null;
  if (!hasUsableCachedValue(state, input.novel) || target === null) {
    return {
      state,
      value: null,
      label: "整书目标未知",
      description: state === "error"
        ? "小说信息读取失败，不使用任务范围或默认值补算目标。"
        : "可在小说基础信息中设置预计章节数。",
    };
  }
  return {
    state,
    value: target,
    label: `全书目标 ${target} 章`,
    description: state === "fresh" ? null : "显示上次保存的整书目标，数据正在更新。",
  };
}

function buildTaskProgress(
  input: SingleBookDisplayInput,
  identity: SingleBookDisplayModel["identity"],
): SingleBookDisplayModel["taskProgress"] {
  const state = input.freshness.runtime === "fresh" ? input.freshness.snapshot : input.freshness.runtime;
  if (identity.status === "mismatch") {
    return { state, label: "当前任务身份不匹配", description: "不会显示其他作品或其他任务的进度。" };
  }
  if (identity.status === "missing") {
    return { state: "empty", label: "没有可验证的导演任务", description: null };
  }
  if (!hasUsableCachedValue(state, input.runtimeProjection)) {
    return {
      state,
      label: state === "error" ? "当前任务读取失败" : "当前任务范围读取中",
      description: "已保存正文不受任务读取状态影响。",
    };
  }
  const runtime = input.runtimeProjection!;
  const label = runtime.progressSummary?.trim()
    || runtime.scopeSummary?.trim()
    || runtime.currentLabel?.trim()
    || input.directorTask?.currentItemLabel?.trim()
    || (runtime.status === "completed" ? "最近一次任务已完成" : "当前任务范围已确认");
  const description = [runtime.scopeSummary, runtime.currentLabel]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value !== label))
    .join(" · ") || null;
  return { state, label, description };
}

function hasReplanRequired(input: SingleBookDisplayInput): boolean {
  return input.bookAutomationProjection?.latestTask?.checkpointType === "replan_required"
    || input.directorSnapshot?.task.checkpointType === "replan_required"
    || input.runtimeProjection?.rootCauseCode === "replan_required"
    || Boolean(input.runtimeProjection?.recentIssues?.some((item) => item.occurrence.issueCode === "quality.replan_required"));
}

function buildSeverity(
  input: SingleBookDisplayInput,
  identity: SingleBookDisplayModel["identity"],
): SingleBookDisplayModel["severity"] {
  if (identity.status === "mismatch") {
    return { kind: "unknown", tone: "warning", title: "任务信息需要重新读取", description: "当前任务不属于这本书，不提供执行建议。" };
  }
  if (identity.status !== "verified") {
    return { kind: "idle", tone: "neutral", title: "作品内容可以继续整理", description: "没有可验证的导演任务；已保存正文仍可阅读和编辑。" };
  }
  if (hasReplanRequired(input)) {
    return { kind: "replan_required", tone: "danger", title: "后续章节需要重新规划", description: "已保存正文会保留，请在本书创作现场查看影响范围。" };
  }
  const pendingManualRecovery = input.bookAutomationProjection?.status === "waiting_recovery"
    || input.directorSnapshot?.task.pendingManualRecovery === true
    || input.directorTask?.pendingManualRecovery === true;
  if (input.qualityPauseForManual && pendingManualRecovery) {
    return { kind: "quality_pause", tone: "warning", title: "质量优先模式正在等待处理", description: "任务停在已保存边界，只有明确恢复操作才会继续。" };
  }
  if (pendingManualRecovery) {
    return { kind: "manual_recovery", tone: "warning", title: "任务正在等待你恢复", description: "后台刷新不会自动越过人工暂停。" };
  }
  const taskStatus = input.directorTask?.status;
  const projectionStatus = input.bookAutomationProjection?.status;
  const runtimeStatus = input.runtimeProjection?.status;
  if (
    taskStatus === "failed" || taskStatus === "cancelled"
    || projectionStatus === "failed" || projectionStatus === "blocked" || projectionStatus === "cancelled"
    || runtimeStatus === "failed" || runtimeStatus === "blocked"
  ) {
    return { kind: "blocked", tone: "danger", title: "本次任务需要处理", description: "已保存正文不会清除；请先查看本书任务范围和原因。" };
  }
  if (
    taskStatus === "queued" || taskStatus === "running" || taskStatus === "waiting_approval"
    || projectionStatus === "queued" || projectionStatus === "running" || projectionStatus === "waiting_approval"
    || runtimeStatus === "running" || runtimeStatus === "waiting_approval"
  ) {
    return { kind: "in_progress", tone: "info", title: "AI 正在推进当前任务", description: "本轮任务范围与整书目标分开显示。" };
  }
  const qualityDebtCount = Math.max(
    input.chapterQualityDebt.length,
    input.runtimeProjection?.qualityDebtSummary?.deferredChapterCount ?? 0,
  );
  if (qualityDebtCount > 0) {
    return { kind: "quality_debt", tone: "warning", title: "有局部质量项待优化", description: "这些提醒不会把整本书标记为失败，也不会阻断后续章节。" };
  }
  if (taskStatus === "succeeded" || projectionStatus === "completed" || runtimeStatus === "completed") {
    return { kind: "task_completed", tone: "success", title: "最近一次任务已完成", description: "这里表示本轮任务完成，不代表整本书已经完成。" };
  }
  return { kind: "idle", tone: "neutral", title: "作品内容可以继续整理", description: "没有正在推进的导演任务。" };
}

function buildPrimaryAction(
  input: SingleBookDisplayInput,
  identity: SingleBookDisplayModel["identity"],
): DirectorBookAutomationAction | null {
  const action = input.bookAutomationProjection?.primaryAction ?? null;
  const taskId = identity.directorTaskId;
  if (
    identity.status !== "verified"
    || !action
    || input.freshness.bookProjection !== "fresh"
    || input.freshness.directorTask !== "fresh"
    || input.freshness.snapshot !== "fresh"
    || action.target.novelId !== input.novelId
  ) {
    return null;
  }
  const suppliedTaskIds = [action.target.taskId, action.commandPayload?.taskId]
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
  if (!taskId || suppliedTaskIds.some((value) => value !== taskId)) {
    return null;
  }
  return action;
}

export function buildSingleBookDisplayModel(input: SingleBookDisplayInput): SingleBookDisplayModel {
  const identity = resolveIdentity(input);
  const primaryAction = buildPrimaryAction(input, identity);
  return {
    identity,
    savedProgress: buildSavedProgress(input),
    taskProgress: buildTaskProgress(input, identity),
    bookTarget: buildBookTarget(input),
    severity: buildSeverity(input, identity),
    qualityDebtCount: Math.max(
      input.chapterQualityDebt.length,
      input.runtimeProjection?.qualityDebtSummary?.deferredChapterCount ?? 0,
    ),
    primaryAction,
    primaryActionReason: primaryAction
      ? input.bookAutomationProjection?.userReason?.trim()
        || input.bookAutomationProjection?.detail?.trim()
        || null
      : null,
  };
}
