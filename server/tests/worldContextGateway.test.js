const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildWorldContextBlockFromSlice,
  WorldContextGateway,
} = require("../dist/services/novel/worldContext/WorldContextGateway.js");

function buildSlice() {
  return {
    storyId: "novel-1",
    worldId: "world-1",
    coreWorldFrame: "星核枯竭的帝国边境，所有力量都必须付出现实代价。",
    appliedRules: [{
      id: "rule-star-core",
      name: "星核代价",
      summary: "魔力来自星核，透支会损伤寿命。",
      whyItMatters: "角色能力、职业和冒险选择都不能无代价升级。",
    }],
    activeForces: [{
      id: "force-court",
      name: "星皇朝廷",
      summary: "控制星核分配的旧秩序中心。",
      roleInStory: "主角身份与资源压力的来源。",
      pressure: "通过配额、身份审查和边境调令持续施压。",
    }],
    activeLocations: [{
      id: "location-border",
      name: "北境冰原",
      summary: "星核矿脉最不稳定的前线。",
      storyUse: "承载开局危机和势力试探。",
      risk: "星核风暴会暴露角色能力代价。",
    }],
    activeElements: [],
    conflictCandidates: ["星核配额争夺导致边境叛乱"],
    pressureSources: ["朝廷配额审查", "边境星核风暴"],
    mysterySources: ["星核为何开始枯竭"],
    suggestedStoryAxes: ["边境求生", "旧秩序反噬"],
    recommendedEntryPoints: ["从一次失败的星核押运开局"],
    forbiddenCombinations: ["不要把魔力写成无代价升级体系"],
    storyScopeBoundary: "前期限定在北境与朝廷配额体系内，不要直接扩到全大陆神战。",
    metadata: {
      schemaVersion: 1,
      builtAt: "2026-05-29T00:00:00.000Z",
      sourceWorldUpdatedAt: "2026-05-28T00:00:00.000Z",
      storyInputDigest: "digest",
      builtFromStructuredData: true,
      builderMode: "runtime",
    },
  };
}

test("world context block formats character purpose from story slice", () => {
  const block = buildWorldContextBlockFromSlice({
    slice: buildSlice(),
    purpose: "character",
    strength: "normal",
    novelWorldId: "novel-world-1",
  });

  assert.equal(block.sourceType, "story_slice");
  assert.equal(block.novelWorldId, "novel-world-1");
  assert.equal(block.purpose, "character");
  assert.match(block.promptBlock, /角色生成必须贴合本书世界/);
  assert.match(block.worldRulesText, /星核代价/);
  assert.match(block.worldStageText, /星皇朝廷/);
  assert.match(block.worldStageText, /北境冰原/);
  assert.deepEqual(block.activeForces.map((force) => force.id), ["force-court"]);
  assert.deepEqual(block.activeLocations.map((location) => location.id), ["location-border"]);
  assert.deepEqual(block.forbiddenCombinations, ["不要把魔力写成无代价升级体系"]);
});

test("gateway delegates novel theme world generation through novel world service", async () => {
  const calls = [];
  const gateway = new WorldContextGateway(
    {},
    {
      generateFromNovelTheme: async (input) => {
        calls.push(input);
        return {
          hasNovelWorld: true,
          novelWorld: {
            id: "novel-world-1",
            novelId: input.novelId,
            sourceWorldId: null,
            sourceType: "generated",
            title: "主题世界",
            coverSummary: "根据主题生成",
            syncEnabled: false,
            syncDirection: "none",
            syncBaseVersion: null,
            lastSyncedAt: null,
            syncPendingChangeCount: 0,
            syncPendingSections: [],
            syncPendingSummary: null,
            hasStructuredData: true,
            hasStorySlice: false,
            storySliceBuiltAt: null,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
          handbook: null,
          assets: [],
          syncHistory: [],
        };
      },
    },
  );

  const result = await gateway.generateWorldFromNovelTheme("novel-1", {
    saveToLibrary: true,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
  });

  assert.equal(result.hasNovelWorld, true);
  assert.deepEqual(calls, [{
    novelId: "novel-1",
    saveToLibrary: true,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
    storyMacroContext: undefined,
    bookContractContext: undefined,
    openingOnly: undefined,
  }]);
});

test("gateway builds context from the instance without repeating slice persistence", async () => {
  const calls = [];
  const slice = buildSlice();
  const gateway = new WorldContextGateway(
    {
      ensureStoryWorldSlice: async (novelId, options) => {
        calls.push({ type: "ensureStoryWorldSlice", novelId, options });
        return slice;
      },
    },
    {
      getByNovelId: async (novelId) => {
        calls.push({ type: "getByNovelId", novelId });
        return {
          id: "novel-world-1",
          novelId,
        };
      },
    },
  );

  const block = await gateway.getWorldContextBlock("novel-1", {
    purpose: "chapter",
    storyInput: "第一卷发生在北境。",
  });

  assert.equal(block.novelWorldId, "novel-world-1");
  assert.equal(block.purpose, "chapter");
  assert.match(block.promptBlock, /章节生成必须遵守本书世界/);
  assert.deepEqual(calls, [{
    type: "getByNovelId",
    novelId: "novel-1",
  }, {
    type: "ensureStoryWorldSlice",
    novelId: "novel-1",
    options: {
      builderMode: "runtime",
      storyInput: "第一卷发生在北境。",
    },
  }]);
});

test("gateway assembles all five purposes from the same current slice without persistence", async () => {
  const slice = buildSlice();
  const calls = [];
  const gateway = new WorldContextGateway(
    {
      ensureStoryWorldSlice: async (_novelId, options) => {
        calls.push({ type: "ensure", options });
        return slice;
      },
    },
    {
      getByNovelId: async () => ({ id: "novel-world-1", novelId: "novel-1" }),
      persistStorySlice: async () => {
        throw new Error("gateway must not persist the slice");
      },
    },
  );

  for (const purpose of ["outline", "character", "chapter", "bible", "optimize"]) {
    const block = await gateway.getWorldContextBlock("novel-1", { purpose });
    assert.equal(block.novelWorldId, "novel-world-1");
    assert.equal(block.purpose, purpose);
    assert.equal(block.rawSlice, slice);
  }
  assert.deepEqual(calls.map((call) => call.options.builderMode), [
    "outline",
    "runtime",
    "runtime",
    "bible",
    "runtime",
  ]);
});

test("gateway never assembles a stale force-refresh result", async () => {
  const calls = [];
  let refreshCount = 0;
  const gateway = new WorldContextGateway(
    {
      ensureStoryWorldSlice: async () => {
        calls.push("ensure");
        return buildSlice();
      },
      refreshWorldSlice: async () => {
        calls.push("refresh");
        refreshCount += 1;
        return { slice: buildSlice(), isStale: refreshCount === 1 };
      },
    },
    {
      getByNovelId: async () => ({ id: "novel-world-1", novelId: "novel-1" }),
    },
  );

  assert.equal(await gateway.getWorldContextBlock("novel-1", {
    purpose: "chapter",
    forceRefresh: true,
  }), null);
  const current = await gateway.getWorldContextBlock("novel-1", {
    purpose: "chapter",
    forceRefresh: true,
  });
  assert.equal(current.rawSlice.coreWorldFrame, buildSlice().coreWorldFrame);
  assert.deepEqual(calls, ["refresh", "refresh"]);
});

test("gateway returns null for a no-world ensure or refresh and hasActiveWorld follows usable view", async () => {
  const calls = [];
  let instanceReads = 0;
  const gateway = new WorldContextGateway(
    {
      ensureStoryWorldSlice: async () => {
        calls.push("ensure");
        return null;
      },
      refreshWorldSlice: async () => {
        calls.push("refresh");
        return {
          hasWorld: false,
          worldId: null,
          worldName: null,
          slice: null,
          overrides: {},
          availableRules: [],
          availableForces: [],
          availableLocations: [],
          storyInputSource: null,
          isStale: false,
        };
      },
      getWorldSliceView: async () => ({
        hasWorld: false,
        worldId: null,
        worldName: null,
        slice: null,
        overrides: {},
        availableRules: [],
        availableForces: [],
        availableLocations: [],
        storyInputSource: null,
        isStale: false,
      }),
    },
    {
      getByNovelId: async () => {
        instanceReads += 1;
        if (instanceReads <= 2) {
          return null;
        }
        throw new Error("hasActiveWorld must use the slice view");
      },
    },
  );

  assert.equal(await gateway.getWorldContextBlock("novel-1", { purpose: "chapter" }), null);
  assert.equal(await gateway.getWorldContextBlock("novel-1", {
    purpose: "chapter",
    forceRefresh: true,
  }), null);
  assert.equal(await gateway.hasActiveWorld("novel-1"), false);
  assert.deepEqual(calls, ["ensure", "refresh"]);
});
