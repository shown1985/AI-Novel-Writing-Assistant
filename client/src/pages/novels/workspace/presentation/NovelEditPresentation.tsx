import type { Dispatch, SetStateAction } from "react";
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
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import NovelEditView from "../../components/NovelEditView";
import NovelExistingProjectTakeoverDialog from "../../components/NovelExistingProjectTakeoverDialog";
import NovelProductionExperienceHandoff from "../../components/NovelProductionExperienceHandoff";
import type {
  CharacterTabViewProps,
  PipelineTabViewProps,
  StoryMacroTabProps,
} from "../../components/NovelEditView.types";
import type { ChapterExecutionStrategy } from "../../chapterExecution.utils";
import type { ChapterReviewResult } from "../../chapterPlanning.shared";
import type { useNovelCharacterMutations } from "../../hooks/useNovelCharacterMutations";
import type { useNovelContinuationSources } from "../../hooks/useNovelContinuationSources";
import type { useNovelEditChapterRuntime } from "../../hooks/useNovelEditChapterRuntime";
import type { useNovelEditMutations } from "../../hooks/useNovelEditMutations";
import type { useNovelVolumePlanning } from "../../hooks/useNovelVolumePlanning";
import type { useNovelWorldSlice } from "../../hooks/useNovelWorldSlice";
import type { useVolumeVersionControl } from "../../hooks/useVolumeVersionControl";
import { patchNovelBasicForm, type NovelBasicFormState } from "../../novelBasicInfo.shared";
import { resolveTakeoverDialogContextTaskId } from "../../novelEditAutomationStatus";
import { applyVolumeChapterBatch, type VolumeSyncOptions } from "../../volumePlan.utils";
import type {
  useWorkspaceDirectorCommands,
  useWorkspaceDirectorInteraction,
  useWorkspaceDirectorState,
  useWorkspaceExport,
  useWorkspaceResources,
} from "../application";
import type { useSSE } from "@/hooks/useSSE";
import { buildNovelEditPlanningTabs } from "./planningTabs";
import {
  assembleNovelEditViewProps,
  buildNovelEditTaskDrawer,
  buildNovelEditPresentationNavigation,
  resolveActiveTakeoverStep,
  resolveProductionExperienceHandoff,
} from "./workspaceViewAssembly";

type WorkspaceResources = ReturnType<typeof useWorkspaceResources>;
type WorkspaceDirectorState = ReturnType<typeof useWorkspaceDirectorState>;
type WorkspaceDirectorCommands = ReturnType<typeof useWorkspaceDirectorCommands>;
type WorkspaceDirectorInteraction = ReturnType<typeof useWorkspaceDirectorInteraction>;
type WorkspaceExportControls = ReturnType<typeof useWorkspaceExport>;
type ContinuationSources = ReturnType<typeof useNovelContinuationSources>;
type WorldSlice = ReturnType<typeof useNovelWorldSlice>;
type VolumePlanning = ReturnType<typeof useNovelVolumePlanning>;
type EditMutations = ReturnType<typeof useNovelEditMutations>;
type CharacterMutations = ReturnType<typeof useNovelCharacterMutations>;
type VolumeVersionControl = ReturnType<typeof useVolumeVersionControl>;
type ChapterRuntime = ReturnType<typeof useNovelEditChapterRuntime>;
type SSEController = ReturnType<typeof useSSE>;

interface ResourceProposalMutation {
  isPending: boolean;
  variables?: string;
  mutate: (proposalId: string) => void;
}

interface NoArgMutation {
  isPending: boolean;
  mutate: () => void;
}

interface PresentationState {
  basicForm: NovelBasicFormState;
  volumeStrategyPlan: VolumeStrategyPlan | null;
  volumeCritiqueReport: VolumeCritiqueReport | null;
  volumeBeatSheets: VolumeBeatSheet[];
  volumeRebalanceDecisions: VolumeRebalanceDecision[];
  volumeGenerationMessage: string;
  volumeSyncOptions: VolumeSyncOptions;
  pipelineForm: PipelineTabViewProps["pipelineForm"];
  pipelineMessage: string;
  structuredMessage: string;
  chapterOperationMessage: string;
  chapterStrategy: ChapterExecutionStrategy;
  reviewResult: ChapterReviewResult | null;
  repairBeforeContent: string;
  repairAfterContent: string;
  activeChapterStream: { chapterId: string; chapterLabel: string } | null;
  activeRepairStream: { chapterId: string; chapterLabel: string } | null;
  characterMessage: string;
  quickCharacterForm: CharacterTabViewProps["quickCharacterForm"];
  characterForm: CharacterTabViewProps["characterForm"];
  selectedCharacterId: string;
  selectedBaseCharacterId: string;
  retryOverride: LLMSelectorValue;
}

interface PresentationSetters {
  setActiveTab: (value: string) => void;
  setSelectedChapterId: (value: string) => void;
  setSelectedCharacterId: (value: string) => void;
  setSelectedBaseCharacterId: (value: string) => void;
  setIsTaskDrawerOpen: (value: boolean) => void;
  setBasicForm: Dispatch<SetStateAction<NovelBasicFormState>>;
  setVolumeDraft: Dispatch<SetStateAction<VolumePlan[]>>;
  setVolumeSyncOptions: Dispatch<SetStateAction<VolumeSyncOptions>>;
  setPipelineForm: Dispatch<SetStateAction<PipelineTabViewProps["pipelineForm"]>>;
  setChapterStrategy: Dispatch<SetStateAction<ChapterExecutionStrategy>>;
  setQuickCharacterForm: Dispatch<SetStateAction<CharacterTabViewProps["quickCharacterForm"]>>;
  setCharacterForm: Dispatch<SetStateAction<CharacterTabViewProps["characterForm"]>>;
  setRetryOverride: Dispatch<SetStateAction<LLMSelectorValue>>;
  setRepairBeforeContent: (value: string) => void;
  setRepairAfterContent: (value: string) => void;
  setActiveRepairStream: (value: { chapterId: string; chapterLabel: string } | null) => void;
}

export interface NovelEditPresentationProps {
  id: string;
  activeTab: string;
  directorTaskId: string;
  selectedChapterId: string;
  taskPanelOpen: boolean;
  clearTaskPanelOpen: () => void;
  isTaskDrawerOpen: boolean;
  isTakeoverDismissed: boolean;
  model: { provider: string; model: string; temperature: number };
  state: PresentationState;
  setters: PresentationSetters;
  resources: WorkspaceResources;
  director: WorkspaceDirectorState;
  directorCommands: WorkspaceDirectorCommands;
  directorInteraction: WorkspaceDirectorInteraction;
  exportControls: WorkspaceExportControls;
  continuationSources: ContinuationSources;
  storyMacroTab: StoryMacroTabProps;
  worldSlice: WorldSlice;
  volumePlanning: VolumePlanning;
  volumeSyncPreview: VolumeSyncPreview;
  outlineText: string;
  structuredDraftText: string;
  editMutations: EditMutations;
  characterMutations: CharacterMutations;
  volumeVersionControl: VolumeVersionControl;
  chapterRuntime: ChapterRuntime;
  chapterPendingCharacterResourceProposals: WorkspaceResources["pendingCharacterResourceProposals"];
  streams: {
    chapter: SSEController;
    bible: SSEController;
    beats: SSEController;
    repair: SSEController;
  };
  resourceMutations: {
    extract: NoArgMutation;
    backfill: NoArgMutation;
    confirm: ResourceProposalMutation;
    reject: ResourceProposalMutation;
  };
  switchToSimple: { isPending: boolean; mutate: () => void };
}

export function NovelEditPresentation(props: NovelEditPresentationProps) {
  const {
    id,
    activeTab,
    directorTaskId,
    selectedChapterId,
    taskPanelOpen,
    clearTaskPanelOpen,
    isTaskDrawerOpen,
    isTakeoverDismissed,
    model,
    state,
    setters,
    resources,
    director,
    directorCommands,
    directorInteraction,
    exportControls,
    continuationSources,
    storyMacroTab,
    worldSlice,
    volumePlanning,
    volumeSyncPreview,
    outlineText,
    structuredDraftText,
    editMutations,
    characterMutations,
    volumeVersionControl,
    chapterRuntime,
    chapterPendingCharacterResourceProposals,
    streams,
    resourceMutations,
    switchToSimple,
  } = props;
  const navigation = buildNovelEditPresentationNavigation(setters);

  const renderTakeoverEntry = (
    step: ReturnType<typeof resolveActiveTakeoverStep>,
    variant: "default" | "outline" | "secondary" = "default",
  ) => {
    const workflowTaskId = resolveTakeoverDialogContextTaskId({
      directorTaskId,
      activeAutoDirectorTask: director.activeAutoDirectorTask,
      projection: director.bookAutomationProjection,
    });
    return (
      <NovelExistingProjectTakeoverDialog
        novelId={id}
        basicForm={state.basicForm}
        triggerVariant={variant}
        defaultEntryStep={step}
        workflowTaskId={workflowTaskId}
      />
    );
  };

  const { basicTab, outlineTab, structuredTab } = buildNovelEditPlanningTabs({
    id,
    basicForm: state.basicForm,
    genreOptions: resources.genreOptions,
    storyModeOptions: resources.storyModeOptions,
    worldOptions: resources.worldListQuery.data?.data ?? [],
    sourceNovelOptions: continuationSources.sourceNovelOptions,
    sourceKnowledgeOptions: continuationSources.sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions: continuationSources.sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: continuationSources.sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    novelWorldView: worldSlice.novelWorldView,
    novelWorldSyncDiff: worldSlice.novelWorldSyncDiff,
    worldSliceView: worldSlice.worldSliceView,
    worldSliceMessage: worldSlice.worldSliceMessage,
    isLoadingNovelWorld: worldSlice.isLoadingNovelWorld,
    isImportingNovelWorld: worldSlice.isImportingNovelWorld,
    isGeneratingNovelWorld: worldSlice.isGeneratingNovelWorld,
    isCreatingManualNovelWorld: worldSlice.isCreatingManualNovelWorld,
    isSavingNovelWorldToLibrary: worldSlice.isSavingNovelWorldToLibrary,
    isLoadingNovelWorldSyncDiff: worldSlice.isLoadingNovelWorldSyncDiff,
    isSyncingNovelWorld: worldSlice.isSyncingNovelWorld,
    isRefreshingWorldSlice: worldSlice.isRefreshingWorldSlice,
    isSavingWorldSliceOverrides: worldSlice.isSavingWorldSliceOverrides,
    onBasicFormChange: (patch) => setters.setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onSaveBasic: () => editMutations.saveBasicMutation.mutate(),
    onImportNovelWorld: worldSlice.importNovelWorld,
    onCreateManualNovelWorld: worldSlice.createManualNovelWorld,
    onGenerateNovelWorld: worldSlice.generateNovelWorld,
    onSaveNovelWorldToLibrary: worldSlice.saveNovelWorldToLibrary,
    onSyncNovelWorld: worldSlice.syncNovelWorld,
    onRefreshWorldSlice: worldSlice.refreshWorldSlice,
    onSaveWorldSliceOverrides: worldSlice.saveWorldSliceOverrides,
    isSavingBasic: editMutations.saveBasicMutation.isPending,
    projectQuickStart: undefined,
    basicDirectorTakeoverEntry: undefined,
    storyMacroDirectorTakeoverEntry: undefined,
    outlineDirectorTakeoverEntry: undefined,
    structuredDirectorTakeoverEntry: undefined,
    worldInjectionSummary: resources.worldInjectionSummary,
    hasCharacters: resources.hasCharacters,
    hasUnsavedVolumeDraft: volumePlanning.hasUnsavedVolumeDraft,
    generationNotice: volumePlanning.generationNotice,
    readiness: volumePlanning.readiness,
    volumeCountGuidance: volumePlanning.volumeCountGuidance,
    customVolumeCountEnabled: volumePlanning.customVolumeCountEnabled,
    customVolumeCountInput: volumePlanning.customVolumeCountInput,
    onCustomVolumeCountEnabledChange: volumePlanning.onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange: volumePlanning.onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount: volumePlanning.onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount: volumePlanning.onRestoreSystemRecommendedVolumeCount,
    strategyPlan: state.volumeStrategyPlan,
    critiqueReport: state.volumeCritiqueReport,
    isGeneratingStrategy: volumePlanning.isGeneratingStrategy,
    onGenerateStrategy: volumePlanning.startStrategyGeneration,
    isCritiquingStrategy: volumePlanning.isCritiquingStrategy,
    onCritiqueStrategy: volumePlanning.startStrategyCritique,
    isGeneratingSkeleton: volumePlanning.isGeneratingSkeleton,
    onGenerateSkeleton: volumePlanning.startSkeletonGeneration,
    onGoToCharacterTab: navigation.onGoToCharacterTab,
    onGoToStructuredTab: navigation.onGoToStructuredTab,
    latestStateSnapshot: resources.latestStateSnapshot,
    payoffLedger: resources.payoffLedger,
    characterResources: resources.characterResources,
    outlineText,
    structuredDraftText,
    volumes: volumePlanning.normalizedVolumeDraft,
    onVolumeFieldChange: volumePlanning.handleVolumeFieldChange,
    onOpenPayoffsChange: volumePlanning.handleOpenPayoffsChange,
    onAddVolume: volumePlanning.handleAddVolume,
    onRemoveVolume: volumePlanning.handleRemoveVolume,
    onMoveVolume: volumePlanning.handleMoveVolume,
    onSaveOutline: () => editMutations.saveOutlineMutation.mutate(),
    isSavingOutline: editMutations.saveOutlineMutation.isPending,
    volumeMessage: state.volumeGenerationMessage || volumeVersionControl.volumeMessage,
    volumeVersions: volumeVersionControl.volumeVersions,
    selectedVersionId: volumeVersionControl.selectedVersionId,
    onSelectedVersionChange: volumeVersionControl.setSelectedVersionId,
    onCreateDraftVersion: () => volumeVersionControl.createDraftVersionMutation.mutate(),
    isCreatingDraftVersion: volumeVersionControl.createDraftVersionMutation.isPending,
    onLoadSelectedVersionToDraft: volumeVersionControl.loadSelectedVersionToDraft,
    onActivateVersion: () => volumeVersionControl.activateVersionMutation.mutate(),
    isActivatingVersion: volumeVersionControl.activateVersionMutation.isPending,
    onFreezeVersion: () => volumeVersionControl.freezeVersionMutation.mutate(),
    isFreezingVersion: volumeVersionControl.freezeVersionMutation.isPending,
    onLoadVersionDiff: () => volumeVersionControl.diffMutation.mutate(),
    isLoadingVersionDiff: volumeVersionControl.diffMutation.isPending,
    diffResult: volumeVersionControl.diffResult,
    onAnalyzeDraftImpact: () => volumeVersionControl.analyzeDraftImpactMutation.mutate(),
    isAnalyzingDraftImpact: volumeVersionControl.analyzeDraftImpactMutation.isPending,
    onAnalyzeVersionImpact: () => volumeVersionControl.analyzeVersionImpactMutation.mutate(),
    isAnalyzingVersionImpact: volumeVersionControl.analyzeVersionImpactMutation.isPending,
    impactResult: volumeVersionControl.impactResult,
    beatSheets: state.volumeBeatSheets,
    rebalanceDecisions: state.volumeRebalanceDecisions,
    isGeneratingBeatSheet: volumePlanning.isGeneratingBeatSheet,
    onGenerateBeatSheet: volumePlanning.startBeatSheetGeneration,
    isGeneratingChapterList: volumePlanning.isGeneratingChapterList,
    generatingChapterListVolumeId: volumePlanning.generatingChapterListVolumeId,
    generatingChapterListBeatKey: volumePlanning.generatingChapterListBeatKey,
    generatingChapterListMode: volumePlanning.generatingChapterListMode,
    onGenerateChapterList: volumePlanning.startChapterListGeneration,
    isGeneratingChapterDetail: volumePlanning.isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle: volumePlanning.isGeneratingChapterDetailBundle,
    generatingChapterDetailMode: volumePlanning.generatingChapterDetailMode,
    generatingChapterDetailChapterId: volumePlanning.generatingChapterDetailChapterId,
    chapterDetailFailure: volumePlanning.chapterDetailFailure,
    onGenerateChapterDetail: volumePlanning.startChapterDetailGeneration,
    onGenerateChapterDetailBundle: volumePlanning.startChapterDetailBundleGeneration,
    onRetryFailedChapterDetail: volumePlanning.retryFailedChapterDetail,
    syncPreview: volumeSyncPreview,
    syncOptions: state.volumeSyncOptions,
    onSyncOptionsChange: (patch) => setters.setVolumeSyncOptions((prev) => ({ ...prev, ...patch })),
    onApplySync: (options) => editMutations.syncStructuredChaptersMutation.mutate(options),
    isApplyingSync: editMutations.syncStructuredChaptersMutation.isPending,
    syncMessage: state.structuredMessage,
    chapters: resources.outlineSyncChapters,
    onChapterFieldChange: volumePlanning.handleChapterFieldChange,
    onChapterNumberChange: volumePlanning.handleChapterNumberChange,
    onChapterPayoffRefsChange: volumePlanning.handleChapterPayoffRefsChange,
    onAddChapter: volumePlanning.handleAddChapter,
    onRemoveChapter: volumePlanning.handleRemoveChapter,
    onMoveChapter: volumePlanning.handleMoveChapter,
    onApplyBatch: (patch) => setters.setVolumeDraft((prev) => applyVolumeChapterBatch(prev, patch)),
    onSaveStructured: () => editMutations.saveStructuredMutation.mutate(),
    isSavingStructured: editMutations.saveStructuredMutation.isPending,
  });

  const chapterTab = {
    novelId: id,
    worldInjectionSummary: resources.worldInjectionSummary,
    hasCharacters: resources.hasCharacters,
    chapters: resources.chapters,
    selectedChapterId,
    selectedChapter: resources.selectedChapter,
    onSelectChapter: setters.setSelectedChapterId,
    onGoToCharacterTab: navigation.onGoToCharacterTab,
    onCreateChapter: () => editMutations.createChapterMutation.mutate(),
    isCreatingChapter: editMutations.createChapterMutation.isPending,
    onRemoveChapter: (chapter: Chapter) => {
      const confirmed = window.confirm(`确认移除「第${chapter.order}章 ${chapter.title || "未命名章节"}」吗？该章节尚未开始写作，移除后不可恢复。`);
      if (confirmed) editMutations.deleteManualChapterMutation.mutate(chapter.id);
    },
    removingChapterId: editMutations.deleteManualChapterMutation.isPending
      ? editMutations.deleteManualChapterMutation.variables ?? null
      : null,
    chapterOperationMessage: state.chapterOperationMessage,
    strategy: state.chapterStrategy,
    onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) =>
      setters.setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)),
    onApplyStrategy: chapterRuntime.chapterExecutionActions.applyStrategy,
    isApplyingStrategy: chapterRuntime.chapterExecutionActions.isPatchingChapter,
    onGenerateSelectedChapter: chapterRuntime.handleGenerateSelectedChapter,
    onRewriteChapter: chapterRuntime.chapterExecutionActions.rewriteChapter,
    onExpandChapter: chapterRuntime.chapterExecutionActions.expandChapter,
    onCompressChapter: chapterRuntime.chapterExecutionActions.compressChapter,
    onSummarizeChapter: chapterRuntime.chapterExecutionActions.summarizeChapter,
    onGenerateTaskSheet: chapterRuntime.chapterExecutionActions.generateTaskSheet,
    onGenerateSceneCards: chapterRuntime.chapterExecutionActions.generateSceneCards,
    onGenerateChapterPlan: () => chapterRuntime.generateChapterPlanMutation.mutate(),
    onReplanChapter: () => chapterRuntime.replanChapterMutation.mutate(),
    onRunFullAudit: () => chapterRuntime.runChapterReview("full_audit"),
    onCheckContinuity: chapterRuntime.chapterExecutionActions.checkContinuity,
    onCheckCharacterConsistency: chapterRuntime.chapterExecutionActions.checkCharacterConsistency,
    onCheckPacing: chapterRuntime.chapterExecutionActions.checkPacing,
    onAutoRepair: chapterRuntime.chapterExecutionActions.autoRepair,
    onStrengthenConflict: chapterRuntime.chapterExecutionActions.strengthenConflict,
    onEnhanceEmotion: chapterRuntime.chapterExecutionActions.enhanceEmotion,
    onUnifyStyle: chapterRuntime.chapterExecutionActions.unifyStyle,
    onAddDialogue: chapterRuntime.chapterExecutionActions.addDialogue,
    onAddDescription: chapterRuntime.chapterExecutionActions.addDescription,
    isGeneratingTaskSheet: chapterRuntime.chapterExecutionActions.isGeneratingTaskSheet,
    isGeneratingSceneCards: chapterRuntime.chapterExecutionActions.isGeneratingSceneCards,
    isSummarizingChapter: chapterRuntime.chapterExecutionActions.isSummarizingChapter,
    reviewActionKind: chapterRuntime.reviewActionKind,
    repairActionKind: chapterRuntime.chapterExecutionActions.repairActionKind,
    generationActionKind: chapterRuntime.chapterExecutionActions.generationActionKind,
    isReviewingChapter: chapterRuntime.fullAuditMutation.isPending,
    isRepairingChapter: streams.repair.isStreaming,
    reviewResult: state.reviewResult,
    replanRecommendation: state.reviewResult?.replanRecommendation ?? null,
    lastReplanResult: chapterRuntime.replanChapterMutation.data?.data ?? null,
    chapterPlan: resources.chapterPlan,
    latestStateSnapshot: resources.latestStateSnapshot,
    chapterStateSnapshot: resources.chapterStateSnapshot,
    chapterTimeline: resources.chapterTimeline,
    isLoadingChapterTimeline: resources.chapterTimelineQuery.isLoading || resources.chapterTimelineQuery.isFetching,
    chapterResourceContext: resources.chapterResourceContext,
    isLoadingChapterResourceContext: resources.chapterResourceContextQuery.isLoading || resources.chapterResourceContextQuery.isFetching,
    resourceWorkflowMode: director.activeDirectorSession ? ("auto_director" as const) : ("manual" as const),
    pendingCharacterResourceProposals: chapterPendingCharacterResourceProposals,
    onExtractChapterResources: () => resourceMutations.extract.mutate(),
    isExtractingChapterResources: resourceMutations.extract.isPending,
    onConfirmCharacterResourceProposal: resourceMutations.confirm.mutate,
    onRejectCharacterResourceProposal: resourceMutations.reject.mutate,
    confirmingCharacterResourceProposalId: resourceMutations.confirm.isPending ? resourceMutations.confirm.variables ?? "" : "",
    rejectingCharacterResourceProposalId: resourceMutations.reject.isPending ? resourceMutations.reject.variables ?? "" : "",
    chapterAuditReports: resources.chapterAuditReports,
    backgroundSyncActivities: resources.pipelineBackgroundActivities,
    isGeneratingChapterPlan: chapterRuntime.generateChapterPlanMutation.isPending,
    isReplanningChapter: chapterRuntime.replanChapterMutation.isPending,
    isRunningFullAudit: chapterRuntime.fullAuditMutation.isPending && chapterRuntime.reviewActionKind === "full_audit",
    chapterQualityReport: resources.chapterQualityReport,
    chapterRuntimePackage: streams.chapter.runtimePackage,
    repairStreamContent: streams.repair.content,
    isRepairStreaming: streams.repair.isStreaming,
    repairStreamingChapterId: state.activeRepairStream?.chapterId ?? null,
    repairStreamingChapterLabel: state.activeRepairStream?.chapterLabel ?? null,
    repairRunStatus: streams.repair.latestRun,
    onAbortRepair: chapterRuntime.handleAbortRepair,
    streamContent: streams.chapter.content,
    isStreaming: streams.chapter.isStreaming,
    streamingChapterId: state.activeChapterStream?.chapterId ?? null,
    streamingChapterLabel: state.activeChapterStream?.chapterLabel ?? null,
    chapterRunStatus: streams.chapter.latestRun,
    onAbortStream: chapterRuntime.handleAbortChapterStream,
    directorTakeoverEntry: undefined,
  };

  const pipelineTab: PipelineTabViewProps = {
    novelId: id,
    worldInjectionSummary: resources.worldInjectionSummary,
    hasCharacters: resources.hasCharacters,
    onGoToCharacterTab: () => setters.setActiveTab("character"),
    pipelineForm: state.pipelineForm,
    onPipelineFormChange: (field, value) => setters.setPipelineForm((prev) => ({ ...prev, [field]: value })),
    maxOrder: resources.maxOrder,
    onGenerateBible: () => void streams.bible.start(`/novels/${id}/bible/generate`, { provider: model.provider, model: model.model, temperature: 0.6 }),
    onAbortBible: streams.bible.abort,
    isBibleStreaming: streams.bible.isStreaming,
    bibleStreamContent: streams.bible.content,
    onGenerateBeats: () => void streams.beats.start(`/novels/${id}/beats/generate`, { provider: model.provider, model: model.model, targetChapters: state.pipelineForm.endOrder }),
    onAbortBeats: streams.beats.abort,
    isBeatsStreaming: streams.beats.isStreaming,
    beatsStreamContent: streams.beats.content,
    onRunPipeline: (patch?: Partial<PipelineTabViewProps["pipelineForm"]>) => editMutations.runPipelineMutation.mutate(patch),
    isRunningPipeline: editMutations.runPipelineMutation.isPending,
    pipelineMessage: state.pipelineMessage,
    pipelineJob: resources.pipelineJobQuery.data?.data,
    chapters: resources.chapters,
    selectedChapterId,
    onSelectedChapterChange: navigation.onSelectedChapterChange,
    onReviewChapter: () => editMutations.reviewMutation.mutate(),
    isReviewing: editMutations.reviewMutation.isPending,
    onRepairChapter: () => {
      setters.setRepairBeforeContent(resources.selectedChapter?.content ?? "");
      setters.setRepairAfterContent("");
      setters.setActiveRepairStream(resources.selectedChapter ? {
        chapterId: resources.selectedChapter.id,
        chapterLabel: `第${resources.selectedChapter.order}章 ${resources.selectedChapter.title || "未命名章节"}`,
      } : null);
      void streams.repair.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, {
        provider: model.provider,
        model: model.model,
        reviewIssues: state.reviewResult?.issues ?? [],
        auditIssueIds: resources.chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => issue.id)),
      });
    },
    isRepairing: streams.repair.isStreaming,
    onGenerateHook: () => editMutations.hookMutation.mutate(),
    isGeneratingHook: editMutations.hookMutation.isPending,
    reviewResult: state.reviewResult,
    repairBeforeContent: state.repairBeforeContent,
    repairAfterContent: state.repairAfterContent,
    repairStreamContent: streams.repair.content,
    isRepairStreaming: streams.repair.isStreaming,
    onAbortRepair: chapterRuntime.handleAbortRepair,
    qualitySummary: resources.qualitySummary,
    chapterReports: resources.qualityReportQuery.data?.data?.chapterReports ?? [],
    bible: resources.bible,
    plotBeats: resources.plotBeats,
  };

  const characterTab = {
    novelId: id,
    llmProvider: model.provider,
    llmModel: model.model,
    characterMessage: state.characterMessage,
    quickCharacterForm: state.quickCharacterForm,
    onQuickCharacterFormChange: (field: "name" | "role", value: string) => setters.setQuickCharacterForm((prev) => ({ ...prev, [field]: value })),
    onQuickCreateCharacter: characterMutations.quickCreateCharacterMutation.mutate,
    isQuickCreating: characterMutations.quickCreateCharacterMutation.isPending,
    onGenerateSupplementalCharacters: characterMutations.generateSupplementalCharacterMutation.mutateAsync,
    isGeneratingSupplementalCharacters: characterMutations.generateSupplementalCharacterMutation.isPending,
    onApplySupplementalCharacter: characterMutations.applySupplementalCharacterMutation.mutateAsync,
    isApplyingSupplementalCharacter: characterMutations.applySupplementalCharacterMutation.isPending,
    characters: resources.characters,
    coreCharacterCount: resources.coreCharacterCount,
    baseCharacters: resources.baseCharacters,
    selectedBaseCharacterId: state.selectedBaseCharacterId,
    onSelectedBaseCharacterChange: navigation.onSelectedBaseCharacterChange,
    selectedBaseCharacter: resources.selectedBaseCharacter,
    importedBaseCharacterIds: resources.importedBaseCharacterIds,
    onImportBaseCharacter: () => characterMutations.importBaseCharacterMutation.mutate(),
    isImportingBaseCharacter: characterMutations.importBaseCharacterMutation.isPending,
    selectedCharacterId: state.selectedCharacterId,
    onSelectedCharacterChange: navigation.onSelectedCharacterChange,
    onDeleteCharacter: characterMutations.deleteCharacterMutation.mutate,
    isDeletingCharacter: characterMutations.deleteCharacterMutation.isPending,
    deletingCharacterId: characterMutations.deleteCharacterMutation.variables ?? "",
    onSyncTimeline: () => characterMutations.syncTimelineMutation.mutate(),
    isSyncingTimeline: characterMutations.syncTimelineMutation.isPending,
    onSyncAllTimeline: () => characterMutations.syncAllTimelineMutation.mutate(),
    isSyncingAllTimeline: characterMutations.syncAllTimelineMutation.isPending,
    onEvolveCharacter: () => characterMutations.evolveCharacterMutation.mutate(),
    isEvolvingCharacter: characterMutations.evolveCharacterMutation.isPending,
    onGenerateVisibleProfile: characterMutations.generateVisibleProfileMutation.mutate,
    isGeneratingVisibleProfile: characterMutations.generateVisibleProfileMutation.isPending,
    visibleProfileSuggestion: characterMutations.generateVisibleProfileMutation.data?.data ?? null,
    onApplyVisibleProfile: () => characterMutations.applyVisibleProfileMutation.mutate(),
    isApplyingVisibleProfile: characterMutations.applyVisibleProfileMutation.isPending,
    onGenerateBatchVisibleProfiles: characterMutations.generateBatchVisibleProfilesMutation.mutate,
    isGeneratingBatchVisibleProfiles: characterMutations.generateBatchVisibleProfilesMutation.isPending,
    batchVisibleProfileResult: characterMutations.generateBatchVisibleProfilesMutation.data?.data ?? null,
    onApplyBatchVisibleProfiles: () => characterMutations.applyBatchVisibleProfilesMutation.mutate(),
    isApplyingBatchVisibleProfiles: characterMutations.applyBatchVisibleProfilesMutation.isPending,
    onWorldCheck: () => characterMutations.worldCheckMutation.mutate(),
    isCheckingWorld: characterMutations.worldCheckMutation.isPending,
    selectedCharacter: resources.selectedCharacter,
    characterResources: resources.characterResources,
    pendingCharacterResourceCount: resources.pendingCharacterResourceProposals.length,
    onBackfillCharacterResources: () => resourceMutations.backfill.mutate(),
    isBackfillingCharacterResources: resourceMutations.backfill.isPending,
    characterForm: state.characterForm,
    onCharacterFormChange: (field: keyof CharacterTabViewProps["characterForm"], value: string) => setters.setCharacterForm((prev) => ({ ...prev, [field]: value })),
    onSaveCharacter: () => characterMutations.saveCharacterMutation.mutate(),
    isSavingCharacter: characterMutations.saveCharacterMutation.isPending,
    timelineEvents: characterMutations.characterTimelineQuery.data?.data ?? [],
  };

  const activeStepTakeoverEntry = renderTakeoverEntry(resolveActiveTakeoverStep(activeTab));
  const productionHandoff = resolveProductionExperienceHandoff({
    task: director.displayAutoDirectorTask,
    novelId: id,
    novelTitle: state.basicForm.title,
  });
  if (productionHandoff) {
    return (
      <NovelProductionExperienceHandoff
        taskId={productionHandoff.taskId}
        novelId={productionHandoff.novelId}
        novelTitle={productionHandoff.novelTitle}
      />
    );
  }

  const taskDrawer = buildNovelEditTaskDrawer({
    open: isTaskDrawerOpen,
    setOpen: setters.setIsTaskDrawerOpen,
    taskPanelOpen,
    clearTaskPanelOpen,
    task: director.displayAutoDirectorTask,
    snapshot: director.activeDirectorSnapshot,
    runtimeSnapshot: director.activeDirectorRuntimeSnapshot,
    projection: director.bookAutomationProjection,
    currentUiModel: model,
    actions: directorInteraction.taskDrawerActions,
    onProjectionAction: directorCommands.handleTaskDrawerProjectionAction,
    followUp: director.activeAutoDirectorFollowUp,
    onFollowUpAction: directorCommands.handleDrawerFollowUpAction,
    executingFollowUpAction: directorCommands.executeFollowUpActionMutation.isPending,
    runtimeHardBlocked: director.activeDirectorRuntimeHardBlocked,
    runtimeBlockedReason: director.activeDirectorRuntimeBlockedReason,
    overrideModel: state.retryOverride,
    onOverrideModelChange: setters.setRetryOverride,
    onRetryWithOverrideModel: () => directorCommands.retryAutoDirectorWithCurrentModelMutation.mutate(),
    retryWithOverrideModelPending: directorCommands.retryAutoDirectorWithCurrentModelMutation.isPending,
    onRetryWithTaskModel: () => directorCommands.retryAutoDirectorWithTaskModelMutation.mutate(),
    retryWithTaskModelPending: directorCommands.retryAutoDirectorWithTaskModelMutation.isPending,
    canCancel: Boolean(director.displayAutoDirectorTask && canCancelDirectorTask(director.displayAutoDirectorTask)),
    resourceProposals: resources.pendingCharacterResourceProposals,
    onOpenResourceProposalSource: (proposal) => {
      if (proposal.chapterId) {
        setters.setSelectedChapterId(proposal.chapterId);
        setters.setActiveTab("chapter");
      } else {
        setters.setActiveTab("character");
      }
      setters.setIsTaskDrawerOpen(false);
    },
    onConfirmResourceProposal: resourceMutations.confirm.mutate,
    onRejectResourceProposal: resourceMutations.reject.mutate,
    confirmingResourceProposalId: resourceMutations.confirm.isPending ? resourceMutations.confirm.variables ?? "" : "",
    rejectingResourceProposalId: resourceMutations.reject.isPending ? resourceMutations.reject.variables ?? "" : "",
    onOpenFullTaskCenter: directorCommands.openAutoDirectorTaskCenter,
  });

  const viewProps = assembleNovelEditViewProps({
    shell: {
      id,
      activeTab,
      workflowCurrentTab: director.workflowCurrentTab,
      onActiveTabChange: setters.setActiveTab,
      exportControls,
      takeover: isTakeoverDismissed ? null : directorInteraction.takeover,
      activeStepTakeoverEntry,
      onSwitchToSimpleMode: () => switchToSimple.mutate(),
      isSwitchingToSimpleMode: switchToSimple.isPending,
      taskDrawer,
    },
    tabs: {
      basic: basicTab,
      world: basicTab,
      storyMacro: storyMacroTab,
      outline: outlineTab,
      structured: structuredTab,
      chapter: chapterTab,
      pipeline: pipelineTab,
      character: characterTab,
    },
  });

  return <NovelEditView {...viewProps} />;
}
