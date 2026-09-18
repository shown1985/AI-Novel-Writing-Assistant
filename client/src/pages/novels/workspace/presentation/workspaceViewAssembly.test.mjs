import assert from "node:assert/strict";
import test from "node:test";
import { buildNovelEditPlanningTabs } from "./planningTabs.ts";
import {
  assembleNovelEditViewProps,
  buildNovelEditPresentationNavigation,
  buildNovelEditTaskDrawer,
  resolveActiveTakeoverStep,
  resolveProductionExperienceHandoff,
} from "./workspaceViewAssembly.ts";

const noop = () => {};

function createPlanningInput(overrides = {}) {
  return {
    id: "book-a",
    basicForm: { title: "Book A" },
    genreOptions: [],
    storyModeOptions: [],
    worldOptions: [],
    sourceNovelOptions: [],
    sourceKnowledgeOptions: [],
    sourceNovelBookAnalysisOptions: [],
    isLoadingSourceNovelBookAnalyses: false,
    availableBookAnalysisSections: [],
    worldSliceMessage: "",
    isLoadingNovelWorld: false,
    isImportingNovelWorld: false,
    isGeneratingNovelWorld: false,
    isCreatingManualNovelWorld: false,
    isSavingNovelWorldToLibrary: false,
    isLoadingNovelWorldSyncDiff: false,
    isSyncingNovelWorld: false,
    isRefreshingWorldSlice: false,
    isSavingWorldSliceOverrides: false,
    onBasicFormChange: noop,
    onSaveBasic: noop,
    onImportNovelWorld: noop,
    onCreateManualNovelWorld: noop,
    onGenerateNovelWorld: noop,
    onSaveNovelWorldToLibrary: noop,
    onSyncNovelWorld: noop,
    onRefreshWorldSlice: noop,
    onSaveWorldSliceOverrides: noop,
    isSavingBasic: false,
    worldInjectionSummary: null,
    hasCharacters: true,
    hasUnsavedVolumeDraft: false,
    generationNotice: "",
    readiness: {},
    volumeCountGuidance: {},
    customVolumeCountEnabled: false,
    customVolumeCountInput: "",
    onCustomVolumeCountEnabledChange: noop,
    onCustomVolumeCountInputChange: noop,
    onApplyCustomVolumeCount: noop,
    onRestoreSystemRecommendedVolumeCount: noop,
    strategyPlan: null,
    critiqueReport: null,
    isGeneratingStrategy: false,
    onGenerateStrategy: noop,
    isCritiquingStrategy: false,
    onCritiqueStrategy: noop,
    isGeneratingSkeleton: false,
    onGenerateSkeleton: noop,
    onGoToCharacterTab: noop,
    onGoToStructuredTab: noop,
    outlineText: "outline",
    structuredDraftText: "structured",
    volumes: [],
    onVolumeFieldChange: noop,
    onOpenPayoffsChange: noop,
    onAddVolume: noop,
    onRemoveVolume: noop,
    onMoveVolume: noop,
    onSaveOutline: noop,
    isSavingOutline: false,
    volumeMessage: "",
    volumeVersions: [],
    selectedVersionId: "",
    onSelectedVersionChange: noop,
    onCreateDraftVersion: noop,
    isCreatingDraftVersion: false,
    onLoadSelectedVersionToDraft: noop,
    onActivateVersion: noop,
    isActivatingVersion: false,
    onFreezeVersion: noop,
    isFreezingVersion: false,
    onLoadVersionDiff: noop,
    isLoadingVersionDiff: false,
    diffResult: null,
    onAnalyzeDraftImpact: noop,
    isAnalyzingDraftImpact: false,
    onAnalyzeVersionImpact: noop,
    isAnalyzingVersionImpact: false,
    impactResult: null,
    beatSheets: [],
    rebalanceDecisions: [],
    isGeneratingBeatSheet: false,
    onGenerateBeatSheet: noop,
    isGeneratingChapterList: false,
    generatingChapterListVolumeId: "",
    generatingChapterListBeatKey: "",
    generatingChapterListMode: null,
    onGenerateChapterList: noop,
    isGeneratingChapterDetail: false,
    isGeneratingChapterDetailBundle: false,
    generatingChapterDetailMode: "",
    generatingChapterDetailChapterId: "",
    chapterDetailFailure: undefined,
    onGenerateChapterDetail: noop,
    onGenerateChapterDetailBundle: noop,
    onRetryFailedChapterDetail: noop,
    syncPreview: {},
    syncOptions: { preserveContent: true, applyDeletes: false },
    onSyncOptionsChange: noop,
    onApplySync: noop,
    isApplyingSync: false,
    syncMessage: "",
    chapters: [],
    onChapterFieldChange: noop,
    onChapterNumberChange: noop,
    onChapterPayoffRefsChange: noop,
    onAddChapter: noop,
    onRemoveChapter: noop,
    onMoveChapter: noop,
    onApplyBatch: noop,
    onSaveStructured: noop,
    isSavingStructured: false,
    ...overrides,
  };
}

function createDrawerInput(overrides = {}) {
  return {
    open: true,
    setOpen: noop,
    taskPanelOpen: false,
    clearTaskPanelOpen: noop,
    task: { id: "director-a", status: "failed" },
    snapshot: { marker: "snapshot" },
    runtimeSnapshot: { marker: "runtime" },
    projection: { marker: "projection" },
    currentUiModel: { provider: "openai", model: "gpt-test", temperature: 0.5 },
    actions: [],
    onProjectionAction: noop,
    followUp: null,
    onFollowUpAction: noop,
    executingFollowUpAction: false,
    runtimeHardBlocked: false,
    runtimeBlockedReason: null,
    overrideModel: { provider: "openai", model: "gpt-override", temperature: 0.4 },
    onOverrideModelChange: noop,
    onRetryWithOverrideModel: noop,
    retryWithOverrideModelPending: false,
    onRetryWithTaskModel: noop,
    retryWithTaskModelPending: false,
    canCancel: false,
    resourceProposals: [],
    onOpenResourceProposalSource: noop,
    onConfirmResourceProposal: noop,
    onRejectResourceProposal: noop,
    confirmingResourceProposalId: "",
    rejectingResourceProposalId: "",
    onOpenFullTaskCenter: noop,
    ...overrides,
  };
}

test("active workspace tabs keep their existing takeover stage identity", () => {
  const expected = new Map([
    ["basic", "basic"],
    ["world", "world"],
    ["story_macro", "story_macro"],
    ["character", "character"],
    ["outline", "outline"],
    ["structured", "structured"],
    ["chapter", "chapter"],
    ["pipeline", "pipeline"],
    ["history", "basic"],
    ["unknown", "basic"],
  ]);

  for (const [activeTab, takeoverStep] of expected) {
    assert.equal(resolveActiveTakeoverStep(activeTab), takeoverStep, activeTab);
  }
});

test("planning assembly keeps manual saves and system generation on their original tabs", () => {
  const invoked = [];
  const onSaveBasic = () => invoked.push("manual-basic-save");
  const onSaveOutline = () => invoked.push("manual-outline-save");
  const onSaveStructured = () => invoked.push("manual-structured-save");
  const onGenerateStrategy = () => invoked.push("system-generate-strategy");
  const onGenerateChapterList = () => invoked.push("system-generate-chapter-list");
  const result = buildNovelEditPlanningTabs(createPlanningInput({
    onSaveBasic,
    onSaveOutline,
    onSaveStructured,
    onGenerateStrategy,
    onGenerateChapterList,
  }));

  assert.equal(result.basicTab.novelId, "book-a");
  assert.equal(result.basicTab.onSave, onSaveBasic);
  assert.equal(result.outlineTab.onSave, onSaveOutline);
  assert.equal(result.outlineTab.onGenerateStrategy, onGenerateStrategy);
  assert.equal(result.structuredTab.onSave, onSaveStructured);
  assert.equal(result.structuredTab.onGenerateChapterList, onGenerateChapterList);
  assert.deepEqual(invoked, []);

  result.basicTab.onSave();
  result.outlineTab.onGenerateStrategy();
  result.structuredTab.onSave();
  result.structuredTab.onGenerateChapterList("volume-a", {
    generationMode: "single_beat",
    targetBeatKey: "all",
  });
  assert.deepEqual(invoked, [
    "manual-basic-save",
    "system-generate-strategy",
    "manual-structured-save",
    "system-generate-chapter-list",
  ]);
});

test("task drawer assembly preserves system and manual actions without eager commands", () => {
  const invoked = [];
  const systemContinue = () => invoked.push(["system-continue"]);
  const manualConfirm = (proposalId) => invoked.push(["manual-confirm", proposalId]);
  const projectionAction = (action) => invoked.push(["projection", action]);
  const taskDrawer = buildNovelEditTaskDrawer(createDrawerInput({
    actions: [{ label: "继续", onClick: systemContinue }],
    onConfirmResourceProposal: manualConfirm,
    onProjectionAction: projectionAction,
    followUp: { marker: "follow-up" },
    canCancel: true,
  }));

  assert.deepEqual(invoked, []);
  assert.equal(taskDrawer.actions[0].onClick, systemContinue);
  assert.equal(taskDrawer.onConfirmResourceProposal, manualConfirm);
  assert.equal(taskDrawer.onProjectionAction, projectionAction);
  assert.deepEqual(taskDrawer.projection, { marker: "projection" });
  assert.deepEqual(taskDrawer.capabilities, {
    availableActions: true,
    availableFollowUps: true,
    canAdjustRuntimePolicy: true,
    canInspectManualEditImpact: true,
    canRetryWithOverrideModel: true,
    canCancel: true,
    canArchive: true,
  });

  const projectedAction = {
    type: "continue",
    label: "继续",
    target: { novelId: "book-a", taskId: "director-a" },
  };
  taskDrawer.actions[0].onClick();
  taskDrawer.onConfirmResourceProposal("proposal-a");
  taskDrawer.onProjectionAction(projectedAction);
  assert.deepEqual(invoked, [
    ["system-continue"],
    ["manual-confirm", "proposal-a"],
    ["projection", projectedAction],
  ]);
});

test("task drawer close and cancelled projection retain their original semantics", () => {
  const invoked = [];
  const taskDrawer = buildNovelEditTaskDrawer(createDrawerInput({
    setOpen: (open) => invoked.push(["open", open]),
    taskPanelOpen: true,
    clearTaskPanelOpen: () => invoked.push(["clear-task-panel"]),
    task: { id: "director-cancelled", status: "cancelled" },
    projection: { marker: "stale-projection" },
  }));

  assert.equal(taskDrawer.projection, null);
  taskDrawer.onOpenChange(false);
  assert.deepEqual(invoked, [["open", false], ["clear-task-panel"]]);
});

test("production handoff is selected only for the required checkpoint", () => {
  assert.deepEqual(resolveProductionExperienceHandoff({
    task: { id: "director-handoff", status: "waiting_approval", checkpointType: "production_experience_required" },
    novelId: "book-a",
    novelTitle: "Book A",
  }), {
    taskId: "director-handoff",
    novelId: "book-a",
    novelTitle: "Book A",
  });
  assert.equal(resolveProductionExperienceHandoff({
    task: { id: "director-running", status: "running", checkpointType: "chapter_batch" },
    novelId: "book-a",
    novelTitle: "Book A",
  }), null);
  assert.equal(resolveProductionExperienceHandoff({
    task: null,
    novelId: "book-a",
    novelTitle: "Book A",
  }), null);
});

test("final view assembly maps the actual planning tabs, shell, and task drawer", () => {
  const manualSave = () => {};
  const systemContinue = () => {};
  const planningTabs = buildNovelEditPlanningTabs(createPlanningInput({ onSaveBasic: manualSave }));
  const taskDrawer = buildNovelEditTaskDrawer(createDrawerInput({
    actions: [{ label: "继续", onClick: systemContinue }],
  }));
  const chapterTab = { marker: "chapter" };
  const pipelineTab = { marker: "pipeline" };
  const characterTab = { marker: "character" };
  const storyMacroTab = { marker: "story-macro" };
  const result = assembleNovelEditViewProps({
    shell: {
      id: "book-a",
      activeTab: "chapter",
      workflowCurrentTab: "structured",
      onActiveTabChange: noop,
      exportControls: { marker: "export" },
      takeover: { marker: "takeover" },
      taskDrawer,
      singleBookDisplay: { marker: "single-book-display" },
    },
    tabs: {
      basic: planningTabs.basicTab,
      world: planningTabs.basicTab,
      storyMacro: storyMacroTab,
      outline: planningTabs.outlineTab,
      structured: planningTabs.structuredTab,
      chapter: chapterTab,
      pipeline: pipelineTab,
      character: characterTab,
    },
  });

  assert.equal(result.id, "book-a");
  assert.equal(result.activeTab, "chapter");
  assert.equal(result.workflowCurrentTab, "structured");
  assert.equal(result.basicTab.onSave, manualSave);
  assert.equal(result.worldTab, planningTabs.basicTab);
  assert.equal(result.outlineTab, planningTabs.outlineTab);
  assert.equal(result.structuredTab, planningTabs.structuredTab);
  assert.equal(result.storyMacroTab, storyMacroTab);
  assert.equal(result.chapterTab, chapterTab);
  assert.equal(result.pipelineTab, pipelineTab);
  assert.equal(result.characterTab, characterTab);
  assert.equal(result.taskDrawer, taskDrawer);
  assert.equal(result.singleBookDisplay.marker, "single-book-display");
  assert.equal(result.taskDrawer.actions[0].onClick, systemContinue);
});

test("presentation navigation keeps chapter, character, and base-character selections separate", () => {
  const calls = [];
  const navigation = buildNovelEditPresentationNavigation({
    setActiveTab: (value) => calls.push(["tab", value]),
    setSelectedBaseCharacterId: (value) => calls.push(["base-character", value]),
    setSelectedCharacterId: (value) => calls.push(["character", value]),
    setSelectedChapterId: (value) => calls.push(["chapter", value]),
  });

  navigation.onGoToCharacterTab();
  navigation.onGoToStructuredTab();
  navigation.onSelectedBaseCharacterChange("base-a");
  navigation.onSelectedCharacterChange("character-a");
  navigation.onSelectedChapterChange("chapter-a");

  assert.deepEqual(calls, [
    ["tab", "character"],
    ["tab", "structured"],
    ["base-character", "base-a"],
    ["character", "character-a"],
    ["chapter", "chapter-a"],
  ]);
});
