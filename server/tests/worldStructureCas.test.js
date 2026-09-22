const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  updateWorldStructure,
} = require("../dist/services/world/worldStructureWorkspace.js");
const {
  worldMaintenanceWorkflowService,
  WorldMaintenanceError,
} = require("../dist/services/world/maintenance/index.js");

function createWorld(id = "world-structure-cas") {
  return {
    id,
    name: "结构世界",
    description: "原始摘要",
    worldType: "fantasy",
    templateKey: "custom",
    axioms: JSON.stringify(["旧规则"]),
    background: null,
    geography: null,
    cultures: null,
    magicSystem: null,
    politics: null,
    races: null,
    religions: null,
    technology: null,
    conflicts: null,
    history: null,
    economy: null,
    factions: null,
    status: "draft",
    version: 1,
    contentRevision: 4,
    selectedDimensions: null,
    selectedElements: null,
    layerStates: null,
    consistencyReport: null,
    overviewSummary: null,
    structureJson: null,
    bindingSupportJson: null,
    structureSchemaVersion: 1,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  };
}

function createStructure(summary) {
  return {
    profile: {
      summary,
      identity: "边境世界",
      tone: "克制",
      themes: ["选择"],
      coreConflict: "两股力量争夺边境。",
    },
    rules: { summary: "力量必须付出代价。", axioms: [], taboo: [], sharedConsequences: [] },
    factions: [],
    forces: [],
    locations: [],
    relations: { forceRelations: [], locationControls: [], locationConnections: [] },
    metadata: { schemaVersion: 1, seededFrom: "test", lastGeneratedAt: "2026-09-20T00:00:00.000Z" },
  };
}

function commitResult(worldId, command, state = "committed") {
  return {
    operationId: command.operationId,
    target: { type: "world", id: worldId },
    state,
    contentSaved: true,
    committedRevision: 5,
    receipt: {
      operationId: command.operationId,
      targetType: "world",
      targetId: worldId,
      baseRevision: 4,
      committedRevision: 5,
      decisionRevision: 0,
      selectedPatchIds: [],
      beforeDigest: "before",
      afterDigest: "after",
      committedAt: "2026-09-20T00:00:00.000Z",
    },
    sourceRoute: `/worlds/${encodeURIComponent(worldId)}/workspace`,
  };
}

test("structure PUT uses one protected CAS candidate and reports independent snapshot states", async () => {
  const world = createWorld();
  const originalFindUnique = prisma.world.findUnique;
  const originalCommit = worldMaintenanceWorkflowService.commitWorldSample;
  const commands = [];
  let snapshotMode = "created";
  let commitState = "committed";
  let snapshotCalls = 0;

  prisma.world.findUnique = async () => world;
  worldMaintenanceWorkflowService.commitWorldSample = async (worldId, command) => {
    commands.push({ worldId, command });
    return commitResult(worldId, command, commitState);
  };

  try {
    await assert.rejects(
      updateWorldStructure(world.id, { structure: createStructure("缺少保护") }, {
        createSnapshot: async () => { snapshotCalls += 1; },
        queueWorldUpsert: () => {},
      }),
      (error) => error.status === 428 && error.code === "REVISION_REQUIRED",
    );
    assert.equal(commands.length, 0, "保护字段缺失时不能构造或提交 candidate");

    const callbacks = {
      createSnapshot: async () => {
        snapshotCalls += 1;
        if (snapshotMode === "failed") {
          throw new Error("snapshot unavailable");
        }
      },
      queueWorldUpsert: () => {},
    };
    const committed = await updateWorldStructure(world.id, {
      structure: createStructure("已保存"),
      bindingSupport: {
        recommendedEntryPoints: [],
        highPressureForces: [],
        suggestedLocationClusters: [],
        compatibleConflicts: [],
        forbiddenCombinations: [],
      },
      operationId: "structure-op-a",
      expectedContentRevision: 4,
    }, callbacks);
    assert.equal(committed.snapshotStatus, "created");
    assert.equal(commands[0].command.expectedDecisionRevision, 0);
    assert.deepEqual(commands[0].command.selectedPatchIds, []);
    assert.equal(commands[0].command.sourceRef, "/worlds/world-structure-cas/workspace");
    assert.equal(commands[0].command.candidateAggregate.description, "已保存");
    assert.equal(commands[0].command.candidateAggregate.structureSchemaVersion, 1);
    assert.equal(typeof commands[0].command.requestHash, "string");

    snapshotMode = "failed";
    const failedSnapshot = await updateWorldStructure(world.id, {
      structure: createStructure("快照失败仍保存"),
      operationId: "structure-op-b",
      expectedContentRevision: 4,
    }, callbacks);
    assert.equal(failedSnapshot.snapshotStatus, "failed");

    commitState = "replayed";
    const replayed = await updateWorldStructure(world.id, {
      structure: createStructure("重放"),
      operationId: "structure-op-a",
      expectedContentRevision: 4,
    }, callbacks);
    assert.equal(replayed.snapshotStatus, "unknown");
    assert.equal(snapshotCalls, 2, "重放不得再次创建 structure-saved 快照");
  } finally {
    prisma.world.findUnique = originalFindUnique;
    worldMaintenanceWorkflowService.commitWorldSample = originalCommit;
  }
});

test("structure PUT preserves deterministic CAS errors without snapshot attempts", async () => {
  const world = createWorld("world-structure-conflict");
  const originalFindUnique = prisma.world.findUnique;
  const originalCommit = worldMaintenanceWorkflowService.commitWorldSample;
  let snapshotCalls = 0;
  prisma.world.findUnique = async () => world;
  worldMaintenanceWorkflowService.commitWorldSample = async () => {
    throw new WorldMaintenanceError(409, "CONTENT_REVISION_CONFLICT", "世界内容已发生变化。", {
      currentContentRevision: 5,
    });
  };

  try {
    await assert.rejects(
      updateWorldStructure(world.id, {
        structure: createStructure("过期草稿"),
        operationId: "structure-op-stale",
        expectedContentRevision: 4,
      }, {
        createSnapshot: async () => { snapshotCalls += 1; },
        queueWorldUpsert: () => {},
      }),
      (error) => error.status === 409 && error.code === "CONTENT_REVISION_CONFLICT",
    );
    assert.equal(snapshotCalls, 0);
  } finally {
    prisma.world.findUnique = originalFindUnique;
    worldMaintenanceWorkflowService.commitWorldSample = originalCommit;
  }
});

test("structure PUT rejects raw dangling references before normalization or persistence", async () => {
  const world = createWorld("world-structure-raw-reference");
  const originalFindUnique = prisma.world.findUnique;
  const originalCommit = worldMaintenanceWorkflowService.commitWorldSample;
  let commitCalls = 0;
  prisma.world.findUnique = async () => world;
  worldMaintenanceWorkflowService.commitWorldSample = async () => {
    commitCalls += 1;
    throw new Error("commit must not be reached");
  };

  try {
    const invalidStructure = createStructure("悬空引用");
    invalidStructure.relations.forceRelations = [{
      id: "force-relation-1",
      sourceForceId: "missing-force",
      targetForceId: "also-missing-force",
      relation: "对抗",
      tension: "未知",
      detail: "不应被 normalize 静默删除",
    }];
    await assert.rejects(
      updateWorldStructure(world.id, {
        structure: invalidStructure,
        operationId: "structure-op-invalid-reference",
        expectedContentRevision: 4,
      }, {
        createSnapshot: async () => undefined,
        queueWorldUpsert: () => undefined,
      }),
      (error) => error.status === 422 && error.code === "REFERENCE_INTEGRITY_VIOLATION",
    );
    assert.equal(commitCalls, 0);
  } finally {
    prisma.world.findUnique = originalFindUnique;
    worldMaintenanceWorkflowService.commitWorldSample = originalCommit;
  }
});
