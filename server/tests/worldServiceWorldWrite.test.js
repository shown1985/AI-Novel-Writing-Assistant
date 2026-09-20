const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The service imports the process singleton. Point that singleton at a fresh
// fixture before loading it; this test stubs only the read/commit boundaries,
// so no user database tables are opened or mutated.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "world-service-cas-"));
process.env.DATABASE_URL = `file:${path.join(fixtureDir, "fixture.db")}`;

const { prisma } = require("../dist/db/prisma.js");
const { WorldService } = require("../dist/services/world/WorldService.js");
const {
  worldMaintenanceWorkflowService,
  WorldMaintenanceError,
} = require("../dist/services/world/maintenance/index.js");

function createWorld() {
  return {
    id: "world-service-fixture",
    name: "隔离世界",
    description: "原始描述",
    worldType: "fantasy",
    templateKey: "custom",
    axioms: JSON.stringify(["旧公理"]),
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
    contentRevision: 7,
    selectedDimensions: null,
    selectedElements: null,
    layerStates: null,
    consistencyReport: null,
    overviewSummary: null,
    structureJson: JSON.stringify({
      profile: {
        summary: "原始描述",
        identity: "",
        tone: "",
        themes: [],
        coreConflict: "",
      },
      rules: {
        summary: "",
        axioms: [{ id: "rule-old", name: "旧公理", summary: "旧公理", cost: "", boundary: "", enforcement: "" }],
        taboo: [],
        sharedConsequences: [],
      },
      factions: [],
      forces: [],
      locations: [],
      relations: { forceRelations: [], locationControls: [], locationConnections: [] },
      metadata: { schemaVersion: 1, seededFrom: "test", lastGeneratedAt: "2026-09-20T00:00:00.000Z" },
    }),
    bindingSupportJson: JSON.stringify({
      recommendedEntryPoints: [],
      highPressureForces: [],
      suggestedLocationClusters: [],
      compatibleConflicts: [],
      forbiddenCombinations: [],
    }),
    structureSchemaVersion: 1,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  };
}

test("WorldService adapters pass both writes through one CAS facade", async () => {
  const world = createWorld();
  const originalFindUnique = prisma.world.findUnique;
  const originalCommit = worldMaintenanceWorkflowService.commitWorldSample;
  const commits = [];
  let findCalls = 0;
  let outcome = "committed";
  let snapshotCalls = 0;

  prisma.world.findUnique = async () => {
    findCalls += 1;
    return world;
  };
  worldMaintenanceWorkflowService.commitWorldSample = async (worldId, command) => {
    commits.push({ worldId, command });
    if (outcome === "revision-conflict") {
      throw new WorldMaintenanceError(409, "CONTENT_REVISION_CONFLICT", "版本冲突。");
    }
    if (outcome === "operation-conflict") {
      throw new WorldMaintenanceError(409, "OPERATION_ID_REUSED", "操作标识已使用。");
    }
    if (outcome === "unknown") {
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "结果未知。");
    }
    return {
      operationId: command.operationId,
      target: { type: "world", id: worldId },
      state: outcome,
      contentSaved: true,
      committedRevision: outcome === "replayed" ? 8 : 8,
      receipt: {
        operationId: command.operationId,
        targetType: "world",
        targetId: worldId,
        baseRevision: 7,
        committedRevision: 8,
        decisionRevision: 0,
        selectedPatchIds: [],
        beforeDigest: "before",
        afterDigest: "after",
        committedAt: "2026-09-20T00:00:00.000Z",
      },
      sourceRoute: `/worlds/${worldId}/workspace`,
      ragRefreshPending: outcome === "rag-debt",
    };
  };

  try {
    const service = new WorldService();
    service.createSnapshot = async () => {
      snapshotCalls += 1;
      return null;
    };

    findCalls = 0;
    await assert.rejects(
      service.updateWorld(world.id, { description: "缺操作标识" }),
      (error) => error.status === 428 && error.code === "REVISION_REQUIRED",
    );
    assert.equal(findCalls, 0, "缺保护字段必须在读世界前拒绝");

    findCalls = 0;
    await assert.rejects(
      service.updateAxioms(world.id, ["缺版本"], { operationId: "op-missing-revision" }),
      (error) => error.status === 428 && error.code === "REVISION_REQUIRED",
    );
    assert.equal(findCalls, 0, "公理缺版本必须在读世界前拒绝");

    const updated = await service.updateWorld(world.id, {
      description: "普通字段保存",
      operationId: "op-world",
      expectedContentRevision: 7,
    });
    assert.equal(updated.maintenance.state, "committed");
    assert.equal(commits[0].command.expectedContentRevision, 7);
    assert.equal(commits[0].command.operationId, "op-world");
    assert.equal(commits[0].command.sourceRef, "/worlds/world-service-fixture/workspace");
    assert.equal(commits[0].command.candidateAggregate.description, "普通字段保存");
    assert.equal(typeof commits[0].command.requestHash, "string");

    const axioms = await service.updateAxioms(world.id, ["新公理"], {
      operationId: "op-axioms",
      expectedContentRevision: 7,
    });
    assert.equal(axioms.maintenance.state, "committed");
    assert.deepEqual(JSON.parse(commits[1].command.candidateAggregate.axioms), ["新公理"]);
    assert.equal(commits[1].command.sourceRef, "/worlds/world-service-fixture/workspace");
    assert.equal(commits[1].command.expectedDecisionRevision, 0);
    assert.equal(snapshotCalls, 1, "只有 committed 公理保存创建兼容快照");

    outcome = "revision-conflict";
    await assert.rejects(
      service.updateWorld(world.id, {
        description: "过期保存",
        operationId: "op-stale",
        expectedContentRevision: 6,
      }),
      (error) => error.status === 409 && error.code === "CONTENT_REVISION_CONFLICT",
    );
    outcome = "operation-conflict";
    await assert.rejects(
      service.updateAxioms(world.id, ["冲突公理"], {
        operationId: "op-axioms",
        expectedContentRevision: 7,
      }),
      (error) => error.status === 409 && error.code === "OPERATION_ID_REUSED",
    );
    outcome = "replayed";
    const replay = await service.updateAxioms(world.id, ["新公理"], {
      operationId: "op-replay",
      expectedContentRevision: 7,
    });
    assert.equal(replay.maintenance.state, "replayed");
    assert.equal(snapshotCalls, 1, "replay 不复制快照证据");
    outcome = "rag-debt";
    const ragDebt = await service.updateWorld(world.id, {
      description: "资料债仍保存",
      operationId: "op-rag-debt",
      expectedContentRevision: 7,
    });
    assert.equal(ragDebt.maintenance.ragRefreshPending, true);
    assert.equal(commits.length, 6, "普通字段与公理均只调用同一个 commitWorldSample 门面");
  } finally {
    prisma.world.findUnique = originalFindUnique;
    worldMaintenanceWorkflowService.commitWorldSample = originalCommit;
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
