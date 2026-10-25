export interface WorkspaceQueryEnablement {
  loadCharacterResources: boolean;
  loadChapterContext: boolean;
  loadChapterTimeline: boolean;
  loadLatestState: boolean;
  loadPayoffLedger: boolean;
  loadQualityReport: boolean;
  loadStoryMacro: boolean;
  loadVolumeWorkspace: boolean;
  loadWorldSlice: boolean;
}

export function resolveWorkspaceActivation(input: {
  activeTab: string;
  novelId: string;
  selectedChapterId: string;
}): {
  queries: WorkspaceQueryEnablement;
  startupCommand: null;
} {
  const hasBook = Boolean(input.novelId);
  const hasSelectedChapter = Boolean(input.selectedChapterId);
  return {
    queries: {
      loadCharacterResources: hasBook && (
        input.activeTab === "character"
        || input.activeTab === "chapter"
        || input.activeTab === "pipeline"
      ),
      loadChapterContext: hasBook && input.activeTab === "chapter" && hasSelectedChapter,
      loadChapterTimeline: hasBook && input.activeTab === "chapter" && hasSelectedChapter,
      loadLatestState: hasBook && (input.activeTab === "chapter" || input.activeTab === "pipeline"),
      loadPayoffLedger: hasBook && (
        input.activeTab === "structured"
        || input.activeTab === "chapter"
        || input.activeTab === "pipeline"
      ),
      loadQualityReport: hasBook && input.activeTab === "pipeline",
      loadStoryMacro: hasBook && input.activeTab === "story_macro",
      loadVolumeWorkspace: hasBook && (
        input.activeTab === "outline"
        || input.activeTab === "structured"
      ),
      loadWorldSlice: hasBook && (input.activeTab === "basic" || input.activeTab === "world"),
    },
    startupCommand: null,
  };
}

/**
 * 小说工作台展示哪一条导演任务：本书最新任务优先，其次才回退到当前活跃任务。
 * URL 上的 directorTaskId 不再是任务来源，任务归属以书级投影为准。
 */
export function resolveRequestedDirectorTaskId(input: {
  activeDirectorTaskId?: string | null;
  projectedTaskId?: string | null;
}): string {
  return input.projectedTaskId?.trim()
    || input.activeDirectorTaskId?.trim()
    || "";
}

export function preservePendingManualRecovery(input: {
  projectionStatus?: string | null;
  taskPendingManualRecovery?: boolean | null;
}): boolean {
  return input.projectionStatus === "waiting_recovery"
    || input.taskPendingManualRecovery === true;
}

export interface BookRequestScope {
  epoch: number;
  mounted: boolean;
  novelId: string;
}

export function nextBookRequestScope(
  current: BookRequestScope | null,
  novelId: string,
): BookRequestScope {
  if (current?.novelId === novelId) {
    return current;
  }
  return {
    epoch: (current?.epoch ?? -1) + 1,
    mounted: true,
    novelId,
  };
}

export function isCurrentBookRequest(
  requestScope: BookRequestScope | null | undefined,
  currentScope: BookRequestScope,
): boolean {
  return Boolean(
    requestScope
    && requestScope === currentScope
    && requestScope.mounted,
  );
}
