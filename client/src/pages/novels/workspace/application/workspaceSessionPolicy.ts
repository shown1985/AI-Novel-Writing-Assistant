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

export function resolveRequestedDirectorTaskId(input: {
  activeDirectorTaskId?: string | null;
  autofocusProjectedTask: boolean;
  directorTaskId?: string | null;
  projectedTaskId?: string | null;
}): string {
  return input.directorTaskId?.trim()
    || input.activeDirectorTaskId?.trim()
    || (input.autofocusProjectedTask ? input.projectedTaskId?.trim() : "")
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
