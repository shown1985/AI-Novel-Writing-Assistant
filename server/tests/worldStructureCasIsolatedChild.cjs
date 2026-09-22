const fs = require("node:fs");
const Database = require("better-sqlite3");

const databasePath = process.argv[2];
if (!databasePath) {
  throw new Error("Missing isolated database path.");
}

process.env.DATABASE_URL = `file:${databasePath}`;
process.env.NODE_ENV = "test";

const rawDatabase = new Database(databasePath);
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
    "createdAt" DATETIME NOT NULL,
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  CREATE TABLE "RagIndexJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "jobType" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" DATETIME NOT NULL,
    "payloadJson" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
  );
  CREATE INDEX "RagIndexJob_status_runAfter_idx" ON "RagIndexJob"("status", "runAfter");
  CREATE INDEX "RagIndexJob_tenantId_ownerType_ownerId_idx" ON "RagIndexJob"("tenantId", "ownerType", "ownerId");
`);
rawDatabase.close();

const { prisma } = require("../dist/db/prisma.js");
const { updateWorldStructure } = require("../dist/services/world/worldStructureWorkspace.js");

const now = new Date("2026-09-20T00:00:00.000Z");
const worldId = "world-structure-isolated";

function structure(summary) {
  return {
    profile: { summary, identity: "边境世界", tone: "克制", themes: ["选择"], coreConflict: "两股力量争夺边境。" },
    rules: { summary: "力量必须付出代价。", axioms: [], taboo: [], sharedConsequences: [] },
    factions: [{ id: "faction-1", name: "边境议会", position: "秩序", doctrine: "守住边境", goals: [], methods: [], representativeForceIds: ["force-1"] }],
    forces: [{ id: "force-1", name: "边防军", type: "military", factionId: "faction-1", resources: [], controlledLocationIds: ["location-1"], summary: "守卫边境。", baseOfPower: "驻军", currentObjective: "守住边境", pressure: "兵力有限", leader: null, narrativeRole: "守门人" }],
    locations: [{ id: "location-1", name: "北门", type: "border", region: "北境", terrain: "城墙", summary: "边境关口。", narrativeFunction: "冲突入口", risk: "围攻", riskLevel: 2, storyRelevance: "入口", entryConstraint: "通行证", exitCost: "补给", controllingForceIds: ["force-1"] }],
    relations: { forceRelations: [], locationControls: [], locationConnections: [] },
    metadata: { schemaVersion: 1, seededFrom: "test", lastBackfilledAt: null, lastGeneratedAt: null, lastSectionGenerated: null },
  };
}

const bindingSupport = {
  recommendedEntryPoints: ["custom-entry"],
  highPressureForces: ["边防军"],
  suggestedLocationClusters: [{ id: "cluster-1", label: "自定义入口群", locationIds: ["location-1"], reason: "测试" }],
  compatibleConflicts: ["custom-conflict"],
  forbiddenCombinations: ["custom-forbidden"],
};

async function main() {
  await prisma.world.create({
    data: {
      id: worldId,
      name: "结构世界",
      description: "原始摘要",
      worldType: "fantasy",
      templateKey: "custom",
      status: "draft",
      version: 1,
      contentRevision: 4,
      structureSchemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  const callbacks = {
    createSnapshot: async () => undefined,
    queueWorldUpsert: () => undefined,
  };
  const first = await updateWorldStructure(worldId, {
    structure: structure("保存 A"),
    bindingSupport,
    operationId: "structure-op-a",
    expectedContentRevision: 4,
  }, callbacks);
  const afterFirst = await prisma.world.findUnique({ where: { id: worldId } });
  const firstBackground = afterFirst.background;
  const firstBindingSupport = JSON.parse(afterFirst.bindingSupportJson);

  const second = await updateWorldStructure(worldId, {
    structure: structure("保存 B"),
    bindingSupport,
    operationId: "structure-op-b",
    expectedContentRevision: 5,
  }, callbacks);
  const replay = await updateWorldStructure(worldId, {
    structure: structure("保存 A"),
    bindingSupport,
    operationId: "structure-op-a",
    expectedContentRevision: 4,
  }, callbacks);
  const afterReplay = await prisma.world.findUnique({ where: { id: worldId } });

  console.log(JSON.stringify({
    firstState: first.maintenance.state,
    replayState: replay.maintenance.state,
    secondState: second.maintenance.state,
    contentRevision: afterReplay.contentRevision,
    storedSummary: JSON.parse(afterReplay.structureJson).profile.summary,
    firstBackground,
    firstBindingSupport,
    receiptCount: await prisma.worldMaintenanceCommitReceipt.count(),
    operationCount: await prisma.worldMaintenanceOperation.count(),
    ragJobCount: await prisma.ragIndexJob.count(),
  }));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exitCode = 1;
});
