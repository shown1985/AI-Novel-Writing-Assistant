const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const BetterSqlite3 = require("better-sqlite3");

const {
  WorldMaintenanceWorkflowService,
} = require("../dist/services/world/maintenance/application/WorldMaintenanceWorkflowService.js");
const {
  PrismaWorldSampleCommitStore,
} = require("../dist/services/world/maintenance/infrastructure/PrismaWorldSampleCommitStore.js");

function createCandidate(name) {
  const structure = {
    profile: {
      summary: `${name} 的世界摘要`,
      identity: "边境世界",
      tone: "克制",
      themes: ["选择"],
      coreConflict: "两股力量争夺边境。",
    },
    rules: {
      summary: "力量必须付出代价。",
      axioms: [],
      taboo: [],
      sharedConsequences: [],
    },
    factions: [
      {
        id: "faction-1",
        name: "边境议会",
        position: "维持秩序",
        doctrine: "优先保全居民",
        goals: ["守住边境"],
        methods: ["谈判"],
        representativeForceIds: ["force-1"],
      },
    ],
    forces: [
      {
        id: "force-1",
        name: "边防军",
        type: "military",
        factionId: "faction-1",
        resources: ["城防"],
        controlledLocationIds: ["location-1"],
        summary: "守卫边境。",
        baseOfPower: "驻军",
        currentObjective: "维持秩序",
        pressure: "兵力有限",
        leader: null,
        narrativeRole: "守门人",
      },
    ],
    locations: [
      {
        id: "location-1",
        name: "北门",
        type: "border",
        region: "北境",
        terrain: "城墙",
        summary: "边境关口。",
        narrativeFunction: "冲突入口",
        risk: "容易被围攻",
        riskLevel: 2,
        storyRelevance: "主角首次进入之处",
        entryConstraint: "需要通行证",
        exitCost: "失去补给",
        controllingForceIds: ["force-1"],
      },
    ],
    relations: {
      forceRelations: [],
      locationControls: [],
      locationConnections: [],
    },
    metadata: {
      schemaVersion: 1,
      seededFrom: "test",
      lastBackfilledAt: null,
      lastGeneratedAt: null,
      lastSectionGenerated: null,
    },
  };

  return {
    name,
    description: `${name} 的描述`,
    worldType: "fantasy",
    templateKey: null,
    axioms: null,
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
    selectedDimensions: null,
    selectedElements: null,
    layerStates: null,
    overviewSummary: null,
    structureSchemaVersion: 1,
    structureJson: JSON.stringify(structure),
    bindingSupportJson: null,
  };
}

function command(operationId, candidate, expectedContentRevision = 1) {
  return {
    operationId,
    expectedContentRevision,
    expectedDecisionRevision: 0,
    candidateAggregate: candidate,
    selectedPatchIds: ["patch-world-name"],
    sourceRef: "/worlds/world-1/workspace?tab=consistency",
  };
}

function createPrisma(databasePath) {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }),
  });
}

async function createIsolatedDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "world-maintenance-"));
  const databasePath = path.join(tempDir, "test.db");
  fs.closeSync(fs.openSync(databasePath, "a"));
  const rawDatabase = new BetterSqlite3(databasePath);
  rawDatabase.exec(`
    CREATE TABLE "World" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "worldType" TEXT,
      "templateKey" TEXT,
      "axioms" TEXT,
      "background" TEXT,
      "geography" TEXT,
      "cultures" TEXT,
      "magicSystem" TEXT,
      "politics" TEXT,
      "races" TEXT,
      "religions" TEXT,
      "technology" TEXT,
      "conflicts" TEXT,
      "history" TEXT,
      "economy" TEXT,
      "factions" TEXT,
      "status" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "contentRevision" INTEGER NOT NULL DEFAULT 1,
      "selectedDimensions" TEXT,
      "selectedElements" TEXT,
      "layerStates" TEXT,
      "consistencyReport" TEXT,
      "overviewSummary" TEXT,
      "structureJson" TEXT,
      "bindingSupportJson" TEXT,
      "structureSchemaVersion" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "WorldMaintenanceOperation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "operationType" TEXT NOT NULL,
      "operationId" TEXT NOT NULL,
      "requestHash" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "WorldMaintenanceCommitReceipt" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "operationRecordId" TEXT NOT NULL UNIQUE,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "baseRevision" INTEGER NOT NULL,
      "committedRevision" INTEGER NOT NULL,
      "decisionRevision" INTEGER NOT NULL,
      "selectedPatchIdsJson" TEXT NOT NULL,
      "beforeDigest" TEXT NOT NULL,
      "afterDigest" TEXT NOT NULL,
      "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorldMaintenanceCommitReceipt_operationRecordId_fkey"
        FOREIGN KEY ("operationRecordId") REFERENCES "WorldMaintenanceOperation"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX "WorldMaintenanceOperation_targetType_targetId_operationType_operationId_key"
      ON "WorldMaintenanceOperation"("targetType", "targetId", "operationType", "operationId");
    CREATE INDEX "WorldMaintenanceOperation_targetType_targetId_updatedAt_idx"
      ON "WorldMaintenanceOperation"("targetType", "targetId", "updatedAt");
  `);
  rawDatabase.close();
  const client = createPrisma(databasePath);
  await client.world.create({
    data: {
      id: "world-1",
      name: "初始世界",
      status: "draft",
      version: 1,
      contentRevision: 1,
      structureSchemaVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return { client, tempDir };
}

function createService(persistence, rag = { enqueueWorldRefresh: async () => {} }) {
  return new WorldMaintenanceWorkflowService(
    persistence,
    { readWorldDecisionRevision: async () => ({ decisionRevision: 0, source: "empty_compat" }) },
    rag,
  );
}

test("World sample commits use CAS: concurrent bases permit exactly one content write", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    let ragCalls = 0;
    const rag = { enqueueWorldRefresh: async () => { ragCalls += 1; } };
    const store = new PrismaWorldSampleCommitStore(client);
    const service = createService(store, rag);
    const results = await Promise.allSettled([
      service.commitWorldSample("world-1", command("op-a", createCandidate("提交 A"))),
      service.commitWorldSample("world-1", command("op-b", createCandidate("提交 B"))),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const conflict = results.find((result) => result.status === "rejected").reason;
    assert.equal(conflict.code, "CONTENT_REVISION_CONFLICT");
    assert.equal(await client.world.count({ where: { contentRevision: 2 } }), 1);
    assert.equal(await client.worldMaintenanceOperation.count(), 1);
    assert.equal(await client.worldMaintenanceCommitReceipt.count(), 1);
    assert.equal(ragCalls, 1);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("same operation replays its receipt, while a different request hash is rejected", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    const store = new PrismaWorldSampleCommitStore(client);
    const service = createService(store);
    const first = await service.commitWorldSample("world-1", command("op-replay", createCandidate("第一次")));
    const replay = await service.commitWorldSample("world-1", command("op-replay", createCandidate("第一次")));
    assert.equal(first.state, "committed");
    assert.equal(replay.state, "replayed");
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(await client.worldMaintenanceOperation.count(), 1);
    assert.equal(await client.world.count({ where: { contentRevision: 2 } }), 1);

    await assert.rejects(
      service.commitWorldSample("world-1", command("op-replay", createCandidate("改写请求"))),
      (error) => error.code === "OPERATION_ID_REUSED",
    );
    assert.equal(await client.worldMaintenanceOperation.count(), 1);
    assert.equal((await client.world.findUnique({ where: { id: "world-1" } })).contentRevision, 2);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("receipt lookup resolves a committed operation after the caller loses its response", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    const store = new PrismaWorldSampleCommitStore(client);
    let loseResponse = true;
    const flakyPersistence = {
      commitWorldSample: async (input) => {
        const outcome = await store.commitWorldSample(input);
        if (loseResponse) {
          loseResponse = false;
          throw new Error("simulated response loss");
        }
        return outcome;
      },
      readWorldSampleOperation: (targetId, operationId) => store.readWorldSampleOperation(targetId, operationId),
    };
    const service = createService(flakyPersistence);
    const request = command("op-lost-response", createCandidate("已保存"));
    await assert.rejects(service.commitWorldSample("world-1", request), /simulated response loss/);
    const queried = await service.getWorldSampleCommitByOperation("world-1", request.operationId);
    assert.equal(queried.state, "replayed");
    assert.equal(queried.contentSaved, true);
    assert.equal(queried.committedRevision, 2);
    assert.equal(await client.worldMaintenanceCommitReceipt.count(), 1);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("receipt and content are atomic: a receipt failure leaves no operation or revision", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    await client.$executeRawUnsafe(`
      CREATE TRIGGER abort_world_receipt BEFORE INSERT ON "WorldMaintenanceCommitReceipt"
      BEGIN
        SELECT RAISE(ABORT, 'forced receipt failure');
      END;
    `);
    const store = new PrismaWorldSampleCommitStore(client);
    const service = createService(store);
    await assert.rejects(
      service.commitWorldSample("world-1", command("op-rollback", createCandidate("不应保存"))),
    );
    const world = await client.world.findUnique({ where: { id: "world-1" } });
    assert.equal(world.contentRevision, 1);
    assert.equal(world.name, "初始世界");
    assert.equal(await client.worldMaintenanceOperation.count(), 0);
    assert.equal(await client.worldMaintenanceCommitReceipt.count(), 0);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("a later manual revision prevents a new stale operation and cannot be overwritten by replay", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    const store = new PrismaWorldSampleCommitStore(client);
    const service = createService(store);
    const request = command("op-manual-race", createCandidate("自动候选"));
    const committed = await service.commitWorldSample("world-1", request);
    await client.world.update({
      where: { id: "world-1" },
      data: { name: "作者后来保存", contentRevision: { increment: 1 } },
    });

    const replay = await service.commitWorldSample("world-1", request);
    assert.equal(replay.state, "replayed");
    assert.equal((await client.world.findUnique({ where: { id: "world-1" } })).name, "作者后来保存");
    await assert.rejects(
      service.commitWorldSample("world-1", command("op-stale-after-manual", createCandidate("旧候选"), 2)),
      (error) => error.code === "CONTENT_REVISION_CONFLICT",
    );
    assert.equal(committed.committedRevision, 2);
    assert.equal((await client.world.findUnique({ where: { id: "world-1" } })).contentRevision, 3);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("dangling binding-support references are rejected before persistence", async () => {
  const calls = [];
  const persistence = {
    commitWorldSample: async () => {
      calls.push("commit");
      return { kind: "commit_result_unknown" };
    },
    readWorldSampleOperation: async () => ({ kind: "not_found" }),
  };
  const service = createService(persistence);
  const candidate = createCandidate("引用错误");
  candidate.bindingSupportJson = JSON.stringify({
    suggestedLocationClusters: [{ locationIds: ["missing-location"] }],
  });
  await assert.rejects(
    service.commitWorldSample("world-1", command("op-invalid-ref", candidate)),
    (error) => error.code === "REFERENCE_INTEGRITY_VIOLATION" && error.details.path.includes("bindingSupport"),
  );
  assert.deepEqual(calls, []);
});

test("missing revision or operation identity is rejected before any persistence write", async () => {
  const calls = [];
  const persistence = {
    commitWorldSample: async () => {
      calls.push("commit");
      return { kind: "commit_result_unknown" };
    },
    readWorldSampleOperation: async () => {
      calls.push("read");
      return { kind: "not_found" };
    },
  };
  const service = createService(persistence);
  const candidate = createCandidate("缺版本");
  await assert.rejects(
    service.commitWorldSample("world-1", {
      ...command("op-missing-revision", candidate),
      expectedContentRevision: undefined,
    }),
    (error) => error.status === 428 && error.code === "REVISION_REQUIRED",
  );
  await assert.rejects(
    service.commitWorldSample("world-1", {
      ...command("", candidate),
    }),
    (error) => error.status === 428 && error.code === "REVISION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});

test("an incomplete candidate aggregate is rejected without clearing omitted world fields", async () => {
  const calls = [];
  const persistence = {
    commitWorldSample: async () => {
      calls.push("commit");
      return { kind: "commit_result_unknown" };
    },
    readWorldSampleOperation: async () => {
      calls.push("read");
      return { kind: "not_found" };
    },
  };
  const service = createService(persistence);
  const incomplete = createCandidate("不完整候选");
  delete incomplete.description;
  await assert.rejects(
    service.commitWorldSample("world-1", command("op-incomplete", incomplete)),
    (error) => error.code === "PROPOSAL_INVALID" && error.details.path === "candidateAggregate.description",
  );
  assert.deepEqual(calls, []);
});

test("the persistence adapter also rejects an incomplete aggregate before opening a transaction", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    const incomplete = createCandidate("直接适配器调用");
    delete incomplete.background;
    const store = new PrismaWorldSampleCommitStore(client);
    await assert.rejects(
      store.commitWorldSample({
        targetId: "world-1",
        operationId: "op-direct-incomplete",
        requestHash: "request-hash",
        expectedContentRevision: 1,
        decisionRevision: 0,
        candidateAggregate: incomplete,
        selectedPatchIds: [],
        afterDigest: "after-digest",
      }),
      (error) => error.code === "PROPOSAL_INVALID" && error.details.path === "candidateAggregate.background",
    );
    const world = await client.world.findUnique({ where: { id: "world-1" } });
    assert.equal(world.name, "初始世界");
    assert.equal(world.contentRevision, 1);
    assert.equal(await client.worldMaintenanceOperation.count(), 0);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("an operation lookup failure is exposed as an unknown result instead of guessing a write", async () => {
  let commitCalled = false;
  const persistence = {
    commitWorldSample: async () => {
      commitCalled = true;
      return { kind: "committed", receipt: {} };
    },
    readWorldSampleOperation: async () => {
      throw new Error("lookup unavailable");
    },
  };
  const service = createService(persistence);
  await assert.rejects(
    service.commitWorldSample("world-1", command("op-lookup-failed", createCandidate("未知结果"))),
    (error) => error.code === "COMMIT_RESULT_UNKNOWN" && error.status === 503,
  );
  assert.equal(commitCalled, false);
});

test("RAG enqueue failure leaves committed content and receipt intact", async () => {
  const { client, tempDir } = await createIsolatedDatabase();
  try {
    const store = new PrismaWorldSampleCommitStore(client);
    const service = createService(store, {
      enqueueWorldRefresh: async () => {
        throw new Error("rag unavailable");
      },
    });
    const result = await service.commitWorldSample("world-1", command("op-rag-debt", createCandidate("RAG 失败后仍保存")));
    assert.equal(result.state, "committed");
    assert.equal(result.contentSaved, true);
    assert.equal(result.ragRefreshPending, true);
    assert.equal(result.committedRevision, 2);
    assert.equal(await client.worldMaintenanceCommitReceipt.count(), 1);
    const world = await client.world.findUnique({ where: { id: "world-1" } });
    assert.equal(world.name, "RAG 失败后仍保存");
    assert.equal(world.contentRevision, 2);
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
