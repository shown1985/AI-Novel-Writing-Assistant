const test = require("node:test");
const assert = require("node:assert/strict");

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const {
  worldSkeletonGenerationPrompt,
  worldSkeletonPresentationPrompt,
} = require("../dist/prompting/prompts/world/worldDraft.prompts.js");
const {
  buildWorldSkeletonPromptContext,
  buildWorldSkeletonPresentationPromptContext,
  generateWorldSkeleton,
} = require("../dist/services/world/worldSkeletonGeneration.js");
const { buildStructureSectionInstructions } = require("../dist/services/world/worldServiceShared.js");
const { createEmptyWorldStructure } = require("../dist/services/world/worldStructure.js");

test("location stage instructions include every field required by map validation", () => {
  const instructions = buildStructureSectionInstructions("locations");
  for (const field of ["x", "y", "directionHint", "terrain", "narrativeFunction", "risk", "riskLevel", "entryConstraint", "exitCost"]) {
    assert.match(instructions, new RegExp(`\\\"${field}\\\"`));
  }
});

test("presentation context and prompt expose only concrete force and location ids", () => {
  const structure = buildStageFixture();
  const context = buildWorldSkeletonPresentationPromptContext(structure);
  assert.deepEqual(context.factions, undefined);
  assert.deepEqual(context.relations, undefined);
  assert.deepEqual(context.forces.map((item) => item.id), ["force-1", "force-2", "force-3", "force-4", "force-5"]);
  assert.deepEqual(context.locations.map((item) => item.id), ["location-1", "location-2", "location-3", "location-4", "location-5", "location-6"]);
  const messages = worldSkeletonPresentationPrompt.render({
    idea: "超光速粒子构成知识垄断社会。",
    worldType: "科幻",
    template: "知识垄断与神话复现",
    storyEntryCount: 3,
    currentStructure: context,
    currentBindingSupport: {
      recommendedEntryPoints: [],
      highPressureForces: [],
      suggestedLocationClusters: [],
      compatibleConflicts: [],
      forbiddenCombinations: [],
    },
  });
  const humanPrompt = String(messages[1].content);
  assert.match(humanPrompt, /可用势力 id（involvedForceIds 只能从这里选择）：force-1, force-2, force-3, force-4, force-5/);
  assert.doesNotMatch(humanPrompt, /faction-1/);
});

function buildStageFixture() {
  const factions = Array.from({ length: 3 }, (_, index) => ({
    id: `faction-${index + 1}`,
    name: `阵营${index + 1}`,
    position: `立场${index + 1}`,
    doctrine: `原则${index + 1}`,
    goals: [`目标${index + 1}`],
    methods: [`方法${index + 1}`],
    representativeForceIds: [`force-${index + 1}`],
  }));
  const forces = Array.from({ length: 5 }, (_, index) => ({
    id: `force-${index + 1}`,
    name: `组织${index + 1}`,
    type: "科技组织",
    factionId: `faction-${Math.min(index + 1, 3)}`,
    role: "行动主体",
    resources: [`资源${index + 1}`],
    controlledLocationIds: [],
    summary: `组织${index + 1}负责具体行动`,
    baseOfPower: `基地${index + 1}`,
    currentObjective: `目标${index + 1}`,
    pressure: `压力${index + 1}`,
    leader: `负责人${index + 1}`,
    narrativeRole: "冲突参与者",
  }));
  const locations = Array.from({ length: 6 }, (_, index) => ({
    id: `location-${index + 1}`,
    name: `地点${index + 1}`,
    type: "区域",
    region: "主区域",
    x: 10 + index * 14,
    y: 20 + index * 10,
    directionHint: index === 0 ? "north" : "east",
    terrain: "城市",
    summary: `地点${index + 1}承载关键行动`,
    narrativeFunction: "揭示线索",
    risk: "组织监控",
    riskLevel: 3,
    storyRelevance: "开局相关",
    entryConstraint: "需要身份凭证",
    exitCost: "留下行动痕迹",
    controllingForceIds: [`force-${(index % 5) + 1}`],
  }));
  return {
    profile: {
      summary: "超光速粒子塑造记忆与社会秩序。",
      identity: "科技与神话并存的科幻世界。",
      tone: "神秘、克制、探索感。",
      themes: ["知识垄断"],
      coreConflict: "不同群体争夺粒子知识的解释权。",
    },
    rules: {
      summary: "粒子能力受边界和代价约束。",
      axioms: Array.from({ length: 5 }, (_, index) => ({
        id: `rule-${index + 1}`,
        name: `公理${index + 1}`,
        summary: `规则摘要${index + 1}`,
        cost: "消耗记忆",
        boundary: "不可逆越界",
        enforcement: "异常会被记录",
      })),
      taboo: [],
      sharedConsequences: [],
    },
    factions,
    forces,
    locations,
    relations: {
      forceRelations: Array.from({ length: 4 }, (_, index) => ({
        id: `force-relation-${index + 1}`,
        sourceForceId: `force-${index + 1}`,
        targetForceId: `force-${index + 2}`,
        relation: "竞争",
        tension: "资源争夺",
        detail: "双方争夺知识解释权",
      })),
      locationControls: locations.map((location, index) => ({
        id: `location-control-${index + 1}`,
        forceId: location.controllingForceIds[0],
        locationId: location.id,
        relation: "控制",
        detail: "限制外来进入",
      })),
      locationConnections: locations.slice(1).map((location, index) => ({
        id: `location-connection-${index + 1}`,
        sourceLocationId: locations[index].id,
        targetLocationId: location.id,
        connectionType: "道路",
        distanceHint: "短途",
        narrativeUse: "追踪与转移",
      })),
    },
    metadata: { schemaVersion: 1, seededFrom: "fixture" },
  };
}

function buildPresentationFixture(structure) {
  return {
    concept: {
      name: "粒界回声",
      oneSentence: "濒死记忆揭开超光速粒子的统治秘密。",
      readerImpression: "神秘科技与知识阶层对峙。",
      genrePromise: "科幻探索与社会冲突。",
    },
    storyEntrySuggestions: [1, 2, 3].map((index) => ({
      title: `入口${index}`,
      description: `从地点${index}发现异常。`,
      recommendedLocationIds: [`location-${index}`],
      involvedForceIds: [`force-${index}`],
      firstConflict: `入口${index}遭遇知识封锁。`,
    })),
    assessment: {
      completenessScore: 88,
      readyForNovelUse: true,
      missingParts: [],
      recommendedNextActions: ["选择一个入口开始写作"],
    },
  };
}

test("world stage prompt context keeps continuity ids while dropping unbounded prose", () => {
  const fixture = buildStageFixture();
  fixture.forces[0].summary = "组织摘要".repeat(500);
  fixture.locations[0].summary = "地点摘要".repeat(500);

  const fullSize = JSON.stringify(fixture).length;
  const projected = buildWorldSkeletonPromptContext(fixture, "relations");
  const projectedJson = JSON.stringify(projected);

  assert.ok(projectedJson.length < fullSize * 0.7);
  assert.match(projectedJson, /force-1/);
  assert.match(projectedJson, /location-1/);
  assert.ok(projected.forces[0].summary.length < 220);
  assert.ok(projected.locations[0].summary.length < 220);
  assert.equal(projected.metadata, undefined);
});

test("light world skeleton prompt bounds untrusted idea and reference prose", () => {
  const idea = `${"前置设定".repeat(3_000)}尾部线索`;
  const messages = worldSkeletonGenerationPrompt.render({
    idea,
    worldType: "科幻",
    template: "自定义",
    referenceContext: {
      mode: "adapt_world",
      preserveElements: ["必须保留".repeat(200)],
      allowedChanges: ["允许改造".repeat(200)],
      forbiddenElements: ["禁止偏离".repeat(200)],
      anchors: [{ id: "anchor-1", label: "锚点", content: "参考内容".repeat(300) }],
    },
    blueprint: {
      classicElements: ["经典元素".repeat(100)],
      propertySelections: Array.from({ length: 30 }, (_, index) => ({
        name: `属性${index}`,
        choiceLabel: "选择".repeat(100),
        description: "描述".repeat(100),
        detail: "补充".repeat(100),
      })),
    },
    options: {
      preset: "light",
      counts: {
        rules: 3,
        factionGroups: 2,
        forces: 3,
        locations: 4,
        conflicts: 2,
        storyEntrySuggestions: 2,
      },
    },
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });
  const rendered = messages.map((message) => String(message.content)).join("\n");

  assert.ok(rendered.length < 20_000);
  assert.match(rendered, /尾部线索/);
  assert.match(rendered, /内容已压缩|参考锚点/);
});

test("standard world skeleton uses staged generation and deterministic assembly", async () => {
  const original = promptRunner.runStructuredPrompt;
  const calls = [];
  const fixture = buildStageFixture();
  promptRunner.runStructuredPrompt = async (request) => {
    calls.push(request);
    if (request.asset.id === "world.structure.generate") {
      const section = request.promptInput.section;
      const output = section === "factions"
        ? { factions: fixture.factions, forces: fixture.forces }
        : fixture[section] ?? fixture.relations;
      return { output };
    }
    return { output: buildPresentationFixture(fixture) };
  };

  try {
    const result = await generateWorldSkeleton({
      idea: "超光速粒子解释濒死体验与知识垄断。",
      worldType: "科幻",
      options: { preset: "standard" },
      provider: "deepseek",
    });
    assert.deepEqual(calls.map((request) => request.asset.id), [
      "world.structure.generate",
      "world.structure.generate",
      "world.structure.generate",
      "world.structure.generate",
      "world.structure.generate",
      "world.skeleton.present",
    ]);
    assert.deepEqual(calls.slice(0, 5).map((request) => request.promptInput.section), [
      "profile", "rules", "factions", "locations", "relations",
    ]);
    assert.ok(calls.every((request) => request.options.reasoningEffort === "low"));
    assert.ok(calls.every((request) => request.options.requestBudget?.mode === "observe"));
    assert.ok(calls.every((request) => request.options.requestBudget?.inputTokenLimit === 12_000));
    assert.equal(result.structuredData.rules.axioms.length, 5);
    assert.equal(result.structuredData.factions.length, 3);
    assert.equal(result.structuredData.forces.length, 5);
    assert.equal(result.structuredData.locations.length, 6);
    assert.equal(result.structuredData.relations.forceRelations.length, 4);
    assert.ok(result.structuredData.forces.every((force) => force.controlledLocationIds.length > 0));
    assert.equal(result.structuredData.metadata.seededFrom, "world-skeleton-staged");
  } finally {
    promptRunner.runStructuredPrompt = original;
  }
});

test("a failed stage is retried in place without regenerating prior stages", async () => {
  const original = promptRunner.runStructuredPrompt;
  const calls = [];
  const fixture = buildStageFixture();
  let profileAttempts = 0;
  promptRunner.runStructuredPrompt = async (request) => {
    calls.push(request);
    if (request.asset.id === "world.structure.generate") {
      const section = request.promptInput.section;
      if (section === "profile" && profileAttempts++ === 0) {
        return { output: { summary: "", identity: "", tone: "", themes: [], coreConflict: "" } };
      }
      const output = section === "factions"
        ? { factions: fixture.factions, forces: fixture.forces }
        : fixture[section] ?? fixture.relations;
      return { output };
    }
    return { output: buildPresentationFixture(fixture) };
  };

  try {
    await generateWorldSkeleton({
      idea: "阶段失败应局部重试。",
      options: { preset: "standard" },
      provider: "deepseek",
    });
    assert.deepEqual(calls.map((request) => request.promptInput?.section ?? request.asset.id), [
      "profile", "profile", "rules", "factions", "locations", "relations", "world.skeleton.present",
    ]);
    assert.match(calls[1].promptInput.promptSource, /缺少必要字段/);
  } finally {
    promptRunner.runStructuredPrompt = original;
  }
});

test("reasoning budget exhaustion retries the same stage with reasoning disabled", async () => {
  const original = promptRunner.runStructuredPrompt;
  const calls = [];
  const fixture = buildStageFixture();
  let profileAttempts = 0;
  promptRunner.runStructuredPrompt = async (request) => {
    calls.push(request);
    if (request.asset.id === "world.structure.generate") {
      const section = request.promptInput.section;
      if (section === "profile" && profileAttempts++ === 0) {
        const error = new Error("[STRUCTURED_OUTPUT:reasoning_budget_exhausted] 推理额度耗尽");
        error.category = "reasoning_budget_exhausted";
        throw error;
      }
      const output = section === "factions"
        ? { factions: fixture.factions, forces: fixture.forces }
        : fixture[section] ?? fixture.relations;
      return { output };
    }
    return { output: buildPresentationFixture(fixture) };
  };

  try {
    await generateWorldSkeleton({
      idea: "推理预算耗尽时只降低当前阶段复杂度。",
      options: { preset: "standard" },
      provider: "deepseek",
    });
    assert.equal(calls[0].options.reasoningEnabled, undefined);
    assert.equal(calls[1].promptInput.section, "profile");
    assert.equal(calls[1].options.reasoningEnabled, false);
    assert.equal(calls.filter((request) => request.promptInput?.section === "profile").length, 2);
  } finally {
    promptRunner.runStructuredPrompt = original;
  }
});

test("checkpointed generation resumes from the failed stage", async () => {
  const original = promptRunner.runStructuredPrompt;
  const calls = [];
  const fixture = buildStageFixture();
  const state = {
    runId: "run-checkpoint-1",
    request: null,
    structure: createEmptyWorldStructure(),
    nextStageIndex: 0,
    status: "running",
    finalPayload: undefined,
    currentStage: null,
  };
  const checkpointStore = {
    async startOrResume(input) {
      if (!state.request) {
        state.request = {
          idea: input.request.idea,
          worldType: input.request.worldType,
          template: input.request.template,
          referenceContext: input.request.referenceContext,
          blueprint: input.request.blueprint,
          options: input.request.options,
          provider: input.request.provider,
          model: input.request.model,
        };
      }
      return {
        runId: state.runId,
        request: state.request,
        structure: state.structure,
        nextStageIndex: state.nextStageIndex,
        status: state.status,
        finalPayload: state.finalPayload,
      };
    },
    async saveStage(input) {
      state.structure = input.structure;
      state.nextStageIndex = input.sequence;
      state.currentStage = input.stage;
      state.status = "running";
    },
    async complete(input) {
      state.finalPayload = input.payload;
      state.nextStageIndex = input.sequence;
      state.status = "succeeded";
    },
    async fail(input) {
      state.currentStage = input.stage;
      state.status = "failed";
    },
    async getSummary() {
      return null;
    },
  };
  let locationAttempts = 0;
  promptRunner.runStructuredPrompt = async (request) => {
    calls.push(request);
    if (request.asset.id === "world.structure.generate") {
      const section = request.promptInput.section;
      if (section === "locations" && locationAttempts++ < 2) {
        throw new Error("地点阶段模拟失败");
      }
      const output = section === "factions"
        ? { factions: fixture.factions, forces: fixture.forces }
        : fixture[section] ?? fixture.relations;
      return { output };
    }
    return { output: buildPresentationFixture(fixture) };
  };

  try {
    await assert.rejects(
      generateWorldSkeleton({
        idea: "阶段失败后保存检查点。",
        options: { preset: "standard" },
        provider: "deepseek",
        checkpointStore,
      }),
      /地点阶段模拟失败/,
    );
    assert.equal(state.nextStageIndex, 3);
    assert.equal(state.status, "failed");
    assert.equal(state.currentStage, "locations");

    const callsBeforeResume = calls.length;
    const result = await generateWorldSkeleton({
      idea: "恢复时应使用已保存请求。",
      options: { preset: "standard" },
      provider: "deepseek",
      checkpointRunId: state.runId,
      checkpointStore,
    });
    const resumedSections = calls.slice(callsBeforeResume)
      .map((request) => request.promptInput?.section ?? request.asset.id);
    assert.deepEqual(resumedSections, ["locations", "relations", "world.skeleton.present"]);
    assert.equal(result.generationRunId, state.runId);
    assert.equal(state.status, "succeeded");
  } finally {
    promptRunner.runStructuredPrompt = original;
  }
});
