import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type {
  Chapter,
  PipelineRepairMode,
  PipelineRunMode,
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumePlan,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import {
  backfillNovelCharacterResources,
  confirmCharacterResourceProposal,
  extractChapterResources,
  rejectCharacterResourceProposal,
  setNovelCreationExperience,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { useSSE } from "@/hooks/useSSE";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import NovelEditView from "./components/NovelEditView";
import NovelExistingProjectTakeoverDialog from "./components/NovelExistingProjectTakeoverDialog";
import NovelProductionExperienceHandoff from "./components/NovelProductionExperienceHandoff";
import type { QuickCharacterCreatePayload } from "./components/characterPanel.utils";
import type { ChapterExecutionStrategy } from "./chapterExecution.utils";
import type { ChapterReviewResult } from "./chapterPlanning.shared";
import { useNovelCharacterMutations } from "./hooks/useNovelCharacterMutations";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import { useNovelEditChapterRuntime } from "./hooks/useNovelEditChapterRuntime";
import { useNovelEditInitialization } from "./hooks/useNovelEditInitialization";
import { useNovelEditMutations } from "./hooks/useNovelEditMutations";
import { useNovelEditWorkflow } from "./hooks/useNovelEditWorkflow";
import { useNovelStoryMacro } from "./hooks/useNovelStoryMacro";
import { useNovelVolumePlanning } from "./hooks/useNovelVolumePlanning";
import { useNovelWorldSlice } from "./hooks/useNovelWorldSlice";
import { useVolumeVersionControl } from "./hooks/useVolumeVersionControl";
import {
  createDefaultNovelBasicFormState,
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared";
import { resolveTakeoverDialogContextTaskId } from "./novelEditAutomationStatus";
import { buildNovelEditPlanningTabs } from "./novelEditPlanningTabs";
import { syncNovelWorkflowStageSilently, workflowStageFromTab } from "./novelWorkflow.client";
import {
  isNovelWorkspaceFlowTab,
  tabFromDirectorDisplayStage,
} from "./novelWorkspaceNavigation";
import { useStructuredOutlineWorkspaceStore } from "./stores/useStructuredOutlineWorkspaceStore";
import {
  applyVolumeChapterBatch,
  buildOutlinePreviewFromVolumes,
  buildStructuredPreviewFromVolumes,
  buildVolumePlanningReadiness,
  buildVolumeSyncPreview,
  type VolumeSyncOptions,
} from "./volumePlan.utils";
import {
  useWorkspaceDirectorCommands,
  useWorkspaceDirectorInteraction,
  useWorkspaceDirectorState,
  useWorkspaceExport,
  useWorkspaceResources,
} from "./workspace/application";

function takeoverDismissStorageKey(novelId: string): string {
  return `novel-edit:takeover-dismissed:${novelId}`;
}

export default function NovelEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const {
    activeTab,
    setActiveTab,
    directorTaskId,
    setDirectorTaskId,
    selectedChapterId,
    setSelectedChapterId,
    selectedVolumeId,
    setSelectedVolumeId,
    taskPanelOpen,
    clearTaskPanelOpen,
  } = useNovelEditWorkflow(id);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [autoOpenedFailedTaskId, setAutoOpenedFailedTaskId] = useState("");
  const [retryOverride, setRetryOverride] = useState<LLMSelectorValue>({
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
  });
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());
  const [volumeDraft, setVolumeDraft] = useState<VolumePlan[]>([]);
  const [volumeStrategyPlan, setVolumeStrategyPlan] = useState<VolumeStrategyPlan | null>(null);
  const [volumeCritiqueReport, setVolumeCritiqueReport] = useState<VolumeCritiqueReport | null>(null);
  const [volumeBeatSheets, setVolumeBeatSheets] = useState<VolumeBeatSheet[]>([]);
  const [volumeRebalanceDecisions, setVolumeRebalanceDecisions] = useState<VolumeRebalanceDecision[]>([]);
  const [volumeGenerationMessage, setVolumeGenerationMessage] = useState("");
  const [outlineOptimizeInstruction] = useState("");
  const [, setOutlineOptimizePreview] = useState("");
  const [, setOutlineOptimizeMode] = useState<"full" | "selection">("full");
  const [, setOutlineOptimizeSourceText] = useState("");
  const [structuredOptimizeInstruction] = useState("");
  const [, setStructuredOptimizePreview] = useState("");
  const [, setStructuredOptimizeMode] = useState<"full" | "selection">("full");
  const [, setStructuredOptimizeSourceText] = useState("");
  const [volumeSyncOptions, setVolumeSyncOptions] = useState<VolumeSyncOptions>({
    preserveContent: true,
    applyDeletes: false,
  });
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1,
    endOrder: DEFAULT_ESTIMATED_CHAPTER_COUNT,
    maxRetries: 1,
    runMode: "fast" as PipelineRunMode,
    autoReview: true,
    autoRepair: true,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: "light_repair" as PipelineRepairMode,
  });
  const [reviewResult, setReviewResult] = useState<ChapterReviewResult | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [structuredMessage, setStructuredMessage] = useState("");
  const [chapterOperationMessage, setChapterOperationMessage] = useState("");
  const [chapterStrategy, setChapterStrategy] = useState<ChapterExecutionStrategy>({ runMode: "fast", wordSize: "medium", conflictLevel: 60, pace: "balanced", aiFreedom: "medium" });
  const [activeChapterStream, setActiveChapterStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [activeRepairStream, setActiveRepairStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [isDirectorExitActionExpanded, setIsDirectorExitActionExpanded] = useState(false);
  const [dismissedTakeoverSignature, setDismissedTakeoverSignature] = useState("");
  const [characterMessage, setCharacterMessage] = useState("");
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBaseCharacterId, setSelectedBaseCharacterId] = useState("");
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    role: "主角",
  });
  const [characterForm, setCharacterForm] = useState({
    name: "",
    role: "",
    gender: "unknown" as "male" | "female" | "other" | "unknown",
    personality: "",
    background: "",
    development: "",
    appearance: "",
    physique: "",
    attireStyle: "",
    signatureDetail: "",
    voiceTexture: "",
    presenceImpression: "",
    currentState: "",
    currentGoal: "",
  });
  const { shouldLoadVolumeWorkspace, shouldLoadStoryMacro, shouldLoadWorldSlice, novelDetailQuery, qualityReportQuery, volumeWorkspaceQuery, payoffLedgerChapterOrder, chapterResourceContextQuery, chapterTimelineQuery, worldListQuery, genreOptions, storyModeOptions, pipelineJobQuery, chapters, outlineSyncChapters, selectedChapter, characters, baseCharacters, selectedCharacter, selectedBaseCharacter, importedBaseCharacterIds, hasCharacters, savedVolumeWorkspace, coreCharacterCount, bible, plotBeats, maxOrder, worldInjectionSummary, qualitySummary, chapterQualityReport, chapterPlan, chapterTimeline, latestStateSnapshot, chapterStateSnapshot, payoffLedger, characterResources, pendingCharacterResourceProposals, chapterResourceContext, chapterAuditReports, pipelineBackgroundActivities } = useWorkspaceResources({ id, activeTab, selectedChapterId, currentJobId, selectedCharacterId, selectedBaseCharacterId });
  const director = useWorkspaceDirectorState({ id, directorTaskId, taskPanelOpen, setDirectorTaskId });
  const { activeAutoDirectorTask, bookAutomationProjection, displayAutoDirectorTask, activeDirectorSession, activeDirectorSnapshot, activeStructuredOutlineChapterId, activeDirectorRuntimeSnapshot, activeDirectorRuntimeHardBlocked, activeDirectorRuntimeBlockedReason, activeAutoDirectorFollowUp, workflowCurrentTab, autoDirectorRefreshSignatureRef, autoDirectorArtifactSignatureRef, autoDirectorWorkspaceSignatureRef, activeAutoDirectorRefreshSignature, activeAutoDirectorArtifactSignature, activeAutoDirectorWorkspaceSignature } = director;
  const directorCommands = useWorkspaceDirectorCommands({ id, activeTab, selectedChapterId, payoffLedgerChapterOrder, director, queryClient, llm, navigate, setActiveTab, setSelectedChapterId, setSelectedVolumeId, setDirectorTaskId, setIsTaskDrawerOpen, setIsDirectorExitActionExpanded });
  const { openAutoDirectorTaskCenter, invalidateAutoDirectorTaskState, invalidateWorkspaceDataForTabs, invalidateVisibleWorkspaceData, executeFollowUpActionMutation, handleTaskDrawerProjectionAction, handleDrawerFollowUpAction, retryAutoDirectorWithCurrentModelMutation, retryAutoDirectorWithTaskModelMutation } = directorCommands;
  const switchToSimpleMutation = useMutation({
    mutationFn: () => setNovelCreationExperience(id, "simple"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      navigate(`/novels/${id}/simple`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "切换模式失败，请重试。"),
  });

  useEffect(() => {
    if (novelDetailQuery.data?.data?.creationExperience === "simple") {
      navigate(`/novels/${id}/simple`, { replace: true });
    }
  }, [id, navigate, novelDetailQuery.data?.data?.creationExperience]);
  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources(id, {
    writingMode: basicForm.writingMode,
    continuationSourceType: basicForm.continuationSourceType,
    sourceNovelId: basicForm.sourceNovelId,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId,
  });

  const { tab: storyMacroTab } = useNovelStoryMacro({
    novelId: id,
    enabled: shouldLoadStoryMacro,
    llm,
  });
  const {
    worldSliceMessage,
    novelWorldView,
    novelWorldSyncDiff,
    worldSliceView,
    isLoadingNovelWorld,
    isImportingNovelWorld,
    isGeneratingNovelWorld,
    isCreatingManualNovelWorld,
    isSavingNovelWorldToLibrary,
    isLoadingNovelWorldSyncDiff,
    isSyncingNovelWorld,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    importNovelWorld,
    createManualNovelWorld,
    generateNovelWorld,
    saveNovelWorldToLibrary,
    syncNovelWorld,
    refreshWorldSlice,
    saveWorldSliceOverrides,
  } = useNovelWorldSlice({
    novelId: id,
    enabled: shouldLoadWorldSlice,
    llm,
    queryClient,
    onNovelWorldImported: (worldId) => setBasicForm((prev) => ({ ...prev, worldId })),
  });
  const exportControls = useWorkspaceExport({
    activeTab,
    draftTitle: basicForm.title,
    novelId: id,
    savedTitle: novelDetailQuery.data?.data?.title,
  });
  const {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    isGeneratingStrategy,
    isCritiquingStrategy,
    isGeneratingSkeleton,
    isGeneratingBeatSheet,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    chapterDetailFailure,
    startStrategyGeneration,
    startStrategyCritique,
    startSkeletonGeneration,
    startBeatSheetGeneration,
    startChapterListGeneration,
    startChapterDetailGeneration,
    startChapterDetailBundleGeneration,
    retryFailedChapterDetail,
    handleVolumeFieldChange,
    handleOpenPayoffsChange,
    handleAddVolume,
    handleRemoveVolume,
    handleMoveVolume,
    handleChapterFieldChange,
    handleChapterNumberChange,
    handleChapterPayoffRefsChange,
    handleAddChapter,
    handleRemoveChapter,
    handleMoveChapter,
  } = useNovelVolumePlanning({
    novelId: id,
    hasCharacters,
    llm,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    volumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    savedWorkspace: savedVolumeWorkspace,
    setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    setVolumeGenerationMessage,
    setStructuredMessage,
  });
  const volumeSyncPreview = useMemo(
    () => buildVolumeSyncPreview(normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions),
    [normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions],
  );
  const chapterPendingCharacterResourceProposals = useMemo(
    () => pendingCharacterResourceProposals.filter((proposal) => !selectedChapterId || proposal.chapterId === selectedChapterId),
    [pendingCharacterResourceProposals, selectedChapterId],
  );
  const dismissTakeover = () => {
    if (!activeAutoDirectorRefreshSignature) {
      return;
    }
    setIsDirectorExitActionExpanded(false);
    setDismissedTakeoverSignature(activeAutoDirectorRefreshSignature);
    window.sessionStorage.setItem(
      takeoverDismissStorageKey(id),
      activeAutoDirectorRefreshSignature,
    );
    toast.success("已收起这条导演接管提醒。需要时仍可从执行详情继续处理。");
  };
  const isTakeoverDismissed = Boolean(
    activeAutoDirectorRefreshSignature
    && dismissedTakeoverSignature
    && dismissedTakeoverSignature === activeAutoDirectorRefreshSignature,
  );
  const openAuditIssueIds = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => issue.id)),
    [chapterAuditReports],
  );
  useEffect(() => {
    setRetryOverride({
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
  }, [activeAutoDirectorTask?.id, llm.model, llm.provider, llm.temperature]);
  useEffect(() => {
    if (activeAutoDirectorTask?.status !== "failed") {
      if (autoOpenedFailedTaskId) {
        setAutoOpenedFailedTaskId("");
      }
      return;
    }
    if (!activeAutoDirectorTask.id || activeAutoDirectorTask.id === autoOpenedFailedTaskId) {
      return;
    }
    setIsTaskDrawerOpen(true);
    setAutoOpenedFailedTaskId(activeAutoDirectorTask.id);
  }, [activeAutoDirectorTask?.id, activeAutoDirectorTask?.status, autoOpenedFailedTaskId]);
  useEffect(() => {
    if (!taskPanelOpen || !displayAutoDirectorTask?.id) {
      return;
    }
    setIsTaskDrawerOpen(true);
  }, [displayAutoDirectorTask?.id, taskPanelOpen]);
  useEffect(() => {
    if (!activeAutoDirectorTask) {
      setIsDirectorExitActionExpanded(false);
      setDismissedTakeoverSignature("");
      window.sessionStorage.removeItem(takeoverDismissStorageKey(id));
      return;
    }
    if (
      activeAutoDirectorTask.status !== "queued"
      && activeAutoDirectorTask.status !== "running"
      && activeAutoDirectorTask.status !== "waiting_approval"
    ) {
      setIsDirectorExitActionExpanded(false);
    }
  }, [activeAutoDirectorTask, id]);
  useEffect(() => {
    if (!id || !activeAutoDirectorRefreshSignature) {
      return;
    }
    const storedDismissedSignature = window.sessionStorage.getItem(takeoverDismissStorageKey(id)) ?? "";
    setDismissedTakeoverSignature(storedDismissedSignature);
  }, [activeAutoDirectorRefreshSignature, id]);
  const { takeover, taskDrawerActions } = useWorkspaceDirectorInteraction({
    activeTab,
    chapterCount: chapters.length,
    characterCount: characters.length,
    director,
    commands: directorCommands,
    dismissTakeover,
    hasUnsavedVolumeDraft,
    isDirectorExitActionExpanded,
    novelTitle: novelDetailQuery.data?.data?.title ?? "",
    setActiveTab,
    setIsDirectorExitActionExpanded,
    setIsTaskDrawerOpen,
    setSelectedChapterId,
  });
  useNovelEditInitialization({
    detail: novelDetailQuery.data?.data,
    chapters,
    characters,
    baseCharacters,
    basicForm,
    selectedCharacter,
    selectedChapterId,
    selectedCharacterId,
    selectedBaseCharacterId,
    sourceNovelBookAnalysisOptions,
    sourceBookAnalysesLoading: sourceBookAnalysesQuery.isLoading,
    sourceBookAnalysesFetching: sourceBookAnalysesQuery.isFetching,
    hydrateVolumeDraftFromDetail: !shouldLoadVolumeWorkspace,
    setBasicForm,
    setVolumeDraft,
    setPipelineForm,
    setSelectedChapterId,
    setSelectedCharacterId,
    setSelectedBaseCharacterId,
    setCharacterForm,
  });

  useEffect(() => {
    const workspace = volumeWorkspaceQuery.data?.data;
    if (!workspace) {
      return;
    }
    setVolumeDraft(workspace.volumes ?? []);
    setVolumeStrategyPlan(workspace.strategyPlan ?? null);
    setVolumeCritiqueReport(workspace.critiqueReport ?? null);
    setVolumeBeatSheets(workspace.beatSheets ?? []);
    setVolumeRebalanceDecisions(workspace.rebalanceDecisions ?? []);
  }, [volumeWorkspaceQuery.data?.data]);

  useEffect(() => {
    if (!id) {
      return;
    }
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: selectedVolumeId || undefined,
      selectedChapterId: selectedChapterId || undefined,
    });
  }, [id, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id || activeTab !== "structured" || !activeStructuredOutlineChapterId) {
      return;
    }
    const targetVolume = normalizedVolumeDraft.find((volume) => (
      volume.chapters.some((chapter) => (
        chapter.id === activeStructuredOutlineChapterId
        || chapter.chapterId === activeStructuredOutlineChapterId
      ))
    ));
    if (!targetVolume) {
      return;
    }
    const currentWorkspace = useStructuredOutlineWorkspaceStore.getState().workspaces[id];
    if (
      currentWorkspace?.selectedChapterId === activeStructuredOutlineChapterId
      && currentWorkspace.selectedVolumeId === targetVolume.id
      && currentWorkspace.selectedBeatKey === "all"
    ) {
      return;
    }
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: targetVolume.id,
      selectedChapterId: activeStructuredOutlineChapterId,
      selectedBeatKey: "all",
    });
  }, [activeStructuredOutlineChapterId, activeTab, id, normalizedVolumeDraft]);

  useEffect(() => {
    if (!id) {
      return;
    }
    if (
      activeAutoDirectorTask
      && (
        activeAutoDirectorTask.status === "queued"
        || activeAutoDirectorTask.status === "running"
        || activeAutoDirectorTask.status === "waiting_approval"
      )
    ) {
      return;
    }
    const labels: Record<string, string> = {
      basic: "项目设定已打开",
      story_macro: "故事宏观规划已打开",
      character: "角色准备已打开",
      outline: "卷战略 / 卷骨架已打开",
      structured: "节奏 / 拆章已打开",
      chapter: selectedChapter ? `正在查看第${selectedChapter.order}章执行面板` : "章节执行已打开",
      pipeline: "质量修复 / 流水线已打开",
    };
    void syncNovelWorkflowStageSilently({
      novelId: id,
      stage: workflowStageFromTab(activeTab),
      itemLabel: labels[activeTab] ?? "小说主流程已打开",
      chapterId: activeTab === "chapter" ? selectedChapterId || undefined : undefined,
      volumeId: activeTab === "structured" || activeTab === "outline" ? selectedVolumeId || undefined : undefined,
      status: "waiting_approval",
    });
  }, [activeAutoDirectorTask, activeTab, id, selectedChapter?.order, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorRefreshSignature) {
      autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
      return;
    }
    if (!autoDirectorRefreshSignatureRef.current) {
      autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
      return;
    }
    if (autoDirectorRefreshSignatureRef.current === activeAutoDirectorRefreshSignature) {
      return;
    }
    autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
    void invalidateAutoDirectorTaskState(activeAutoDirectorTask.id);
  }, [activeAutoDirectorRefreshSignature, activeAutoDirectorTask, id, queryClient]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorWorkspaceSignature) {
      autoDirectorWorkspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature;
      return;
    }
    if (!autoDirectorWorkspaceSignatureRef.current) {
      autoDirectorWorkspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature;
      return;
    }
    if (autoDirectorWorkspaceSignatureRef.current === activeAutoDirectorWorkspaceSignature) {
      return;
    }
    autoDirectorWorkspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature;
    const recommendedTab = tabFromDirectorDisplayStage(activeDirectorSnapshot?.displayState.stageKey ?? null);
    void invalidateWorkspaceDataForTabs([
      isNovelWorkspaceFlowTab(activeTab) ? activeTab : null,
      recommendedTab,
      workflowCurrentTab,
    ]);
  }, [
    activeAutoDirectorTask,
    activeAutoDirectorWorkspaceSignature,
    activeDirectorSnapshot?.displayState.stageKey,
    activeTab,
    id,
    workflowCurrentTab,
  ]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorArtifactSignature) {
      autoDirectorArtifactSignatureRef.current = activeAutoDirectorArtifactSignature;
      return;
    }
    if (!autoDirectorArtifactSignatureRef.current) {
      autoDirectorArtifactSignatureRef.current = activeAutoDirectorArtifactSignature;
      return;
    }
    if (autoDirectorArtifactSignatureRef.current === activeAutoDirectorArtifactSignature) {
      return;
    }
    autoDirectorArtifactSignatureRef.current = activeAutoDirectorArtifactSignature;
    void invalidateVisibleWorkspaceData();
  }, [activeAutoDirectorArtifactSignature, activeAutoDirectorTask, id, queryClient, selectedChapterId]);

  const outlineText = useMemo(
    () => buildOutlinePreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const structuredDraftText = useMemo(
    () => buildStructuredPreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const draftVolumeDocument = useMemo(() => ({
    novelId: id,
    workspaceVersion: "v2" as const,
    volumes: normalizedVolumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    readiness: buildVolumePlanningReadiness({
      volumes: normalizedVolumeDraft,
      strategyPlan: volumeStrategyPlan,
      critiqueReport: volumeCritiqueReport,
      beatSheets: volumeBeatSheets,
    }),
    derivedOutline: outlineText,
    derivedStructuredOutline: structuredDraftText,
    source: savedVolumeWorkspace?.source ?? "volume",
    activeVersionId: savedVolumeWorkspace?.activeVersionId ?? null,
  }), [
    id,
    normalizedVolumeDraft,
    outlineText,
    savedVolumeWorkspace?.activeVersionId,
    savedVolumeWorkspace?.source,
    structuredDraftText,
    volumeBeatSheets,
    volumeCritiqueReport,
    volumeRebalanceDecisions,
    volumeStrategyPlan,
  ]);

  const invalidateNovelDetail = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "payoff-ledger", id] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-plan", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-audit-reports", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-timeline", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "state-snapshots", id] });
  };

  const invalidateCharacterResourceViews = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(id) });
    if (selectedChapterId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterResourceContext(id, selectedChapterId),
      });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "state-snapshots", id] });
  };

  const confirmCharacterResourceProposalMutation = useMutation({
    mutationFn: (proposalId: string) => confirmCharacterResourceProposal(id, proposalId),
    onSuccess: async () => {
      await invalidateCharacterResourceViews();
      toast.success("资源变更已确认，后续写作会参考它。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "确认资源变更失败。");
    },
  });

  const rejectCharacterResourceProposalMutation = useMutation({
    mutationFn: (proposalId: string) => rejectCharacterResourceProposal(id, proposalId),
    onSuccess: async () => {
      await invalidateCharacterResourceViews();
      toast.success("资源变更已忽略。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "忽略资源变更失败。");
    },
  });

  const extractChapterResourcesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChapterId) {
        throw new Error("请先选择要复查资源的章节。");
      }
      return extractChapterResources(id, selectedChapterId, {
        provider: llm.provider,
        model: llm.model,
      });
    },
    onSuccess: async (response) => {
      await invalidateCharacterResourceViews();
      const committedCount = response.data?.committed.length ?? 0;
      const pendingCount = response.data?.pendingReview.length ?? 0;
      if (pendingCount > 0) {
        toast.success(`已复查本章资源，${pendingCount} 个变更需要你判断。`);
        return;
      }
      toast.success(committedCount > 0
        ? `已复查本章资源，${committedCount} 个变更会用于后续写作。`
        : "已复查本章资源，未发现需要更新的关键资源。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "复查本章资源失败。");
    },
  });

  const backfillCharacterResourcesMutation = useMutation({
    mutationFn: () => backfillNovelCharacterResources(id, {
      provider: llm.provider,
      model: llm.model,
      limit: 3,
    }),
    onSuccess: async (response) => {
      await invalidateCharacterResourceViews();
      const scanned = response.data?.scannedChapterCount ?? 0;
      const committed = response.data?.committedCount ?? 0;
      const pending = response.data?.pendingReviewCount ?? 0;
      toast.success(pending > 0
        ? `已回填最近 ${scanned} 章资源，${pending} 条变化需要你判断。`
        : `已回填最近 ${scanned} 章资源，${committed} 条变化会用于后续写作。`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "回填角色资源失败。");
    },
  });

  const chapterSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        setChapterOperationMessage(payload.message);
      }
    },
    onDone: async () => {
      await invalidateNovelDetail();
      setActiveChapterStream(null);
    },
  });
  const bibleSSE = useSSE({ onDone: invalidateNovelDetail });
  const beatsSSE = useSSE({ onDone: invalidateNovelDetail });
  const repairSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        setChapterOperationMessage(payload.message);
      }
    },
    onDone: async (fullContent) => {
      setRepairAfterContent(fullContent);
      await invalidateNovelDetail();
      setActiveRepairStream(null);
    },
  });

  const {
    saveBasicMutation,
    saveOutlineMutation,
    saveStructuredMutation,
    syncStructuredChaptersMutation,
    createChapterMutation,
    deleteManualChapterMutation,
    runPipelineMutation,
    reviewMutation,
    hookMutation,
  } = useNovelEditMutations({
    id,
    basicForm,
    hasCharacters,
    outlineText,
    outlineOptimizeInstruction,
    setOutlineOptimizePreview,
    setOutlineOptimizeMode,
    setOutlineOptimizeSourceText,
    structuredDraftText,
    structuredOptimizeInstruction,
    setStructuredOptimizePreview,
    setStructuredOptimizeMode,
    setStructuredOptimizeSourceText,
    volumeDocument: draftVolumeDocument,
    llm,
    pipelineForm,
    selectedChapterId,
    chapterCount: novelDetailQuery.data?.data?.chapters?.length ?? 0,
    chapters,
    setActiveTab,
    setSelectedChapterId,
    setCurrentJobId,
    setPipelineMessage,
    setStructuredMessage,
    setReviewResult,
    queryClient,
    invalidateNovelDetail,
  });

  const {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    generateVisibleProfileMutation,
    applyVisibleProfileMutation,
    generateBatchVisibleProfilesMutation,
    applyBatchVisibleProfilesMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
    generateSupplementalCharacterMutation,
    applySupplementalCharacterMutation,
  } = useNovelCharacterMutations({
    id,
    selectedCharacterId,
    selectedBaseCharacter,
    characters,
    pipelineForm,
    llm,
    characterForm,
    quickCharacterForm,
    queryClient,
    setCharacterMessage,
    setSelectedCharacterId,
    setQuickCharacterForm,
  });

  const {
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  } = useVolumeVersionControl({
    novelId: id,
    draftDocument: draftVolumeDocument,
    setDraftVolumes: setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    queryClient,
    invalidateNovelDetail,
  });

  const goToCharacterTab = () => setActiveTab("character");
  const goToStructuredTab = () => setActiveTab("structured");
  const {
    generateChapterPlanMutation,
    replanChapterMutation,
    fullAuditMutation,
    reviewActionKind,
    runChapterReview,
    handleGenerateSelectedChapter,
    handleAbortChapterStream,
    handleAbortRepair,
    chapterExecutionActions,
  } = useNovelEditChapterRuntime({
    novelId: id,
    llm,
    selectedChapterId,
    selectedChapter,
    chapterStrategy,
    reviewResult,
    openAuditIssueIds,
    queryClient,
    invalidateNovelDetail,
    setChapterOperationMessage,
    setReviewResult,
    setRepairBeforeContent,
    setRepairAfterContent,
    setActiveChapterStream,
    setActiveRepairStream,
    chapterSSE,
    repairSSE,
  });

  const renderTakeoverEntry = (
    step: "basic" | "story_macro" | "world" | "character" | "outline" | "structured" | "chapter" | "pipeline",
    variant: "default" | "outline" | "secondary" = "default",
  ) => {
    const takeoverContextTaskId = resolveTakeoverDialogContextTaskId({
      directorTaskId,
      activeAutoDirectorTask,
      projection: bookAutomationProjection,
    });

    return (
      <NovelExistingProjectTakeoverDialog
        novelId={id}
        basicForm={basicForm}
        triggerVariant={variant}
        defaultEntryStep={step}
        workflowTaskId={takeoverContextTaskId}
      />
    );
  };

  const { basicTab, outlineTab, structuredTab } = buildNovelEditPlanningTabs({
    id,
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions: worldListQuery.data?.data ?? [],
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    novelWorldView,
    novelWorldSyncDiff,
    worldSliceView,
    worldSliceMessage,
    isLoadingNovelWorld,
    isImportingNovelWorld,
    isGeneratingNovelWorld,
    isCreatingManualNovelWorld,
    isSavingNovelWorldToLibrary,
    isLoadingNovelWorldSyncDiff,
    isSyncingNovelWorld,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onSaveBasic: () => saveBasicMutation.mutate(),
    onImportNovelWorld: importNovelWorld,
    onCreateManualNovelWorld: createManualNovelWorld,
    onGenerateNovelWorld: generateNovelWorld,
    onSaveNovelWorldToLibrary: saveNovelWorldToLibrary,
    onSyncNovelWorld: syncNovelWorld,
    onRefreshWorldSlice: refreshWorldSlice,
    onSaveWorldSliceOverrides: saveWorldSliceOverrides,
    isSavingBasic: saveBasicMutation.isPending,
    projectQuickStart: undefined,
    basicDirectorTakeoverEntry: undefined,
    storyMacroDirectorTakeoverEntry: undefined,
    outlineDirectorTakeoverEntry: undefined,
    structuredDirectorTakeoverEntry: undefined,
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy: startStrategyGeneration,
    isCritiquingStrategy,
    onCritiqueStrategy: startStrategyCritique,
    isGeneratingSkeleton,
    onGenerateSkeleton: startSkeletonGeneration,
    onGoToCharacterTab: goToCharacterTab,
    onGoToStructuredTab: goToStructuredTab,
    latestStateSnapshot,
    payoffLedger,
    characterResources,
    outlineText,
    structuredDraftText,
    volumes: normalizedVolumeDraft,
    onVolumeFieldChange: handleVolumeFieldChange,
    onOpenPayoffsChange: handleOpenPayoffsChange,
    onAddVolume: handleAddVolume,
    onRemoveVolume: handleRemoveVolume,
    onMoveVolume: handleMoveVolume,
    onSaveOutline: () => saveOutlineMutation.mutate(),
    isSavingOutline: saveOutlineMutation.isPending,
    volumeMessage: volumeGenerationMessage || volumeMessage,
    volumeVersions,
    selectedVersionId,
    onSelectedVersionChange: setSelectedVersionId,
    onCreateDraftVersion: () => createDraftVersionMutation.mutate(),
    isCreatingDraftVersion: createDraftVersionMutation.isPending,
    onLoadSelectedVersionToDraft: loadSelectedVersionToDraft,
    onActivateVersion: () => activateVersionMutation.mutate(),
    isActivatingVersion: activateVersionMutation.isPending,
    onFreezeVersion: () => freezeVersionMutation.mutate(),
    isFreezingVersion: freezeVersionMutation.isPending,
    onLoadVersionDiff: () => diffMutation.mutate(),
    isLoadingVersionDiff: diffMutation.isPending,
    diffResult,
    onAnalyzeDraftImpact: () => analyzeDraftImpactMutation.mutate(),
    isAnalyzingDraftImpact: analyzeDraftImpactMutation.isPending,
    onAnalyzeVersionImpact: () => analyzeVersionImpactMutation.mutate(),
    isAnalyzingVersionImpact: analyzeVersionImpactMutation.isPending,
    impactResult,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    isGeneratingBeatSheet,
    onGenerateBeatSheet: startBeatSheetGeneration,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    onGenerateChapterList: startChapterListGeneration,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    chapterDetailFailure,
    onGenerateChapterDetail: startChapterDetailGeneration,
    onGenerateChapterDetailBundle: startChapterDetailBundleGeneration,
    onRetryFailedChapterDetail: retryFailedChapterDetail,
    syncPreview: volumeSyncPreview,
    syncOptions: volumeSyncOptions,
    onSyncOptionsChange: (patch) => setVolumeSyncOptions((prev) => ({ ...prev, ...patch })),
    onApplySync: (options) => syncStructuredChaptersMutation.mutate(options),
    isApplyingSync: syncStructuredChaptersMutation.isPending,
    syncMessage: structuredMessage,
    chapters: outlineSyncChapters,
    onChapterFieldChange: handleChapterFieldChange,
    onChapterNumberChange: handleChapterNumberChange,
    onChapterPayoffRefsChange: handleChapterPayoffRefsChange,
    onAddChapter: handleAddChapter,
    onRemoveChapter: handleRemoveChapter,
    onMoveChapter: handleMoveChapter,
    onApplyBatch: (patch) => {
      setVolumeDraft((prev) => applyVolumeChapterBatch(prev, patch));
    },
    onSaveStructured: () => saveStructuredMutation.mutate(),
    isSavingStructured: saveStructuredMutation.isPending,
  });
  const chapterTab = {
    novelId: id,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter: setSelectedChapterId,
    onGoToCharacterTab: goToCharacterTab,
    onCreateChapter: () => createChapterMutation.mutate(),
    isCreatingChapter: createChapterMutation.isPending,
    onRemoveChapter: (chapter: Chapter) => {
      const confirmed = window.confirm(`确认移除「第${chapter.order}章 ${chapter.title || "未命名章节"}」吗？该章节尚未开始写作，移除后不可恢复。`);
      if (confirmed) {
        deleteManualChapterMutation.mutate(chapter.id);
      }
    },
    removingChapterId: deleteManualChapterMutation.isPending
      ? deleteManualChapterMutation.variables ?? null
      : null,
    chapterOperationMessage,
    strategy: chapterStrategy,
    onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) =>
      setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)),
    onApplyStrategy: chapterExecutionActions.applyStrategy,
    isApplyingStrategy: chapterExecutionActions.isPatchingChapter,
    onGenerateSelectedChapter: handleGenerateSelectedChapter,
    onRewriteChapter: chapterExecutionActions.rewriteChapter,
    onExpandChapter: chapterExecutionActions.expandChapter,
    onCompressChapter: chapterExecutionActions.compressChapter,
    onSummarizeChapter: chapterExecutionActions.summarizeChapter,
    onGenerateTaskSheet: chapterExecutionActions.generateTaskSheet,
    onGenerateSceneCards: chapterExecutionActions.generateSceneCards,
    onGenerateChapterPlan: () => generateChapterPlanMutation.mutate(),
    onReplanChapter: () => replanChapterMutation.mutate(),
    onRunFullAudit: () => runChapterReview("full_audit"),
    onCheckContinuity: chapterExecutionActions.checkContinuity,
    onCheckCharacterConsistency: chapterExecutionActions.checkCharacterConsistency,
    onCheckPacing: chapterExecutionActions.checkPacing,
    onAutoRepair: chapterExecutionActions.autoRepair,
    onStrengthenConflict: chapterExecutionActions.strengthenConflict,
    onEnhanceEmotion: chapterExecutionActions.enhanceEmotion,
    onUnifyStyle: chapterExecutionActions.unifyStyle,
    onAddDialogue: chapterExecutionActions.addDialogue,
    onAddDescription: chapterExecutionActions.addDescription,
    isGeneratingTaskSheet: chapterExecutionActions.isGeneratingTaskSheet,
    isGeneratingSceneCards: chapterExecutionActions.isGeneratingSceneCards,
    isSummarizingChapter: chapterExecutionActions.isSummarizingChapter,
    reviewActionKind,
    repairActionKind: chapterExecutionActions.repairActionKind,
    generationActionKind: chapterExecutionActions.generationActionKind,
    isReviewingChapter: fullAuditMutation.isPending,
    isRepairingChapter: repairSSE.isStreaming,
    reviewResult,
    replanRecommendation: reviewResult?.replanRecommendation ?? null,
    lastReplanResult: replanChapterMutation.data?.data ?? null,
    chapterPlan,
    latestStateSnapshot,
    chapterStateSnapshot,
    chapterTimeline,
    isLoadingChapterTimeline: chapterTimelineQuery.isLoading || chapterTimelineQuery.isFetching,
    chapterResourceContext,
    isLoadingChapterResourceContext: chapterResourceContextQuery.isLoading || chapterResourceContextQuery.isFetching,
    resourceWorkflowMode: activeDirectorSession ? ("auto_director" as const) : ("manual" as const),
    pendingCharacterResourceProposals: chapterPendingCharacterResourceProposals,
    onExtractChapterResources: () => extractChapterResourcesMutation.mutate(),
    isExtractingChapterResources: extractChapterResourcesMutation.isPending,
    onConfirmCharacterResourceProposal: (proposalId: string) => confirmCharacterResourceProposalMutation.mutate(proposalId),
    onRejectCharacterResourceProposal: (proposalId: string) => rejectCharacterResourceProposalMutation.mutate(proposalId),
    confirmingCharacterResourceProposalId: confirmCharacterResourceProposalMutation.isPending
      ? confirmCharacterResourceProposalMutation.variables ?? ""
      : "",
    rejectingCharacterResourceProposalId: rejectCharacterResourceProposalMutation.isPending
      ? rejectCharacterResourceProposalMutation.variables ?? ""
      : "",
    chapterAuditReports,
    backgroundSyncActivities: pipelineBackgroundActivities,
    isGeneratingChapterPlan: generateChapterPlanMutation.isPending,
    isReplanningChapter: replanChapterMutation.isPending,
    isRunningFullAudit: fullAuditMutation.isPending && reviewActionKind === "full_audit",
    chapterQualityReport,
    chapterRuntimePackage: chapterSSE.runtimePackage,
    repairStreamContent: repairSSE.content,
    isRepairStreaming: repairSSE.isStreaming,
    repairStreamingChapterId: activeRepairStream?.chapterId ?? null,
    repairStreamingChapterLabel: activeRepairStream?.chapterLabel ?? null,
    repairRunStatus: repairSSE.latestRun,
    onAbortRepair: handleAbortRepair,
    streamContent: chapterSSE.content,
    isStreaming: chapterSSE.isStreaming,
    streamingChapterId: activeChapterStream?.chapterId ?? null,
    streamingChapterLabel: activeChapterStream?.chapterLabel ?? null,
    chapterRunStatus: chapterSSE.latestRun,
    onAbortStream: handleAbortChapterStream,
    directorTakeoverEntry: undefined,
  };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode", value: number | boolean | string) => setPipelineForm((prev) => ({ ...prev, [field]: value } as typeof prev)), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: (patch?: Partial<typeof pipelineForm>) => runPipelineMutation.mutate(patch), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); setActiveRepairStream(selectedChapter ? { chapterId: selectedChapter.id, chapterLabel: `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}` } : null); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [], auditIssueIds: openAuditIssueIds }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: handleAbortRepair, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = {
    novelId: id,
    llmProvider: llm.provider,
    llmModel: llm.model,
    characterMessage,
    quickCharacterForm,
    onQuickCharacterFormChange: (field: "name" | "role", value: string) =>
      setQuickCharacterForm((prev) => ({ ...prev, [field]: value })),
    onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => quickCreateCharacterMutation.mutate(payload),
    isQuickCreating: quickCreateCharacterMutation.isPending,
    onGenerateSupplementalCharacters: generateSupplementalCharacterMutation.mutateAsync,
    isGeneratingSupplementalCharacters: generateSupplementalCharacterMutation.isPending,
    onApplySupplementalCharacter: applySupplementalCharacterMutation.mutateAsync,
    isApplyingSupplementalCharacter: applySupplementalCharacterMutation.isPending,
    characters,
    coreCharacterCount,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange: setSelectedBaseCharacterId,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter: () => importBaseCharacterMutation.mutate(),
    isImportingBaseCharacter: importBaseCharacterMutation.isPending,
    selectedCharacterId,
    onSelectedCharacterChange: setSelectedCharacterId,
    onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId),
    isDeletingCharacter: deleteCharacterMutation.isPending,
    deletingCharacterId: deleteCharacterMutation.variables ?? "",
    onSyncTimeline: () => syncTimelineMutation.mutate(),
    isSyncingTimeline: syncTimelineMutation.isPending,
    onSyncAllTimeline: () => syncAllTimelineMutation.mutate(),
    isSyncingAllTimeline: syncAllTimelineMutation.isPending,
    onEvolveCharacter: () => evolveCharacterMutation.mutate(),
    isEvolvingCharacter: evolveCharacterMutation.isPending,
    onGenerateVisibleProfile: (userGuidance?: string) => generateVisibleProfileMutation.mutate(userGuidance),
    isGeneratingVisibleProfile: generateVisibleProfileMutation.isPending,
    visibleProfileSuggestion: generateVisibleProfileMutation.data?.data ?? null,
    onApplyVisibleProfile: () => applyVisibleProfileMutation.mutate(),
    isApplyingVisibleProfile: applyVisibleProfileMutation.isPending,
    onGenerateBatchVisibleProfiles: (userGuidance?: string) => generateBatchVisibleProfilesMutation.mutate(userGuidance),
    isGeneratingBatchVisibleProfiles: generateBatchVisibleProfilesMutation.isPending,
    batchVisibleProfileResult: generateBatchVisibleProfilesMutation.data?.data ?? null,
    onApplyBatchVisibleProfiles: () => applyBatchVisibleProfilesMutation.mutate(),
    isApplyingBatchVisibleProfiles: applyBatchVisibleProfilesMutation.isPending,
    onWorldCheck: () => worldCheckMutation.mutate(),
    isCheckingWorld: worldCheckMutation.isPending,
    selectedCharacter,
    characterResources,
    pendingCharacterResourceCount: pendingCharacterResourceProposals.length,
    onBackfillCharacterResources: () => backfillCharacterResourcesMutation.mutate(),
    isBackfillingCharacterResources: backfillCharacterResourcesMutation.isPending,
    characterForm,
    onCharacterFormChange: (field: keyof typeof characterForm, value: string) =>
      setCharacterForm((prev) => ({ ...prev, [field]: value })),
    onSaveCharacter: () => saveCharacterMutation.mutate(),
    isSavingCharacter: saveCharacterMutation.isPending,
    timelineEvents: characterTimelineQuery.data?.data ?? [],
  };

  const activeStepTakeoverEntry = renderTakeoverEntry(
    activeTab === "story_macro"
      ? "story_macro"
      : activeTab === "world"
        ? "world"
      : activeTab === "character"
        ? "character"
        : activeTab === "outline"
          ? "outline"
          : activeTab === "structured"
            ? "structured"
            : activeTab === "chapter"
              ? "chapter"
              : activeTab === "pipeline"
                ? "pipeline"
                : "basic",
  );
  if (displayAutoDirectorTask?.checkpointType === "production_experience_required") {
    return (
      <NovelProductionExperienceHandoff
        taskId={displayAutoDirectorTask.id}
        novelId={id}
        novelTitle={basicForm.title}
      />
    );
  }

  return (
    <NovelEditView
      id={id}
      activeTab={activeTab}
      workflowCurrentTab={workflowCurrentTab}
      onActiveTabChange={setActiveTab}
      exportControls={exportControls}
      basicTab={basicTab}
      worldTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={isTakeoverDismissed ? null : takeover}
      activeStepTakeoverEntry={activeStepTakeoverEntry}
      onSwitchToSimpleMode={() => switchToSimpleMutation.mutate()}
      isSwitchingToSimpleMode={switchToSimpleMutation.isPending}
      taskDrawer={{
        open: isTaskDrawerOpen,
        onOpenChange: (open) => {
          setIsTaskDrawerOpen(open);
          if (!open && taskPanelOpen) {
            clearTaskPanelOpen();
          }
        },
        task: displayAutoDirectorTask,
        snapshot: activeDirectorSnapshot,
        runtimeSnapshot: activeDirectorRuntimeSnapshot,
        projection: displayAutoDirectorTask?.status === "cancelled" ? null : bookAutomationProjection,
        currentUiModel: {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        actions: taskDrawerActions,
        onProjectionAction: handleTaskDrawerProjectionAction,
        followUp: activeAutoDirectorFollowUp,
        onFollowUpAction: handleDrawerFollowUpAction,
        executingFollowUpAction: executeFollowUpActionMutation.isPending,
        runtimeHardBlocked: activeDirectorRuntimeHardBlocked,
        runtimeBlockedReason: activeDirectorRuntimeBlockedReason,
        overrideModel: retryOverride,
        onOverrideModelChange: setRetryOverride,
        onRetryWithOverrideModel: () => retryAutoDirectorWithCurrentModelMutation.mutate(),
        retryWithOverrideModelPending: retryAutoDirectorWithCurrentModelMutation.isPending,
        canRetryWithOverrideModel: Boolean(retryOverride.provider && retryOverride.model.trim()),
        onRetryWithTaskModel: () => retryAutoDirectorWithTaskModelMutation.mutate(),
        retryWithTaskModelPending: retryAutoDirectorWithTaskModelMutation.isPending,
        capabilities: {
          availableActions: taskDrawerActions.length > 0,
          availableFollowUps: Boolean(activeAutoDirectorFollowUp),
          canAdjustRuntimePolicy: Boolean(activeDirectorRuntimeSnapshot && displayAutoDirectorTask),
          canInspectManualEditImpact: Boolean(displayAutoDirectorTask),
          canRetryWithOverrideModel: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
          canCancel: Boolean(displayAutoDirectorTask && canCancelDirectorTask(displayAutoDirectorTask)),
          canArchive: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "succeeded" || displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
        },
        resourceProposals: pendingCharacterResourceProposals,
        onOpenResourceProposalSource: (proposal) => {
          if (proposal.chapterId) {
            setSelectedChapterId(proposal.chapterId);
            setActiveTab("chapter");
          } else {
            setActiveTab("character");
          }
          setIsTaskDrawerOpen(false);
        },
        onConfirmResourceProposal: (proposalId) => confirmCharacterResourceProposalMutation.mutate(proposalId),
        onRejectResourceProposal: (proposalId) => rejectCharacterResourceProposalMutation.mutate(proposalId),
        confirmingResourceProposalId: confirmCharacterResourceProposalMutation.isPending
          ? confirmCharacterResourceProposalMutation.variables ?? ""
          : "",
        rejectingResourceProposalId: rejectCharacterResourceProposalMutation.isPending
          ? rejectCharacterResourceProposalMutation.variables ?? ""
          : "",
        onOpenFullTaskCenter: openAutoDirectorTaskCenter,
      }}
    />
  );
}
