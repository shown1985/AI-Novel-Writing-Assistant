import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentBookRequest,
  nextBookRequestScope,
  preservePendingManualRecovery,
  resolveRequestedDirectorTaskId,
  resolveWorkspaceActivation,
} from "./workspaceSessionPolicy.ts";

test("workspace activation enables only resources owned by the active tab", () => {
  const enabledKeysByTab = new Map([
    ["basic", ["loadWorldSlice"]],
    ["world", ["loadWorldSlice"]],
    ["story_macro", ["loadStoryMacro"]],
    ["outline", ["loadVolumeWorkspace"]],
    ["structured", ["loadPayoffLedger", "loadVolumeWorkspace"]],
    ["character", ["loadCharacterResources"]],
    ["chapter", [
      "loadCharacterResources",
      "loadChapterContext",
      "loadChapterTimeline",
      "loadLatestState",
      "loadPayoffLedger",
    ]],
    ["pipeline", [
      "loadCharacterResources",
      "loadLatestState",
      "loadPayoffLedger",
      "loadQualityReport",
    ]],
  ]);
  for (const [activeTab, expectedKeys] of enabledKeysByTab) {
    const activation = resolveWorkspaceActivation({
      activeTab,
      novelId: "book-a",
      selectedChapterId: "chapter-a",
    });
    const actualKeys = Object.entries(activation.queries)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .sort();
    assert.deepEqual(actualKeys, [...expectedKeys].sort(), activeTab);
  }

  const chapterWithoutSelection = resolveWorkspaceActivation({
    activeTab: "chapter",
    novelId: "book-a",
    selectedChapterId: "",
  });
  assert.equal(chapterWithoutSelection.queries.loadChapterContext, false);
  assert.equal(chapterWithoutSelection.queries.loadChapterTimeline, false);
});

test("workspace activation starts no production or recovery command", () => {
  const activation = resolveWorkspaceActivation({
    activeTab: "pipeline",
    novelId: "book-a",
    selectedChapterId: "chapter-a",
  });
  assert.equal(activation.startupCommand, null);
});

test("missing book identity disables every scoped query", () => {
  const activation = resolveWorkspaceActivation({
    activeTab: "chapter",
    novelId: "",
    selectedChapterId: "chapter-a",
  });
  assert.equal(Object.values(activation.queries).some(Boolean), false);
});

test("late mutation completion cannot cross book or A-B-A epochs", () => {
  const bookAFirst = nextBookRequestScope(null, "book-a");
  const bookB = nextBookRequestScope(bookAFirst, "book-b");
  const bookASecond = nextBookRequestScope(bookB, "book-a");
  assert.equal(isCurrentBookRequest(bookAFirst, bookB), false);
  assert.equal(isCurrentBookRequest(bookAFirst, bookASecond), false);
  assert.equal(isCurrentBookRequest(bookASecond, bookASecond), true);
  bookASecond.mounted = false;
  assert.equal(isCurrentBookRequest(bookASecond, bookASecond), false);
});

test("director task identity never falls back to a workspace task", () => {
  assert.equal(resolveRequestedDirectorTaskId({
    activeDirectorTaskId: "director-live",
    autofocusProjectedTask: true,
    directorTaskId: "director-url",
    projectedTaskId: "director-projected",
  }), "director-url");
  assert.equal(resolveRequestedDirectorTaskId({
    activeDirectorTaskId: "director-live",
    autofocusProjectedTask: true,
    projectedTaskId: "director-projected",
  }), "director-live");
  assert.equal(resolveRequestedDirectorTaskId({
    autofocusProjectedTask: false,
    projectedTaskId: "director-projected",
  }), "");
});

test("manual recovery remains pending through polling projections", () => {
  assert.equal(preservePendingManualRecovery({
    projectionStatus: "waiting_recovery",
    taskPendingManualRecovery: false,
  }), true);
  assert.equal(preservePendingManualRecovery({
    projectionStatus: "running",
    taskPendingManualRecovery: true,
  }), true);
  assert.equal(preservePendingManualRecovery({
    projectionStatus: "running",
    taskPendingManualRecovery: false,
  }), false);
});
