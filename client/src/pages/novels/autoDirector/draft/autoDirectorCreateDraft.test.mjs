import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutoDirectorCreateDraftScope,
  clearAutoDirectorCreateDraft,
  loadAutoDirectorCreateDraft,
  resolveInitialWorldId,
  saveAutoDirectorCreateDraft,
} from "./autoDirectorCreateDraft.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const basicForm = {
  title: "测试小说",
  description: "",
  worldId: "",
};

test("creation draft restores the pre-task idea and last safe stage", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({});

  assert.equal(saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "一个普通人发现城市每天都会重置。",
    basicForm,
    activeStage: "world_style",
    completedStages: ["idea", "basic"],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "style-1",
  }), true);

  assert.deepEqual(loadAutoDirectorCreateDraft(storage, scopeKey), {
    version: 1,
    scopeKey,
    idea: "一个普通人发现城市每天都会重置。",
    basicForm,
    activeStage: "world_style",
    completedStages: ["idea", "basic"],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "style-1",
    savedAt: loadAutoDirectorCreateDraft(storage, scopeKey)?.savedAt,
  });
});

test("world sources isolate drafts while the plain legacy key remains stable", () => {
  const storage = createMemoryStorage();
  const plainScope = buildAutoDirectorCreateDraftScope({});
  const worldA = buildAutoDirectorCreateDraftScope({ sourceWorldId: "world-A" });
  const worldB = buildAutoDirectorCreateDraftScope({ sourceWorldId: "world-B" });
  assert.equal(plainScope, "none|none|none|none|none");
  assert.notEqual(worldA, worldB);
  saveAutoDirectorCreateDraft(storage, worldA, {
    idea: "世界 A 的想法",
    basicForm: { ...basicForm, worldId: "" },
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "",
  });
  assert.equal(loadAutoDirectorCreateDraft(storage, worldB), null);
  assert.equal(loadAutoDirectorCreateDraft(storage, plainScope), null);
  assert.equal(loadAutoDirectorCreateDraft(storage, worldA)?.basicForm.worldId, "");
});

test("task and scoped draft choices outrank the source query, including a cleared world", () => {
  assert.equal(resolveInitialWorldId("world-A", undefined, false, false), "world-A");
  assert.equal(resolveInitialWorldId("world-A", "", true, false), "");
  assert.equal(resolveInitialWorldId("world-A", "world-B", true, false), "world-B");
  assert.equal(resolveInitialWorldId("world-A", undefined, false, true), "");
});

test("candidate stage falls back to the last pre-task stage", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({ marketBriefId: "brief-1" });

  saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "测试",
    basicForm,
    activeStage: "candidates",
    completedStages: ["idea", "basic", "world_style", "model_run", "candidates"],
    runMode: "auto_to_ready",
    worldSetupMode: "skip",
    selectedStyleProfileId: "",
  });

  const draft = loadAutoDirectorCreateDraft(storage, scopeKey);
  assert.equal(draft?.activeStage, "model_run");
  assert.deepEqual(draft?.completedStages, ["idea", "basic", "world_style", "model_run"]);
});

test("drafts are isolated by creation source and cleared after task creation", () => {
  const storage = createMemoryStorage();
  const plainScope = buildAutoDirectorCreateDraftScope({});
  const marketScope = buildAutoDirectorCreateDraftScope({ marketBriefId: "brief-1" });

  saveAutoDirectorCreateDraft(storage, plainScope, {
    idea: "普通开书",
    basicForm,
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "",
  });

  assert.equal(loadAutoDirectorCreateDraft(storage, marketScope), null);
  assert.equal(clearAutoDirectorCreateDraft(storage, plainScope), true);
  assert.equal(loadAutoDirectorCreateDraft(storage, plainScope), null);
});

test("invalid or unavailable storage never breaks the creation page", () => {
  const brokenStorage = {
    getItem: () => "{bad json",
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  const scopeKey = buildAutoDirectorCreateDraftScope({});

  assert.equal(loadAutoDirectorCreateDraft(brokenStorage, scopeKey), null);
  assert.equal(saveAutoDirectorCreateDraft(brokenStorage, scopeKey, {
    idea: "测试",
    basicForm,
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "",
  }), false);
  assert.equal(clearAutoDirectorCreateDraft(brokenStorage, scopeKey), false);
});

test("carryover adoption and selected world both survive a creation draft round trip", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({ sourceWorldId: "world-A", referenceBookAnalysisId: "analysis-1" });
  const contract = {
    schemaVersion: 1,
    mode: "adaptation",
    bookAnalysisId: "analysis-1",
    documentId: "document-1",
    documentVersionId: "version-1",
    documentVersionNumber: 1,
    usedSectionKeys: ["plot_structure"],
    generatedAt: "2026-10-03T00:00:00Z",
    adopted: true,
    sourceTraits: ["冲突逐步升级"],
    bookRealization: ["保留节奏，重建人物与世界"],
    openingChapters: [1, 2, 3].map((chapterNumber) => ({ chapterNumber, direction: `开篇方向 ${chapterNumber}` })),
    basis: [{ sectionKey: "plot_structure", fieldKeys: [], summary: "来自结构分析" }],
    adaptationFocus: { hooks: ["悬念"], conflictLoops: ["选择与代价"], payoffRhythm: ["阶段回报"], conversionPlan: "采用新角色与新事件" },
  };
  saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "用户编辑的想法",
    basicForm: { ...basicForm, worldId: "world-B" },
    activeStage: "world_style",
    completedStages: ["idea", "basic"],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "style-1",
    creativeCarryoverContract: contract,
  });
  const draft = loadAutoDirectorCreateDraft(storage, scopeKey);
  assert.deepEqual(draft.creativeCarryoverContract, contract);
  assert.equal(draft.basicForm.worldId, "world-B");
  assert.equal(draft.idea, "用户编辑的想法");
  assert.equal(draft.selectedStyleProfileId, "style-1");
});

test("malformed optional carryover data does not discard the user's draft", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({});
  saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "保留用户内容",
    basicForm,
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "skip",
    selectedStyleProfileId: "",
    creativeCarryoverContract: { adopted: true },
  });
  const draft = loadAutoDirectorCreateDraft(storage, scopeKey);
  assert.equal(draft.idea, "保留用户内容");
  assert.equal(draft.creativeCarryoverContract, null);
});
