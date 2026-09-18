import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSingleBookDisplayModel,
  resolveSingleBookFactFreshness,
} from "./singleBookDisplayModel.ts";

function action(overrides = {}) {
  return {
    type: "continue",
    label: "继续当前任务",
    target: { novelId: "novel-a", taskId: "task-a" },
    commandPayload: { taskId: "task-a", continuationMode: "resume" },
    ...overrides,
  };
}

function projection(overrides = {}) {
  return {
    novelId: "novel-a",
    focusNovel: { id: "novel-a", title: "A", href: "/novels/novel-a/edit" },
    latestTask: {
      id: "task-a",
      title: "task",
      status: "running",
      progress: 40,
      pendingManualRecovery: false,
      updatedAt: "2026-09-18T00:00:00.000Z",
    },
    status: "running",
    displayState: "processing",
    headline: "running",
    userHeadline: "running",
    requiresUserAction: false,
    primaryAction: action(),
    secondaryActions: [action({ type: "retry", label: "另一个动作" })],
    artifactSummary: {
      activeCount: 0,
      staleCount: 0,
      protectedUserContentCount: 0,
      repairTicketCount: 0,
    },
    activeCommandCount: 0,
    pendingCommandCount: 0,
    autoApprovalRecordCount: 0,
    ...overrides,
  };
}

function taskDetail(overrides = {}) {
  return {
    id: "task-a",
    kind: "novel_workflow",
    title: "task",
    status: "running",
    progress: 40,
    attemptCount: 0,
    maxAttempts: 1,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ownerId: "novel-a",
    ownerLabel: "A",
    sourceRoute: "/novels/novel-a/edit",
    sourceResource: { type: "novel", id: "novel-a" },
    retryCountLabel: "0/1",
    meta: {},
    steps: [],
    ...overrides,
  };
}

function runtime(overrides = {}) {
  return {
    runId: "run-a",
    novelId: "novel-a",
    status: "running",
    requiresUserAction: false,
    scopeSummary: "第 9—12 章",
    progressSummary: "本轮正在写第 9—12 章",
    policyMode: "auto_safe_scope",
    updatedAt: "2026-09-18T00:00:00.000Z",
    recentEvents: [],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    task: { id: "task-a", novelId: "novel-a", status: "running" },
    run: { id: "run-a", novelId: "novel-a" },
    activeStep: null,
    latestCommand: null,
    runtime: null,
    projection: runtime(),
    recentEvents: [],
    artifacts: [],
    displayState: {
      mode: "running",
      stageKey: "chapter_execution",
      stageLabel: "章节生产",
      headline: "running",
      detail: "running",
      progressPercent: 40,
      stepIndex: 1,
      totalSteps: 2,
      steps: [],
      riskBadges: [],
    },
    dashboardView: {
      mode: "running",
      title: "running",
      summary: "running",
      primaryAction: { action: "repair_scope", reason: "另一个动作", riskLevel: "low" },
      secondaryActions: [],
      stageKey: "chapter_execution",
      stageLabel: "章节生产",
      stepIndex: 1,
      totalSteps: 2,
      steps: [],
      diagnostics: [],
      sourceTrace: { taskId: "task-a", runId: "run-a", generatedAt: "2026-09-18T00:00:00.000Z" },
    },
    nextActions: ["dashboard-action"],
    ...overrides,
  };
}

function input(overrides = {}) {
  const directorRuntime = overrides.runtimeProjection ?? runtime();
  return {
    novelId: "novel-a",
    resolvedDirectorTaskId: "task-a",
    novel: { id: "novel-a", estimatedChapterCount: 80 },
    savedChapters: Array.from({ length: 8 }, (_, index) => ({
      novelId: "novel-a",
      content: `chapter-${index + 1}`,
    })),
    bookAutomationProjection: projection(),
    directorTask: taskDetail(),
    directorSnapshot: snapshot({ projection: directorRuntime }),
    runtimeProjection: directorRuntime,
    chapterQualityDebt: [],
    qualityPauseForManual: false,
    freshness: {
      novel: "fresh",
      savedChapters: "fresh",
      bookProjection: "fresh",
      directorTask: "fresh",
      snapshot: "fresh",
      runtime: "fresh",
    },
    ...overrides,
  };
}

test("local task success stays separate from saved chapters and the whole-book target", () => {
  const model = buildSingleBookDisplayModel(input({
    bookAutomationProjection: projection({ status: "completed" }),
    directorTask: taskDetail({ status: "succeeded", progress: 100 }),
    directorSnapshot: snapshot({
      task: { id: "task-a", novelId: "novel-a", status: "succeeded" },
      projection: runtime({ status: "completed", progressSummary: "本轮 8 章已完成" }),
    }),
    runtimeProjection: runtime({ status: "completed", progressSummary: "本轮 8 章已完成" }),
  }));

  assert.equal(model.savedProgress.value, 8);
  assert.equal(model.bookTarget.value, 80);
  assert.match(model.taskProgress.label, /本轮/);
  assert.equal(model.severity.kind, "task_completed");
  assert.doesNotMatch(model.severity.title, /整本书已完成/);
});

test("running scope never replaces the whole-book target", () => {
  const model = buildSingleBookDisplayModel(input());
  assert.equal(model.taskProgress.label, "本轮正在写第 9—12 章");
  assert.equal(model.bookTarget.label, "全书目标 80 章");
  assert.equal(model.severity.kind, "in_progress");
});

test("continuable local quality debt remains visible without becoming a global failure", () => {
  const debt = { source: "pipeline_review", evaluatedAt: null, repairAttemptsUsed: 1, repairAttemptsAllowed: 1, reason: "节奏待优化", issueCodes: ["pace"] };
  const model = buildSingleBookDisplayModel(input({
    bookAutomationProjection: projection({ status: "completed" }),
    directorTask: taskDetail({ status: "succeeded" }),
    runtimeProjection: runtime({ status: "completed", qualityDebtSummary: { deferredChapterCount: 1, deferredChapterOrders: [8] } }),
    directorSnapshot: snapshot({ projection: runtime({ status: "completed", qualityDebtSummary: { deferredChapterCount: 1, deferredChapterOrders: [8] } }) }),
    chapterQualityDebt: [debt],
  }));
  assert.equal(model.qualityDebtCount, 1);
  assert.equal(model.severity.kind, "quality_debt");
  assert.doesNotMatch(model.severity.title, /失败/);

  const runningModel = buildSingleBookDisplayModel(input({
    chapterQualityDebt: [debt],
  }));
  assert.equal(runningModel.qualityDebtCount, 1);
  assert.equal(runningModel.severity.kind, "in_progress");
});

test("replan_required overrides ordinary completed state", () => {
  const model = buildSingleBookDisplayModel(input({
    bookAutomationProjection: projection({
      status: "completed",
      latestTask: { ...projection().latestTask, status: "succeeded", checkpointType: "replan_required" },
    }),
    directorTask: taskDetail({ status: "succeeded" }),
    runtimeProjection: runtime({ status: "completed" }),
    directorSnapshot: snapshot({ projection: runtime({ status: "completed" }) }),
  }));
  assert.equal(model.severity.kind, "replan_required");
  assert.equal(model.severity.tone, "danger");
});

test("quality-first manual pause remains paused even when an old task says running", () => {
  const model = buildSingleBookDisplayModel(input({
    qualityPauseForManual: true,
    bookAutomationProjection: projection({ status: "waiting_recovery" }),
    directorTask: taskDetail({ status: "running", pendingManualRecovery: true }),
  }));
  assert.equal(model.severity.kind, "quality_pause");
  assert.match(model.severity.description, /明确恢复/);
});

test("a projected failed task without a URL is accepted only after full identity verification", () => {
  const model = buildSingleBookDisplayModel(input({
    resolvedDirectorTaskId: "task-a",
    bookAutomationProjection: projection({ status: "failed" }),
    directorTask: taskDetail({ status: "failed" }),
    runtimeProjection: runtime({ status: "failed" }),
    directorSnapshot: snapshot({ projection: runtime({ status: "failed" }) }),
  }));
  assert.equal(model.identity.status, "verified");
  assert.equal(model.primaryAction?.label, "继续当前任务");
  assert.equal(model.severity.kind, "blocked");
});

test("cross-book task or snapshot identity yields no executable action", () => {
  const model = buildSingleBookDisplayModel(input({
    directorSnapshot: snapshot({ task: { id: "task-a", novelId: "novel-b", status: "running" } }),
  }));
  assert.equal(model.identity.status, "mismatch");
  assert.equal(model.primaryAction, null);
  assert.equal(model.taskProgress.label, "当前任务身份不匹配");
});

test("saved progress counts only persisted content from the current book", () => {
  const model = buildSingleBookDisplayModel(input({
    savedChapters: [
      { novelId: "novel-a", content: "saved" },
      { novelId: "novel-a", content: "   " },
      { novelId: "novel-b", content: "other book" },
    ],
  }));
  assert.equal(model.savedProgress.value, 1);
});

test("stale and error facts preserve saved content but suppress actions", () => {
  for (const state of ["stale", "error"]) {
    const model = buildSingleBookDisplayModel(input({
      freshness: {
        novel: state,
        savedChapters: state,
        bookProjection: state,
        directorTask: "fresh",
        snapshot: "fresh",
        runtime: state,
      },
    }));
    assert.equal(model.savedProgress.value, 8);
    assert.equal(model.bookTarget.value, 80);
    assert.equal(model.primaryAction, null);
  }
});

test("every uncertain action-basis state suppresses the primary action", () => {
  for (const field of ["bookProjection", "directorTask", "snapshot"]) {
    for (const state of ["loading", "stale", "error", "empty"]) {
      const model = buildSingleBookDisplayModel(input({
        freshness: {
          ...input().freshness,
          [field]: state,
        },
      }));
      assert.equal(model.primaryAction, null, `${field}:${state}`);
    }
  }
});

test("empty task and invalid target stay unknown instead of using local range defaults", () => {
  const model = buildSingleBookDisplayModel(input({
    resolvedDirectorTaskId: null,
    novel: { id: "novel-a", estimatedChapterCount: 0 },
    savedChapters: [],
    bookAutomationProjection: projection({ latestTask: null, primaryAction: action({ type: "open_novel" }) }),
    directorTask: null,
    directorSnapshot: null,
    runtimeProjection: null,
    freshness: {
      novel: "fresh",
      savedChapters: "fresh",
      bookProjection: "fresh",
      directorTask: "empty",
      snapshot: "empty",
      runtime: "empty",
    },
  }));
  assert.equal(model.savedProgress.value, 0);
  assert.equal(model.bookTarget.value, null);
  assert.equal(model.bookTarget.label, "整书目标未知");
  assert.equal(model.primaryAction, null);
});

test("workspace task metadata cannot replace a missing director task identity", () => {
  const model = buildSingleBookDisplayModel(input({
    resolvedDirectorTaskId: null,
    workspaceTaskId: "task-a",
  }));
  assert.equal(model.identity.status, "missing");
  assert.equal(model.primaryAction, null);
});

test("only the book projection primary action survives and task IDs must agree", () => {
  const valid = buildSingleBookDisplayModel(input());
  assert.equal(valid.primaryAction?.label, "继续当前任务");
  assert.equal(valid.primaryAction?.label, projection().primaryAction.label);

  const mismatched = buildSingleBookDisplayModel(input({
    bookAutomationProjection: projection({
      primaryAction: action({ commandPayload: { taskId: "task-b", continuationMode: "resume" } }),
    }),
  }));
  assert.equal(mismatched.primaryAction, null);
});

test("query freshness distinguishes loading, stale, error, empty and fresh", () => {
  assert.equal(resolveSingleBookFactFreshness({ enabled: true, hasValue: false, isError: false, isFetching: true, isPending: true, isSuccess: false }), "loading");
  assert.equal(resolveSingleBookFactFreshness({ enabled: true, hasValue: true, isError: false, isFetching: true, isPending: false, isSuccess: true }), "stale");
  assert.equal(resolveSingleBookFactFreshness({ enabled: true, hasValue: true, isError: true, isFetching: false, isPending: false, isSuccess: false }), "error");
  assert.equal(resolveSingleBookFactFreshness({ enabled: true, hasValue: false, isError: false, isFetching: false, isPending: false, isSuccess: true }), "empty");
  assert.equal(resolveSingleBookFactFreshness({ enabled: true, hasValue: true, isError: false, isFetching: false, isPending: false, isSuccess: true }), "fresh");
  assert.equal(resolveSingleBookFactFreshness({ enabled: false, hasValue: false, isError: false, isFetching: false, isPending: false, isSuccess: false }), "empty");
});
