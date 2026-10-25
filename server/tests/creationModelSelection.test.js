const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Each scenario owns a process: import stubs and deferred callbacks cannot leak to
// other tests, and the real Prisma adapter / supplier are never loaded.
const scenarios = [
  "identity validation and missing settings",
  "interpret captures selection for prompt and foundation",
  "regenerate captures a new selection",
  "derived long form captures selection",
  "replace direction captures selection",
  "short story confirmation saves selection and foundation identity",
  "long novel confirmation hands identity to director",
  "long novel confirmation launches the new director with the captured identity",
  "production freezes identity across plan write audit repair",
  "recovery keeps saved identity",
  "retry adopts selection and preserves seed and completed content",
  "retry conflict does not schedule production",
  "legacy and malformed snapshots retain route behavior",
  "missing current selection retains route behavior",
  "selection read failures stop new actions",
  "revision preview captures its own selection",
  "revision patch freezes apply selection before asynchronous execution",
  "revision full replan freezes selection across all writers",
  "concurrent production does not duplicate model calls",
];

if (!process.env.CREATION_MODEL_TEST_SCENARIO) {
  const test = require("node:test");
  for (const name of scenarios) {
    test(name, () => {
      const child = spawnSync(process.execPath, [__filename], {
        env: { ...process.env, CREATION_MODEL_TEST_SCENARIO: name },
        encoding: "utf8",
        timeout: 15_000,
      });
      assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout);
    });
  }
} else {
  runScenario(process.env.CREATION_MODEL_TEST_SCENARIO).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function runScenario(name) {
  const clone = (value) => structuredClone(value);
  const selected = { provider: "ollama", model: "qwen3:8b" };
  const nextSelected = { provider: "openai", model: "gpt-selected-next" };
  const route = { provider: "deepseek", model: "deepseek-route" };
  const direction = {
    id: "direction-1", title: "夜航", premise: "寻找失踪者", coreExperience: "悬疑追读",
    protagonist: "调查员", centralConflict: "时间耗尽", endingPromise: "揭开真相", styleKeywords: ["紧张"],
  };
  const interpretation = {
    understanding: "在压力下寻找真相", recommendedNarrativeForm: "short_story",
    recommendedTargetWordCount: 3000, recommendedWritingPlatform: "zhihu_story",
    directions: [direction, { ...direction, id: "direction-2", title: "灯塔", premise: "寻找灯塔" }],
  };
  const plan = {
    title: direction.title, targetWordCount: 3000, endingPromise: direction.endingPromise,
    segments: [1, 2].map((order) => ({ order, targetWordCount: 1500, title: `片段${order}`, purpose: "推进", content: "" })),
  };
  const state = {
    selection: { ...selected, temperature: 1.9, maxTokens: 257 }, selectionReads: 0,
    calls: [], foundations: [], handoffs: [], scheduled: [], deferred: [], workflowCalls: [],
    task: {
      id: "task-1", lane: "creation_studio", novelId: "novel-1", status: "running",
      seedPayloadJson: JSON.stringify({ idea: "原始想法", selectedDirectionId: direction.id,
        currentIntentVersionId: "intent-1", llmSelection: selected, retained: { value: 42 } }),
      currentItemKey: "short_story_plan", checkpointType: null, cancelRequestedAt: null,
    },
    intents: [{
      id: "intent-1", workflowTaskId: "task-1", novelId: "novel-1", version: 1,
      status: "active", originalExpression: "原始想法", structuredIntentJson: JSON.stringify(interpretation),
      impactScopeJson: JSON.stringify({ selectedDirectionId: direction.id }),
    }],
    novel: { id: "novel-1", title: direction.title, narrativeForm: "short_story", targetWordCount: 3000,
      writingPlatform: "zhihu_story", writingPlatformSnapshotJson: null, styleTone: null },
    planRow: null, segments: [], confirmation: null, strategy: "local_patch",
  };
  const activeIntent = () => state.intents.filter((row) => row.status === "active").at(-1);
  const latestIntent = () => state.intents.at(-1);
  const novelWithRelations = () => clone({ ...state.novel, shortStoryPlan: state.planRow && { ...state.planRow, segments: state.segments },
    shortStorySegments: state.segments, intentVersions: activeIntent() ? [activeIntent()] : [], workflowTasks: [state.task] });
  function update(row, data) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
    }
    return clone(row);
  }
  function match(row, where) {
    return Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object") {
        if (value.in) return value.in.includes(row[key]);
        if (value.lt) return row[key] < value.lt;
        if ("not" in value) return row[key] !== value.not;
      }
      return row[key] === value;
    });
  }
  const prisma = {
    appSetting: { findUnique: async () => {
      state.selectionReads++;
      if (state.selectionError) throw state.selectionError;
      return state.selection === null ? null : { value: typeof state.selection === "string" ? state.selection : JSON.stringify(state.selection) };
    } },
    modelRouteConfig: { findUnique: async ({ where }) => ({ ...route, taskType: where.taskType,
      temperature: 0.1, maxTokens: 7000, requestProtocol: "auto", structuredResponseFormat: "auto" }) },
    novelWorkflowTask: {
      findUnique: async () => clone({ ...state.task, novel: state.novel,
        intentVersions: activeIntent() ? [activeIntent()] : [] }),
      findFirst: async () => clone(state.task),
      findMany: async () => [{ id: state.task.id }],
      updateMany: async ({ where, data }) => {
        if (state.conflict || !match(state.task, where)) return { count: 0 };
        update(state.task, data); return { count: 1 };
      },
    },
    novelIntentVersion: {
      findUnique: async ({ where }) => clone(state.intents.find((row) => row.id === where.id) ?? null),
      findUniqueOrThrow: async ({ where }) => {
        const row = state.intents.find((item) => item.id === where.id);
        assert.ok(row); return clone(row);
      },
      findFirst: async ({ where }) => clone(state.intents.filter((row) => match(row, where)).at(-1) ?? null),
      create: async ({ data }) => {
        const row = { ...clone(data), id: `intent-${state.intents.length + 1}` };
        state.intents.push(row); return clone(row);
      },
      update: async ({ where, data }) => update(state.intents.find((row) => row.id === where.id), data),
    },
    creationStudioConfirmation: {
      findUnique: async () => clone(state.confirmation),
      create: async ({ data }) => { state.confirmation = { ...data, id: "confirmation-1", status: "claimed" }; return clone(state.confirmation); },
      update: async ({ data }) => update(state.confirmation, data),
      updateMany: async ({ data }) => { if (state.confirmation) update(state.confirmation, data); return { count: 1 }; },
    },
    novel: {
      findUnique: async () => novelWithRelations(),
      create: async ({ data }) => { state.novel = { ...data, id: "novel-1" }; return clone(state.novel); },
      update: async ({ data }) => update(state.novel, data),
    },
    shortStoryPlan: {
      findUnique: async () => state.planRow ? clone({ ...state.planRow, segments: state.segments }) : null,
      create: async ({ data }) => {
        state.planRow = { ...data, id: "plan-1" };
        state.segments = data.segments.create.map((item) => ({ ...item, id: `segment-${item.order}`, planId: "plan-1",
          version: 1, content: "", status: "pending", userEditedAt: null, updatedAt: new Date() }));
        return clone({ ...state.planRow, segments: state.segments });
      },
      update: async ({ data }) => update(state.planRow, data),
    },
    shortStorySegment: {
      findMany: async () => clone(state.segments),
      updateMany: async ({ where, data }) => {
        const rows = state.segments.filter((row) => match(row, where));
        rows.forEach((row) => update(row, data)); return { count: rows.length };
      },
      update: async ({ where, data }) => update(state.segments.find((row) => row.id === where.id), data),
    },
    $transaction: async (input) => typeof input === "function" ? input(prisma) : Promise.all(input),
  };
  class Workflow {
    async bootstrapTask(input) {
      state.workflowCalls.push(["bootstrapTask", input]);
      state.task.novelId = null; state.task.status = "queued";
      state.task.seedPayloadJson = JSON.stringify(input.seedPayload);
      state.intents = [];
      return clone(state.task);
    }
    async getTaskByIdWithoutHealing() { return clone(state.task); }
    async markTaskRunning(id, input) { this.mark("markTaskRunning", input, "running"); }
    async markTaskWaitingApproval(id, input) { this.mark("markTaskWaitingApproval", input, "waiting_approval"); }
    async markTaskFailed(id, error, input) { this.mark("markTaskFailed", input, "failed"); state.failure = error; }
    async recordCheckpoint(id, input) { this.mark("recordCheckpoint", input, "succeeded"); state.task.checkpointType = input.checkpointType; state.finish?.(); }
    async attachNovelToTask(id, novelId) { state.task.novelId = novelId; }
    async retryTask() { state.workflowCalls.push(["retryTask"]); state.task.status = "queued"; }
    mark(method, input, status) {
      state.workflowCalls.push([method, clone(input)]); state.task.status = status;
      state.task.currentItemKey = input.itemKey ?? state.task.currentItemKey;
      if (input.seedPayload) state.task.seedPayloadJson = JSON.stringify({ ...JSON.parse(state.task.seedPayloadJson), ...input.seedPayload });
    }
  }
  const dist = path.resolve(__dirname, "../dist");
  const mocks = new Map();
  const stub = (file, exports) => mocks.set(path.join(dist, file), exports);
  stub("db/prisma.js", { prisma });
  stub("middleware/errorHandler.js", { AppError: class AppError extends Error {} });
  stub("services/novel/workflow/NovelWorkflowService.js", { NovelWorkflowService: Workflow });
  stub("services/novel/workflow/novelWorkflow.shared.js", {
    parseSeedPayload: (value) => { try { return JSON.parse(value); } catch { return null; } },
    resumeTargetToRoute: () => "/create",
  });
  stub("services/novel/director/NovelDirectorService.js", { NovelDirectorService: class {
    async confirmCandidate(input) { state.handoffs.push(clone(input)); return { novel: clone(state.novel), workflowTaskId: "director-task-1" }; }
  } });
  stub("services/novel/NovelCreateResourceRecommendationService.js", { novelCreateResourceRecommendationService: {
    resolveRequired: async (input) => {
      state.foundations.push(clone(input)); state.afterFoundation?.();
      return { genreId: "genre-1", primaryStoryModeId: "mode-1", recommendation: { genre: { id: "genre-1" }, primaryStoryMode: { id: "mode-1" } } };
    },
  } });
  stub("modules/novel/writing-platform/index.js", {
    supportsWritingPlatformForm: () => true,
    writingPlatformProfileService: { snapshot: async () => ({ profileVersion: 1 }) },
  });
  const asset = (id, taskType) => ({ id, taskType });
  stub("prompting/prompts/creation/creationIntent.prompts.js", {
    creationIntentInterpretPrompt: asset("creation.intent.interpret", "planner"),
    creationDirectionReplacePrompt: asset("creation.direction.replace", "planner"),
    requestedCreationDirectionCount: (input) => input.directionCount ?? 2,
  });
  stub("prompting/prompts/shortStory/shortStory.prompts.js", {
    shortStoryPlanPrompt: asset("novel.short_story.plan", "planner"),
    shortStorySegmentWritePrompt: asset("novel.short_story.segment.write", "writer"),
    shortStoryFullAuditPrompt: asset("novel.short_story.full.audit", "review"),
    shortStoryPatchRepairPrompt: asset("novel.short_story.patch.repair", "repair"),
    shortStoryRevisionImpactPrompt: asset("novel.short_story.revision.impact", "planner"),
  });
  let resolveModel;
  stub("prompting/core/promptRunner.js", { runStructuredPrompt: async (input) => {
    const effective = await resolveModel(input.asset.taskType, input.options);
    state.calls.push({ id: input.asset.id, options: clone(input.options), effective, promptInput: clone(input.promptInput) });
    await state.onPrompt?.(input);
    let output;
    switch (input.asset.id) {
      case "creation.intent.interpret":
        output = { ...interpretation, recommendedNarrativeForm: input.promptInput.preferredNarrativeForm ?? "long_novel",
          directions: Array.from({ length: input.promptInput.directionCount ?? 2 }, (_, index) => ({ ...direction, id: `direction-${index + 1}` })) }; break;
      case "creation.direction.replace": output = { ...direction, title: "新方向", premise: "新的事件" }; break;
      case "novel.short_story.plan": output = plan; break;
      case "novel.short_story.segment.write": output = { content: `生成片段${input.promptInput.segment.order}`, continuitySummary: "连续性" }; break;
      case "novel.short_story.full.audit": output = { decision: "patchable", summary: "修补", issues: [] }; break;
      case "novel.short_story.patch.repair": output = { patches: [], residualQualityDebt: [] }; break;
      case "novel.short_story.revision.impact": output = { understoodGoal: "修改结尾", revisedDirection: direction,
        recommendedTargetWordCount: 3000, affectedSegmentOrders: [2], recommendedStrategy: state.strategy,
        changesEnding: true, changesScale: false, changesCoreIntent: false, summary: "修改第二段" }; break;
      default: throw new Error(`Unexpected prompt ${input.asset.id}`);
    }
    return { output: clone(output) };
  } });
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    const filename = Module._resolveFilename(request, parent);
    if (mocks.has(filename)) return mocks.get(filename);
    return originalLoad.call(this, request, parent, ...rest);
  };
  ({ resolveModel } = require("../dist/llm/modelRouter.js"));
  const settings = require("../dist/services/settings/LLMSelectionSettingsService.js");
  const { ShortStoryProductionService, shortStoryProductionService } = require("../dist/modules/novel/short-story/application/ShortStoryProductionService.js");
  shortStoryProductionService.schedule = (id) => state.scheduled.push(id);
  const { CreationStudioService } = require("../dist/modules/novel/creation-studio/application/CreationStudioService.js");
  const { ShortStoryStudioService } = require("../dist/modules/novel/short-story/application/ShortStoryStudioService.js");
  const creation = new CreationStudioService();
  const studio = new ShortStoryStudioService();
  const production = new ShortStoryProductionService();
  const assertIdentity = (actual, expected = selected) => {
    assert.deepEqual({ provider: actual.provider, model: actual.model }, expected);
  };
  const assertCalls = (expected = selected) => {
    assert.ok(state.calls.length);
    for (const call of state.calls) {
      assertIdentity(call.effective, expected);
      assert.equal(call.effective.selectionProvenance.provider.source, expected === route ? "task_route" : "explicit_request");
      assert.equal(call.effective.selectionProvenance.model.source, expected === route ? "task_route" : "explicit_request");
    }
  };
  const pendingCreation = () => {
    state.task.novelId = null; state.task.status = "waiting_approval";
    state.intents[0].status = "proposed";
  };
  const confirmInput = (form) => ({ intentVersionId: "intent-1", directionId: direction.id,
    narrativeForm: form, targetWordCount: form === "short_story" ? 3000 : 200000,
    writingPlatform: form === "short_story" ? "zhihu_story" : "fanqie_free", idempotencyKey: "confirmation-key" });
  async function installCompletedPlan() {
    await prisma.shortStoryPlan.create({ data: { targetWordCount: 3000, structureJson: JSON.stringify(plan),
      endingPromise: direction.endingPromise, status: "completed", segments: { create: plan.segments } } });
    for (const row of state.segments) Object.assign(row, { status: "completed", content: `保留正文${row.order}` });
  }
  async function applyAndFlush() {
    global.setImmediate = (callback) => { state.deferred.push(callback); };
    const finished = new Promise((resolve) => { state.finish = resolve; });
    await studio.applyRevision(state.novel.id, latestIntent().id);
    state.selection = { provider: "anthropic", model: "switched-after-apply" };
    state.task.seedPayloadJson = JSON.stringify({ llmSelection: route });
    assert.equal(state.deferred.length, 1);
    state.deferred[0]();
    let timer;
    try {
      await Promise.race([finished, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Revision did not complete: ${state.failure ?? "unknown"}`)), 3000);
      })]);
    } finally { clearTimeout(timer); }
  }

  switch (name) {
    case "identity validation and missing settings": {
      for (const malformed of [null, [], "qwen", 123, {}, { provider: "ollama" }, { model: "qwen" },
        { provider: " ", model: "qwen" }, { provider: "ollama", model: 12 }]) {
        assert.equal(settings.parseLLMModelIdentity(malformed), null);
      }
      assert.deepEqual(settings.parseLLMModelIdentity({ provider: " custom-provider ", model: " qwen ", temperature: 1.9, maxTokens: 257 }),
        { provider: "custom-provider", model: "qwen" });
      assert.deepEqual(await settings.captureCurrentLLMModelIdentity(), selected);
      state.selection = { ...selected };
      assert.equal((await settings.getLLMSelectionSettings()).temperature, 0.7);
      for (const malformed of [null, "{", "null", "[]", "{}", JSON.stringify({ provider: "ollama" })]) {
        state.selection = malformed;
        assert.equal(await settings.captureCurrentLLMModelIdentity(), null);
      }
      break;
    }
    case "interpret captures selection for prompt and foundation":
      state.onPrompt = () => { state.selection = nextSelected; };
      await creation.interpret({ idea: "原始想法", preferredNarrativeForm: "long_novel" });
      assertCalls(); assertIdentity(state.foundations[0]); assert.equal(state.calls[0].options.temperature, 0.7);
      assert.equal(state.calls[0].options.maxTokens, undefined); assert.equal(state.selectionReads, 1); break;
    case "regenerate captures a new selection":
      pendingCreation(); state.selection = nextSelected;
      await creation.regenerate("task-1", { narrativeForm: "long_novel", targetWordCount: 200000 });
      assertCalls(nextSelected); assertIdentity(state.foundations[0], nextSelected); break;
    case "derived long form captures selection":
      await creation.createDerivedLongForm("novel-1"); assertCalls(); assertIdentity(state.foundations[0]); break;
    case "replace direction captures selection":
      pendingCreation(); await creation.replaceDirection("task-1", { intentVersionId: "intent-1", directionId: direction.id, feedback: "换一种冲突" });
      assertCalls(); assert.equal(state.calls[0].options.temperature, 0.8); break;
    case "short story confirmation saves selection and foundation identity":
      pendingCreation(); state.afterFoundation = () => { state.selection = nextSelected; };
      await creation.confirm("task-1", confirmInput("short_story"));
      assertIdentity(state.foundations[0]); assert.deepEqual(JSON.parse(state.task.seedPayloadJson).llmSelection, selected);
      assert.equal(JSON.parse(state.task.seedPayloadJson).retained.value, 42); assert.deepEqual(state.scheduled, ["task-1"]); break;
    case "long novel confirmation hands identity to director":
      pendingCreation(); state.afterFoundation = () => { state.selection = nextSelected; };
      await creation.confirm("task-1", confirmInput("long_novel"));
      assertIdentity(state.foundations[0]); assertIdentity(state.handoffs[0]); assert.equal(state.selectionReads, 1); break;
    case "long novel confirmation launches the new director with the captured identity":
      pendingCreation();
      creation.configureLongNovelLauncher(async (input, sourceTaskId) => {
        state.handoffs.push({ ...clone(input), sourceTaskId });
        state.selection = nextSelected;
        return { novel: clone(state.novel), workflowTaskId: "run-1" };
      });
      await creation.confirm("task-1", confirmInput("long_novel"));
      assertIdentity(state.handoffs[0]); assert.equal(state.handoffs[0].sourceTaskId, "task-1");
      assert.equal(state.selectionReads, 1); break;
    case "production freezes identity across plan write audit repair":
      state.onPrompt = () => { state.selection = nextSelected; state.task.seedPayloadJson = JSON.stringify({ llmSelection: nextSelected }); };
      await production.run("task-1"); assertCalls(); assert.equal(state.selectionReads, 0);
      assert.deepEqual(state.calls.map((call) => [call.id, call.options.temperature, call.options.maxTokens]), [
        ["novel.short_story.plan", 0.55, undefined], ["novel.short_story.segment.write", 0.78, 3000],
        ["novel.short_story.segment.write", 0.78, 3000], ["novel.short_story.full.audit", 0.25, 5000],
        ["novel.short_story.patch.repair", 0.45, 12000],
      ]); break;
    case "recovery keeps saved identity":
      await installCompletedPlan(); state.selection = nextSelected;
      production.schedule = (id) => state.scheduled.push(id);
      await production.recoverPending(); assert.deepEqual(state.scheduled, ["task-1"]);
      await production.run(state.scheduled[0]); assertCalls(); assert.equal(state.selectionReads, 0);
      assert.equal(state.calls.filter((call) => call.id.endsWith("segment.write")).length, 0); break;
    case "retry adopts selection and preserves seed and completed content": {
      await installCompletedPlan(); state.task.status = "failed"; state.segments[1].status = "failed";
      const seedBefore = JSON.parse(state.task.seedPayloadJson); state.selection = nextSelected;
      await studio.retryProduction("novel-1");
      assert.deepEqual(JSON.parse(state.task.seedPayloadJson), { ...seedBefore, llmSelection: nextSelected });
      assert.equal(state.segments[0].content, "保留正文1"); assert.deepEqual(state.scheduled, ["task-1"]);
      state.selection = selected; await production.run("task-1"); assertCalls(nextSelected);
      assert.equal(state.calls[0].promptInput.segment.order, 2); assert.equal(state.segments[0].content, "保留正文1"); break;
    }
    case "retry conflict does not schedule production":
      state.task.status = "failed"; state.conflict = true;
      await assert.rejects(() => studio.retryProduction("novel-1"), /生成任务已更新/);
      assert.deepEqual(state.scheduled, []); assert.ok(!state.workflowCalls.some(([method]) => method === "retryTask")); break;
    case "legacy and malformed snapshots retain route behavior":
      for (const raw of [JSON.stringify({ idea: "旧任务" }), "{", "null", "[]",
        JSON.stringify({ llmSelection: "qwen" }), JSON.stringify({ llmSelection: { provider: "ollama", model: " " } })]) {
        state.task.seedPayloadJson = raw; state.planRow = null; state.calls = []; state.segments = [];
        await production.run("task-1"); assertCalls(route);
      }
      assert.equal(state.selectionReads, 0); break;
    case "missing current selection retains route behavior":
      state.selection = null;
      await creation.interpret({ idea: "原始想法", preferredNarrativeForm: "long_novel" });
      assertCalls(route); assert.equal(state.foundations[0].provider, undefined);
      await installCompletedPlan(); state.task.novelId = "novel-1"; state.task.status = "failed";
      const seedBefore = state.task.seedPayloadJson;
      await studio.retryProduction("novel-1"); assert.equal(state.task.seedPayloadJson, seedBefore); break;
    case "selection read failures stop new actions": {
      await installCompletedPlan(); state.selectionError = new Error("selection store unavailable");
      const actions = [
        () => creation.interpret({ idea: "想法" }), () => creation.createDerivedLongForm("novel-1"),
        () => creation.regenerate("task-1", { narrativeForm: "long_novel", targetWordCount: 200000 }),
        () => creation.replaceDirection("task-1", { intentVersionId: "intent-1", directionId: direction.id }),
        () => creation.confirm("task-1", confirmInput("short_story")),
        () => studio.retryProduction("novel-1"), () => studio.previewRevision("novel-1", "修改结尾"),
        () => studio.applyRevision("novel-1", "intent-1"),
      ];
      const before = clone({ task: state.task, segments: state.segments });
      for (const action of actions) await assert.rejects(action, /selection store unavailable/);
      assert.deepEqual({ task: state.task, segments: state.segments }, before);
      assert.deepEqual(state.calls, []); assert.deepEqual(state.workflowCalls, []);
      assert.deepEqual(state.foundations, []); assert.deepEqual(state.scheduled, []); break;
    }
    case "revision preview captures its own selection":
      await installCompletedPlan(); state.selection = nextSelected;
      await studio.previewRevision("novel-1", "修改结尾"); assertCalls(nextSelected);
      assert.equal(state.calls[0].options.temperature, 0.35); assert.equal(state.calls[0].options.maxTokens, undefined); break;
    case "revision patch freezes apply selection before asynchronous execution":
    case "revision full replan freezes selection across all writers": {
      await installCompletedPlan();
      if (name.includes("full replan")) state.strategy = "full_replan";
      await studio.previewRevision("novel-1", "修改结尾"); state.calls = []; state.selection = nextSelected;
      state.onPrompt = () => { state.selection = selected; };
      await applyAndFlush(); assertCalls(nextSelected);
      assert.deepEqual(state.calls.map((call) => [call.id, call.options.temperature, call.options.maxTokens]), state.strategy === "full_replan" ? [
        ["novel.short_story.plan", 0.55, undefined], ["novel.short_story.segment.write", 0.75, 3000],
        ["novel.short_story.segment.write", 0.75, 3000],
      ] : [["novel.short_story.patch.repair", 0.5, 12000]]); break;
    }
    case "concurrent production does not duplicate model calls": {
      let release, entered;
      const gate = new Promise((resolve) => { release = resolve; });
      const started = new Promise((resolve) => { entered = resolve; });
      state.onPrompt = async (input) => { if (input.asset.id.endsWith(".plan")) { entered(); await gate; } };
      const first = production.run("task-1"); await started;
      await production.run("task-1"); release(); await first; assertCalls();
      assert.equal(state.calls.length, 5); break;
    }
    default: throw new Error(`Unknown scenario ${name}`);
  }
}
