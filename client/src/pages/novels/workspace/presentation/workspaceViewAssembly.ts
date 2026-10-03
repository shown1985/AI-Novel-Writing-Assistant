import type {
  BasicTabProps,
  CharacterTabViewProps,
  ChapterTabViewProps,
  NovelEditViewProps,
  NovelTaskDrawerState,
  PipelineTabViewProps,
  StoryMacroTabProps,
  StructuredTabViewProps,
  OutlineTabViewProps,
} from "../../components/NovelEditView.types";

type DisplayDirectorTask = NovelTaskDrawerState["task"];

export interface ProductionExperienceHandoffProps {
  taskId: string;
  novelId: string;
  novelTitle: string;
}

export function resolveProductionExperienceHandoff(input: {
  task: DisplayDirectorTask;
  novelId: string;
  novelTitle: string;
}): ProductionExperienceHandoffProps | null {
  if (input.task?.checkpointType !== "production_experience_required") {
    return null;
  }
  return {
    taskId: input.task.id,
    novelId: input.novelId,
    novelTitle: input.novelTitle,
  };
}

export function buildNovelEditTaskDrawer(input: {
  open: boolean;
  setOpen: (open: boolean) => void;
  taskPanelOpen: boolean;
  clearTaskPanelOpen: () => void;
  task: DisplayDirectorTask;
  snapshot: NovelTaskDrawerState["snapshot"];
  runtimeSnapshot: NovelTaskDrawerState["runtimeSnapshot"];
  projection: NovelTaskDrawerState["projection"];
  currentUiModel: NovelTaskDrawerState["currentUiModel"];
  actions: NovelTaskDrawerState["actions"];
  followUp: NovelTaskDrawerState["followUp"];
  onFollowUpAction: NovelTaskDrawerState["onFollowUpAction"];
  executingFollowUpAction: boolean;
  runtimeHardBlocked: boolean;
  runtimeBlockedReason: string | null;
  overrideModel: NovelTaskDrawerState["overrideModel"];
  onOverrideModelChange: NovelTaskDrawerState["onOverrideModelChange"];
  onRetryWithOverrideModel: NovelTaskDrawerState["onRetryWithOverrideModel"];
  retryWithOverrideModelPending: boolean;
  onRetryWithTaskModel: NovelTaskDrawerState["onRetryWithTaskModel"];
  retryWithTaskModelPending: boolean;
  canCancel: boolean;
  resourceProposals: NovelTaskDrawerState["resourceProposals"];
  onOpenResourceProposalSource: NovelTaskDrawerState["onOpenResourceProposalSource"];
  onConfirmResourceProposal: NovelTaskDrawerState["onConfirmResourceProposal"];
  onRejectResourceProposal: NovelTaskDrawerState["onRejectResourceProposal"];
  confirmingResourceProposalId: string;
  rejectingResourceProposalId: string;
  onOpenFullTaskCenter: NovelTaskDrawerState["onOpenFullTaskCenter"];
}): NovelTaskDrawerState {
  const task = input.task;
  return {
    open: input.open,
    onOpenChange: (open) => {
      input.setOpen(open);
      if (!open && input.taskPanelOpen) input.clearTaskPanelOpen();
    },
    task,
    snapshot: input.snapshot,
    runtimeSnapshot: input.runtimeSnapshot,
    projection: task?.status === "cancelled" ? null : input.projection,
    currentUiModel: input.currentUiModel,
    actions: input.actions,
    followUp: input.followUp,
    onFollowUpAction: input.onFollowUpAction,
    executingFollowUpAction: input.executingFollowUpAction,
    runtimeHardBlocked: input.runtimeHardBlocked,
    runtimeBlockedReason: input.runtimeBlockedReason,
    overrideModel: input.overrideModel,
    onOverrideModelChange: input.onOverrideModelChange,
    onRetryWithOverrideModel: input.onRetryWithOverrideModel,
    retryWithOverrideModelPending: input.retryWithOverrideModelPending,
    canRetryWithOverrideModel: Boolean(input.overrideModel?.provider && input.overrideModel.model.trim()),
    onRetryWithTaskModel: input.onRetryWithTaskModel,
    retryWithTaskModelPending: input.retryWithTaskModelPending,
    capabilities: {
      availableActions: input.actions.length > 0,
      availableFollowUps: Boolean(input.followUp),
      canAdjustRuntimePolicy: Boolean(input.runtimeSnapshot && task),
      canInspectManualEditImpact: Boolean(task),
      canRetryWithOverrideModel: Boolean(task && (task.status === "failed" || task.status === "cancelled")),
      canCancel: Boolean(task && input.canCancel),
      canArchive: Boolean(task && (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled")),
    },
    resourceProposals: input.resourceProposals,
    onOpenResourceProposalSource: input.onOpenResourceProposalSource,
    onConfirmResourceProposal: input.onConfirmResourceProposal,
    onRejectResourceProposal: input.onRejectResourceProposal,
    confirmingResourceProposalId: input.confirmingResourceProposalId,
    rejectingResourceProposalId: input.rejectingResourceProposalId,
    onOpenFullTaskCenter: input.onOpenFullTaskCenter,
  };
}

export type NovelWorkspaceTakeoverStep =
  | "basic"
  | "story_macro"
  | "world"
  | "character"
  | "outline"
  | "structured"
  | "chapter"
  | "pipeline";

export function resolveActiveTakeoverStep(activeTab: string): NovelWorkspaceTakeoverStep {
  if (
    activeTab === "story_macro"
    || activeTab === "world"
    || activeTab === "character"
    || activeTab === "outline"
    || activeTab === "structured"
    || activeTab === "chapter"
    || activeTab === "pipeline"
  ) {
    return activeTab;
  }
  return "basic";
}

export function buildNovelEditPresentationNavigation(input: {
  setActiveTab: (tab: string) => void;
  setSelectedBaseCharacterId: (id: string) => void;
  setSelectedCharacterId: (id: string) => void;
  setSelectedChapterId: (id: string) => void;
}): {
  onGoToCharacterTab: () => void;
  onGoToStructuredTab: () => void;
  onSelectedBaseCharacterChange: (id: string) => void;
  onSelectedCharacterChange: (id: string) => void;
  onSelectedChapterChange: (id: string) => void;
} {
  return {
    onGoToCharacterTab: () => input.setActiveTab("character"),
    onGoToStructuredTab: () => input.setActiveTab("structured"),
    onSelectedBaseCharacterChange: input.setSelectedBaseCharacterId,
    onSelectedCharacterChange: input.setSelectedCharacterId,
    onSelectedChapterChange: input.setSelectedChapterId,
  };
}

interface NovelEditViewShellProps extends Omit<
  NovelEditViewProps,
  | "basicTab"
  | "worldTab"
  | "storyMacroTab"
  | "outlineTab"
  | "structuredTab"
  | "chapterTab"
  | "pipelineTab"
  | "characterTab"
> {}

export function assembleNovelEditViewProps(input: {
  shell: NovelEditViewShellProps;
  tabs: {
    basic: BasicTabProps;
    world: BasicTabProps;
    storyMacro: StoryMacroTabProps;
    outline: OutlineTabViewProps;
    structured: StructuredTabViewProps;
    chapter: ChapterTabViewProps;
    pipeline: PipelineTabViewProps;
    character: CharacterTabViewProps;
  };
}): NovelEditViewProps {
  return {
    ...input.shell,
    basicTab: input.tabs.basic,
    worldTab: input.tabs.world,
    storyMacroTab: input.tabs.storyMacro,
    outlineTab: input.tabs.outline,
    structuredTab: input.tabs.structured,
    chapterTab: input.tabs.chapter,
    pipelineTab: input.tabs.pipeline,
    characterTab: input.tabs.character,
  };
}
