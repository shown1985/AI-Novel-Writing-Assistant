import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
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
import { useLLMStore } from "@/store/llmStore";
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
} from "./novelBasicInfo.shared";
import { syncNovelWorkflowStageSilently, workflowStageFromTab } from "./novelWorkflow.client";
import {
  isNovelWorkspaceFlowTab,
  tabFromDirectorDisplayStage,
} from "./novelWorkspaceNavigation";
import { useStructuredOutlineWorkspaceStore } from "./stores/useStructuredOutlineWorkspaceStore";
import {
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
import { NovelEditPresentation } from "./workspace/presentation";

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
  const workspaceResources = useWorkspaceResources({ id, activeTab, selectedChapterId, currentJobId, selectedCharacterId, selectedBaseCharacterId });
  const { shouldLoadVolumeWorkspace, shouldLoadStoryMacro, shouldLoadWorldSlice, novelDetailQuery, volumeWorkspaceQuery, payoffLedgerChapterOrder, chapterTimelineQuery, chapters, outlineSyncChapters, selectedChapter, characters, baseCharacters, selectedCharacter, selectedBaseCharacter, hasCharacters, savedVolumeWorkspace, chapterAuditReports, pendingCharacterResourceProposals } = workspaceResources;
  const director = useWorkspaceDirectorState({ id, directorTaskId, taskPanelOpen, setDirectorTaskId });
  const { activeAutoDirectorTask, displayAutoDirectorTask, activeDirectorSnapshot, activeStructuredOutlineChapterId, workflowCurrentTab, autoDirectorRefreshSignatureRef, autoDirectorArtifactSignatureRef, autoDirectorWorkspaceSignatureRef, activeAutoDirectorRefreshSignature, activeAutoDirectorArtifactSignature, activeAutoDirectorWorkspaceSignature } = director;
  const directorCommands = useWorkspaceDirectorCommands({ id, activeTab, selectedChapterId, payoffLedgerChapterOrder, director, queryClient, llm, navigate, setActiveTab, setSelectedChapterId, setSelectedVolumeId, setDirectorTaskId, setIsTaskDrawerOpen, setIsDirectorExitActionExpanded });
  const { invalidateAutoDirectorTaskState, invalidateWorkspaceDataForTabs, invalidateVisibleWorkspaceData } = directorCommands;
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
  const continuationSources = useNovelContinuationSources(id, {
    writingMode: basicForm.writingMode,
    continuationSourceType: basicForm.continuationSourceType,
    sourceNovelId: basicForm.sourceNovelId,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId,
  });
  const { sourceBookAnalysesQuery, sourceNovelBookAnalysisOptions } = continuationSources;

  const { tab: storyMacroTab } = useNovelStoryMacro({
    novelId: id,
    enabled: shouldLoadStoryMacro,
    llm,
  });
  const worldSlice = useNovelWorldSlice({
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
  const volumePlanning = useNovelVolumePlanning({
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
  const { normalizedVolumeDraft, hasUnsavedVolumeDraft } = volumePlanning;
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
  const directorInteraction = useWorkspaceDirectorInteraction({
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

  const editMutations = useNovelEditMutations({
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

  const characterMutations = useNovelCharacterMutations({
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

  const volumeVersionControl = useVolumeVersionControl({
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
  const chapterRuntime = useNovelEditChapterRuntime({
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
  return (
    <NovelEditPresentation
      id={id}
      activeTab={activeTab}
      directorTaskId={directorTaskId}
      selectedChapterId={selectedChapterId}
      taskPanelOpen={taskPanelOpen}
      clearTaskPanelOpen={clearTaskPanelOpen}
      isTaskDrawerOpen={isTaskDrawerOpen}
      isTakeoverDismissed={isTakeoverDismissed}
      model={{ provider: llm.provider, model: llm.model, temperature: llm.temperature }}
      state={{
        basicForm, volumeStrategyPlan, volumeCritiqueReport, volumeBeatSheets, volumeRebalanceDecisions,
        volumeGenerationMessage, volumeSyncOptions, pipelineForm, pipelineMessage, structuredMessage,
        chapterOperationMessage, chapterStrategy, reviewResult, repairBeforeContent, repairAfterContent,
        activeChapterStream, activeRepairStream, characterMessage, quickCharacterForm, characterForm,
        selectedCharacterId, selectedBaseCharacterId, retryOverride,
      }}
      setters={{
        setActiveTab, setSelectedChapterId, setSelectedCharacterId,
        setSelectedBaseCharacterId, setIsTaskDrawerOpen, setBasicForm,
        setVolumeDraft, setVolumeSyncOptions, setPipelineForm, setChapterStrategy, setQuickCharacterForm,
        setCharacterForm, setRetryOverride, setRepairBeforeContent, setRepairAfterContent,
        setActiveRepairStream,
      }}
      resources={workspaceResources}
      director={director}
      directorCommands={directorCommands}
      directorInteraction={directorInteraction}
      exportControls={exportControls}
      continuationSources={continuationSources}
      storyMacroTab={storyMacroTab}
      worldSlice={worldSlice}
      volumePlanning={volumePlanning}
      volumeSyncPreview={volumeSyncPreview}
      outlineText={outlineText}
      structuredDraftText={structuredDraftText}
      editMutations={editMutations}
      characterMutations={characterMutations}
      volumeVersionControl={volumeVersionControl}
      chapterRuntime={chapterRuntime}
      chapterPendingCharacterResourceProposals={chapterPendingCharacterResourceProposals}
      streams={{ chapter: chapterSSE, bible: bibleSSE, beats: beatsSSE, repair: repairSSE }}
      resourceMutations={{
        extract: extractChapterResourcesMutation,
        backfill: backfillCharacterResourcesMutation,
        confirm: confirmCharacterResourceProposalMutation,
        reject: rejectCharacterResourceProposalMutation,
      }}
      switchToSimple={switchToSimpleMutation}
    />
  );
}
