const test = require("node:test");
const assert = require("node:assert/strict");

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { generateWorldSkeleton } = require("../dist/services/world/worldSkeletonGeneration.js");

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
