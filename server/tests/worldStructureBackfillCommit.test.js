const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const {
  applyRuntimeMigrationsToDatabase,
} = require("../dist/db/runtimeMigrations.js");
const {
  createWorldStructureBackfillCommitService,
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillResultDigest,
  createWorldStructureBackfillStore,
  WorldStructureBackfillStoreError,
} = require("../dist/services/world/backfill/index.js");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteMigrationsDir = path.join(prismaRoot, "migrations.sqlite");
const newMigrationName = "20260924120000_world_structure_backfill_commit";

function read(relativePath) {
  return fs.readFileSync(path.join(prismaRoot, relativePath), "utf8");
}

function getModelBody(schema, modelName) {
  const escapedModelName = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return schema.match(new RegExp(`^model ${escapedModelName}\\s*\\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
}

function getSqlTableBody(sql, tableName) {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql.match(new RegExp(`CREATE TABLE "${escapedTableName}" \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

function getSqlColumnNames(tableBody) {
  return Array.from(tableBody.matchAll(/^\s*"([^"]+)"\s+/gm)).map((match) => match[1]);
}

function listMigrationNames(migrationsDir) {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function createPrisma(databasePath) {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}`, timeout: 15000 }),
  });
}

function createValidStructure(summary = "Saved structure summary") {
  return {
    profile: {
      summary,
      identity: "A border world",
      tone: "Restrained",
      themes: ["choice"],
      coreConflict: "Two forces contest the border.",
    },
    rules: {
      summary: "Power has a cost.",
      axioms: [],
      taboo: [],
      sharedConsequences: [],
    },
    factions: [],
    forces: [
      {
        id: "force-1",
        name: "Border Guard",
        type: "military",
        factionId: null,
        resources: ["wall"],
        controlledLocationIds: ["location-1"],
        summary: "Protects the border.",
        baseOfPower: "the garrison",
        currentObjective: "Keep order",
        pressure: "Limited troops",
        leader: null,
        narrativeRole: "gatekeeper",
      },
    ],
    locations: [
      {
        id: "location-1",
        name: "North Gate",
        type: "border",
        region: "North",
        terrain: "stone wall",
        summary: "A border crossing.",
        narrativeFunction: "entry point",
        risk: "can be besieged",
        riskLevel: 2,
        storyRelevance: "the first crossing",
        entryConstraint: "a permit is required",
        exitCost: "supplies",
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
      seededFrom: "backfill-commit-test",
      lastBackfilledAt: null,
      lastGeneratedAt: null,
      lastSectionGenerated: null,
    },
  };
}

function createValidBindingSupport() {
  return {
    recommendedEntryPoints: ["North Gate"],
    highPressureForces: ["Border Guard"],
    suggestedLocationClusters: [
      { id: "cluster-1", label: "Northern crossing", locationIds: ["location-1"], reason: "Shared access" },
    ],
    compatibleConflicts: ["Order vs. change"],
    forbiddenCombinations: [],
  };
}

function expectStoreError(code) {
  return (error) => error instanceof WorldStructureBackfillStoreError && error.code === code;
}

function createIsolatedFixture() {
  const tempDir = fs.mkdtempSync("/tmp/ai-novel-s3-02b3b1-");
  const databasePath = path.join(tempDir, "fixture.db");
  const historicalMigrationsPath = path.join(tempDir, "migrations-before-commit");
  fs.mkdirSync(historicalMigrationsPath, { recursive: true });

  for (const migrationName of listMigrationNames(sqliteMigrationsDir)) {
    if (migrationName === newMigrationName) {
      continue;
    }
    const targetDirectory = path.join(historicalMigrationsPath, migrationName);
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(sqliteMigrationsDir, migrationName, "migration.sql"),
      path.join(targetDirectory, "migration.sql"),
    );
  }

  const rawDatabase = new Database(databasePath);
  applyRuntimeMigrationsToDatabase(rawDatabase, historicalMigrationsPath);
  rawDatabase.prepare(
    `INSERT INTO "World" (
       "id", "name", "status", "version", "contentRevision", "structureSchemaVersion", "createdAt", "updatedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "world-backfill-commit-1",
    "Before backfill commit",
    "draft",
    7,
    3,
    1,
    "2026-09-24T12:00:00.000Z",
    "2026-09-24T12:00:00.000Z",
  );
  rawDatabase.prepare(
    `INSERT INTO "WorldMaintenanceOperation" (
       "id", "targetType", "targetId", "operationType", "operationId", "requestHash", "status", "createdAt", "updatedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "manual-operation-record-1",
    "world",
    "world-backfill-commit-1",
    "commit_world_sample",
    "manual-operation-1",
    "manual-request-hash",
    "committed",
    "2026-09-24T12:00:00.000Z",
    "2026-09-24T12:00:00.000Z",
  );
  rawDatabase.prepare(
    `INSERT INTO "WorldMaintenanceCommitReceipt" (
       "id", "operationRecordId", "targetType", "targetId", "baseRevision", "committedRevision",
       "decisionRevision", "selectedPatchIdsJson", "beforeDigest", "afterDigest", "committedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "manual-receipt-1",
    "manual-operation-record-1",
    "world",
    "world-backfill-commit-1",
    2,
    3,
    0,
    "[\"patch-1\"]",
    "before-manual",
    "after-manual",
    "2026-09-24T12:00:00.000Z",
  );

  const worldBefore = rawDatabase.prepare(
    `SELECT * FROM "World" WHERE "id" = ?`,
  ).get("world-backfill-commit-1");
  const manualOperationBefore = rawDatabase.prepare(
    `SELECT * FROM "WorldMaintenanceOperation" WHERE "id" = ?`,
  ).get("manual-operation-record-1");
  const manualReceiptBefore = rawDatabase.prepare(
    `SELECT * FROM "WorldMaintenanceCommitReceipt" WHERE "id" = ?`,
  ).get("manual-receipt-1");

  rawDatabase.exec(fs.readFileSync(
    path.join(sqliteMigrationsDir, newMigrationName, "migration.sql"),
    "utf8",
  ));
  assert.deepEqual(
    rawDatabase.prepare(`SELECT * FROM "World" WHERE "id" = ?`).get("world-backfill-commit-1"),
    worldBefore,
  );
  assert.deepEqual(
    rawDatabase.prepare(`SELECT * FROM "WorldMaintenanceOperation" WHERE "id" = ?`).get("manual-operation-record-1"),
    manualOperationBefore,
  );
  assert.deepEqual(
    rawDatabase.prepare(`SELECT * FROM "WorldMaintenanceCommitReceipt" WHERE "id" = ?`).get("manual-receipt-1"),
    manualReceiptBefore,
  );
  assert.equal(rawDatabase.prepare('SELECT COUNT(*) AS count FROM "WorldStructureBackfillCommitReceipt"').get().count, 0);
  assert.equal(rawDatabase.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(rawDatabase.pragma("foreign_key_check"), []);
  rawDatabase.close();

  return {
    clientA: createPrisma(databasePath),
    clientB: createPrisma(databasePath),
    databasePath,
    tempDir,
  };
}

async function seedWorld(client, overrides = {}) {
  return client.world.update({
    where: { id: "world-backfill-commit-1" },
    data: {
      description: "Author description",
      worldType: "fantasy",
      templateKey: "borderlands",
      axioms: "author axioms",
      background: "author background",
      geography: "author geography",
      cultures: "author cultures",
      magicSystem: "author magic",
      politics: "author politics",
      races: "author races",
      religions: "author religions",
      technology: "author technology",
      conflicts: "author conflicts",
      history: "author history",
      economy: "author economy",
      factions: "author factions",
      selectedDimensions: "author dimensions",
      selectedElements: "author elements",
      layerStates: "author layer states",
      overviewSummary: "author overview",
      structureJson: JSON.stringify(createValidStructure("Old structure")),
      bindingSupportJson: JSON.stringify(createValidBindingSupport()),
      ...overrides,
    },
  });
}

function createRequest(worldId, operationId, baseContentRevision, overrides = {}) {
  return {
    worldId,
    operationId,
    baseContentRevision,
    promptId: "world.structure.backfill",
    promptVersion: "v1",
    provider: "provider-test",
    model: "model-test",
    generationPolicyVersion: "structure-backfill-policy-v1",
    sourceDigest: `source-${operationId}`,
    ...overrides,
  };
}

async function persistResult(client, worldId, operationId, options = {}) {
  const world = await client.world.findUnique({ where: { id: worldId } });
  const request = createRequest(worldId, operationId, world.contentRevision, options.requestOverrides);
  const modelRefs = {
    modelRequestId: `request-${operationId}`,
    modelAttemptId: `attempt-${operationId}`,
  };
  const store = createWorldStructureBackfillStore(client);
  await store.claim(request);
  await store.startModel({
    worldId,
    operationId,
    leaseExpiresAt: new Date(Date.now() + 60_000),
    ...modelRefs,
  });
  const normalizedStructure = options.normalizedStructure ?? createValidStructure();
  const bindingSupport = options.bindingSupport ?? createValidBindingSupport();
  const persisted = await store.persistResult({
    ...request,
    ...modelRefs,
    normalizedStructure,
    bindingSupport,
  });
  return { request, modelRefs, persisted, normalizedStructure, bindingSupport };
}

test("backfill commit stores a dedicated receipt and commits only a verified persisted result", async (t) => {
  const fixture = createIsolatedFixture();
  const { tempDir, databasePath } = fixture;
  let clientA = fixture.clientA;
  let clientB = fixture.clientB;
  let clientC;
  let commitA = createWorldStructureBackfillCommitService(clientA);
  let commitB = createWorldStructureBackfillCommitService(clientB);

  try {
    const initialWorld = await seedWorld(clientA);
    await t.test("both schemas and the incremental migrations define the dedicated one-to-one receipt", () => {
      const postgresSchema = read("schema.prisma");
      const sqliteSchema = read("schema.sqlite.prisma");
      const postgresMigration = read(path.join("migrations", newMigrationName, "migration.sql"));
      const sqliteMigration = read(path.join("migrations.sqlite", newMigrationName, "migration.sql"));
      const receiptModel = getModelBody(postgresSchema, "WorldStructureBackfillCommitReceipt").trim();
      const receiptColumns = [
        "id", "operationRecordId", "worldId", "operationId", "resultDigest", "baseContentRevision",
        "committedRevision", "beforeDigest", "afterDigest", "committedAt",
      ];

      assert.notEqual(receiptModel, "");
      assert.equal(getModelBody(sqliteSchema, "WorldStructureBackfillCommitReceipt").trim(), receiptModel);
      assert.equal(
        getModelBody(postgresSchema, "WorldStructureBackfillOperation").trim(),
        getModelBody(sqliteSchema, "WorldStructureBackfillOperation").trim(),
      );
      assert.match(getModelBody(postgresSchema, "WorldStructureBackfillOperation"), /commitReceipt\s+WorldStructureBackfillCommitReceipt\?/);
      assert.match(getModelBody(sqliteSchema, "WorldStructureBackfillOperation"), /commitReceipt\s+WorldStructureBackfillCommitReceipt\?/);

      for (const migration of [postgresMigration, sqliteMigration]) {
        const receiptTable = getSqlTableBody(migration, "WorldStructureBackfillCommitReceipt");
        assert.deepEqual(getSqlColumnNames(receiptTable), receiptColumns);
        assert.match(migration, /WorldStructureBackfillCommitReceipt_operationRecordId_key/);
        assert.match(migration, /WorldStructureBackfillCommitReceipt_operationRecordId_fkey/);
        assert.match(migration, /REFERENCES "WorldStructureBackfillOperation"/);
        assert.doesNotMatch(migration, /WorldMaintenanceCommitReceipt/);
      }

      const rawDatabase = new Database(databasePath, { readonly: true });
      try {
        const receiptIndexes = new Set(rawDatabase.pragma('index_list("WorldStructureBackfillCommitReceipt")').map((index) => index.name));
        assert.equal(receiptIndexes.has("WorldStructureBackfillCommitReceipt_operationRecordId_key"), true);
        const receiptForeignKeys = rawDatabase.pragma('foreign_key_list("WorldStructureBackfillCommitReceipt")');
        assert.deepEqual(receiptForeignKeys.map((key) => [key.table, key.from, key.to, key.on_delete]), [
          ["WorldStructureBackfillOperation", "operationRecordId", "id", "CASCADE"],
        ]);
        assert.equal(rawDatabase.prepare('SELECT COUNT(*) AS count FROM "WorldMaintenanceCommitReceipt"').get().count, 1);
        assert.equal(rawDatabase.prepare('SELECT COUNT(*) AS count FROM "WorldStructureBackfillCommitReceipt"').get().count, 0);
      } finally {
        rawDatabase.close();
      }
    });

    await t.test("two SQLite connections commit one pending result exactly once", async () => {
      const ready = await persistResult(clientA, initialWorld.id, "concurrent-commit");
      const concurrentResults = await Promise.allSettled([
        commitA.commitPersistedResult(initialWorld.id, ready.request.operationId),
        commitB.commitPersistedResult(initialWorld.id, ready.request.operationId),
      ]);
      assert.deepEqual(concurrentResults.map((result) => result.status), ["fulfilled", "fulfilled"]);
      const [outcomeA, outcomeB] = concurrentResults.map((result) => result.value);
      const outcomes = [outcomeA, outcomeB];
      assert.deepEqual(outcomes.map((outcome) => outcome.kind).sort(), ["committed", "replayed"]);
      assert.equal(outcomeA.outcome.receipt.id, outcomeB.outcome.receipt.id);
      assert.deepEqual(outcomeA.outcome.result, outcomeB.outcome.result);
      assert.equal(outcomeA.outcome.receipt.resultDigest, ready.persisted.result.digest);
      assert.equal(outcomeA.outcome.receipt.baseContentRevision, initialWorld.contentRevision);
      assert.equal(outcomeA.outcome.receipt.committedRevision, initialWorld.contentRevision + 1);
      assert.match(outcomeA.outcome.receipt.beforeDigest, /^[a-f0-9]{64}$/);
      assert.match(outcomeA.outcome.receipt.afterDigest, /^[a-f0-9]{64}$/);
      assert.notEqual(outcomeA.outcome.receipt.beforeDigest, outcomeA.outcome.receipt.afterDigest);

      const committedWorld = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      assert.equal(committedWorld.contentRevision, initialWorld.contentRevision + 1);
      assert.equal(committedWorld.version, initialWorld.version);
      assert.equal(committedWorld.name, initialWorld.name);
      assert.equal(committedWorld.status, initialWorld.status);
      assert.equal(committedWorld.races, initialWorld.races);
      assert.equal(committedWorld.religions, initialWorld.religions);
      assert.equal(committedWorld.technology, initialWorld.technology);
      assert.equal(committedWorld.selectedDimensions, initialWorld.selectedDimensions);
      assert.equal(committedWorld.selectedElements, initialWorld.selectedElements);
      assert.equal(committedWorld.description, ready.normalizedStructure.profile.summary);
      assert.equal(JSON.parse(committedWorld.structureJson).profile.summary, ready.normalizedStructure.profile.summary);
      assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
        where: { operationRecordId: ready.persisted.operation.id },
      }), 1);
      assert.equal(await clientA.worldMaintenanceCommitReceipt.count(), 1);
    });

    await t.test("a discarded response is recovered after reconnect from the durable receipt", async () => {
      const ready = await persistResult(clientA, initialWorld.id, "response-lost-commit");
      const baseRevision = ready.request.baseContentRevision;
      await commitA.commitPersistedResult(initialWorld.id, ready.request.operationId);

      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
      clientA = createPrisma(databasePath);
      clientB = createPrisma(databasePath);
      clientC = createPrisma(databasePath);
      commitA = createWorldStructureBackfillCommitService(clientA);
      commitB = createWorldStructureBackfillCommitService(clientB);
      const restartedCommit = createWorldStructureBackfillCommitService(clientC);
      const recovered = await restartedCommit.readCommitOutcome(initialWorld.id, ready.request.operationId);
      assert.equal(recovered.operation.status, "committed");
      assert.equal(recovered.receipt.resultDigest, ready.persisted.result.digest);
      assert.equal(recovered.result.id, ready.persisted.result.id);
      const replayed = await restartedCommit.commitPersistedResult(initialWorld.id, ready.request.operationId);
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.outcome.receipt.id, recovered.receipt.id);
      assert.equal(replayed.outcome.receipt.committedRevision, baseRevision + 1);
      assert.equal((await clientA.world.findUnique({ where: { id: initialWorld.id } })).contentRevision, baseRevision + 1);
    });

    await t.test("a changed world keeps its content and retains the original result without a receipt", async () => {
      const worldBefore = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      const ready = await persistResult(clientA, initialWorld.id, "revision-conflict");
      await clientB.world.update({
        where: { id: initialWorld.id },
        data: {
          contentRevision: { increment: 1 },
          name: "Author's newer world name",
          description: "Author's newer description",
          background: "Author's newer background",
        },
      });
      const authorWorld = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      const retained = await commitA.commitPersistedResult(initialWorld.id, ready.request.operationId);
      assert.equal(retained.kind, "conflict_result_retained");
      assert.equal(retained.outcome.operation.status, "conflict_result_retained");
      assert.equal(retained.outcome.receipt, null);
      assert.equal(retained.outcome.result.id, ready.persisted.result.id);
      assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
        where: { operationRecordId: ready.persisted.operation.id },
      }), 0);

      const afterAttempt = await clientB.world.findUnique({ where: { id: initialWorld.id } });
      assert.equal(afterAttempt.contentRevision, authorWorld.contentRevision);
      assert.equal(afterAttempt.name, authorWorld.name);
      assert.equal(afterAttempt.description, authorWorld.description);
      assert.equal(afterAttempt.background, authorWorld.background);
      assert.equal(afterAttempt.structureJson, authorWorld.structureJson);
      assert.equal(afterAttempt.bindingSupportJson, authorWorld.bindingSupportJson);
      assert.equal(await clientA.worldMaintenanceCommitReceipt.count(), 1);

      const replayedConflict = await commitB.commitPersistedResult(initialWorld.id, ready.request.operationId);
      assert.equal(replayedConflict.kind, "conflict_result_retained");
      assert.equal(replayedConflict.outcome.result.digest, retained.outcome.result.digest);
      assert.equal((await clientA.world.findUnique({ where: { id: initialWorld.id } })).contentRevision, worldBefore.contentRevision + 1);
    });

    await t.test("missing result, wrong world and non-pending status fail without terminalizing the operation", async () => {
      const world = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      const noResultInput = createRequest(initialWorld.id, "missing-persisted-result", world.contentRevision);
      const store = createWorldStructureBackfillStore(clientA);
      const noResultClaim = await store.claim(noResultInput);
      await store.startModel({
        worldId: initialWorld.id,
        operationId: noResultInput.operationId,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });
      await clientA.worldStructureBackfillOperation.update({
        where: { id: noResultClaim.operation.id },
        data: { status: "model_succeeded_pending_commit" },
      });
      await assert.rejects(
        commitA.commitPersistedResult("another-world", noResultInput.operationId),
        expectStoreError("OPERATION_NOT_FOUND"),
      );
      await assert.rejects(
        commitA.commitPersistedResult(initialWorld.id, noResultInput.operationId),
        expectStoreError("RESULT_NOT_FOUND"),
      );
      assert.equal((await store.read(initialWorld.id, noResultInput.operationId)).operation.status, "model_succeeded_pending_commit");
      assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
        where: { operationRecordId: noResultClaim.operation.id },
      }), 0);

      const wrongStatus = await persistResult(clientA, initialWorld.id, "wrong-commit-status");
      await clientA.worldStructureBackfillOperation.update({
        where: { id: wrongStatus.persisted.operation.id },
        data: { status: "model_in_flight" },
      });
      const worldBefore = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      await assert.rejects(
        commitA.commitPersistedResult(initialWorld.id, wrongStatus.request.operationId),
        expectStoreError("INVALID_STATE"),
      );
      assert.equal((await store.read(initialWorld.id, wrongStatus.request.operationId)).operation.status, "model_in_flight");
      assert.equal((await clientA.world.findUnique({ where: { id: initialWorld.id } })).contentRevision, worldBefore.contentRevision);
    });

    await t.test("frozen request, base revision, generation policy, model references and result digest are rechecked", async () => {
      const cases = [
        { operationId: "tampered-request-hash", field: "requestHash", value: "wrong-request-hash" },
        { operationId: "tampered-result-base", field: "baseContentRevision", value: 999 },
        { operationId: "tampered-generation-policy", field: "generationPolicyVersion", value: "wrong-policy" },
        { operationId: "tampered-model-reference", field: "modelAttemptId", value: "wrong-attempt" },
        { operationId: "tampered-result-digest", field: "digest", value: "wrong-digest" },
      ];
      for (const scenario of cases) {
        const ready = await persistResult(clientA, initialWorld.id, scenario.operationId);
        const worldBefore = await clientA.world.findUnique({ where: { id: initialWorld.id } });
        await clientA.worldStructureBackfillResult.update({
          where: { id: ready.persisted.result.id },
          data: { [scenario.field]: scenario.value },
        });
        await assert.rejects(
          commitA.commitPersistedResult(initialWorld.id, scenario.operationId),
          expectStoreError("RESULT_INTEGRITY_MISMATCH"),
        );
        assert.equal((await clientA.worldStructureBackfillOperation.findUnique({
          where: { id: ready.persisted.operation.id },
        })).status, "model_succeeded_pending_commit");
        const worldAfter = await clientA.world.findUnique({ where: { id: initialWorld.id } });
        assert.equal(worldAfter.contentRevision, worldBefore.contentRevision);
        assert.equal(worldAfter.structureJson, worldBefore.structureJson);
        assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
          where: { operationRecordId: ready.persisted.operation.id },
        }), 0);
      }

      const operationTampered = await persistResult(clientA, initialWorld.id, "tampered-operation-frozen-fields");
      await clientA.worldStructureBackfillOperation.update({
        where: { id: operationTampered.persisted.operation.id },
        data: { sourceDigest: "changed-source-digest" },
      });
      await assert.rejects(
        commitA.commitPersistedResult(initialWorld.id, operationTampered.request.operationId),
        expectStoreError("RESULT_INTEGRITY_MISMATCH"),
      );
    });

    await t.test("raw dangling references are rejected before normalizers can filter them", async () => {
      const invalidStructure = createValidStructure("Must remain unsaved");
      invalidStructure.relations.forceRelations = [
        { sourceForceId: "force-1", targetForceId: "missing-force", relation: "opposes", detail: "dangling" },
      ];
      const invalidClusterSupport = createValidBindingSupport();
      invalidClusterSupport.suggestedLocationClusters[0].locationIds = ["missing-location"];
      const cases = [
        { operationId: "dangling-force-relation", structure: invalidStructure, binding: createValidBindingSupport() },
        { operationId: "dangling-suggested-cluster", structure: createValidStructure(), binding: invalidClusterSupport },
      ];

      for (const scenario of cases) {
        const ready = await persistResult(clientA, initialWorld.id, scenario.operationId, {
          normalizedStructure: scenario.structure,
          bindingSupport: scenario.binding,
        });
        const worldBefore = await clientA.world.findUnique({ where: { id: initialWorld.id } });
        await assert.rejects(
          commitA.commitPersistedResult(initialWorld.id, scenario.operationId),
          (error) => error && error.code === "REFERENCE_INTEGRITY_VIOLATION",
        );
        assert.equal((await clientA.worldStructureBackfillOperation.findUnique({
          where: { id: ready.persisted.operation.id },
        })).status, "model_succeeded_pending_commit");
        const worldAfter = await clientA.world.findUnique({ where: { id: initialWorld.id } });
        assert.equal(worldAfter.contentRevision, worldBefore.contentRevision);
        assert.equal(worldAfter.structureJson, worldBefore.structureJson);
        assert.equal(worldAfter.bindingSupportJson, worldBefore.bindingSupportJson);
        assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
          where: { operationRecordId: ready.persisted.operation.id },
        }), 0);
      }
    });

    await t.test("an unknown transaction outcome without a durable receipt never reports a saved result", async () => {
      const ready = await persistResult(clientA, initialWorld.id, "unknown-transaction-outcome");
      const worldBefore = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      const unavailableCommitClient = new Proxy(clientA, {
        get(target, property) {
          if (property === "$transaction") {
            return async () => {
              throw new Error("simulated transaction transport loss before any write");
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const uncertainCommit = createWorldStructureBackfillCommitService(unavailableCommitClient);

      await assert.rejects(
        uncertainCommit.commitPersistedResult(initialWorld.id, ready.request.operationId),
        expectStoreError("COMMIT_RESULT_UNKNOWN"),
      );
      const current = await clientA.world.findUnique({ where: { id: initialWorld.id } });
      assert.equal(current.contentRevision, worldBefore.contentRevision);
      assert.equal(current.structureJson, worldBefore.structureJson);
      assert.equal((await clientA.worldStructureBackfillOperation.findUnique({
        where: { id: ready.persisted.operation.id },
      })).status, "model_succeeded_pending_commit");
      assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({
        where: { operationRecordId: ready.persisted.operation.id },
      }), 0);
    });

    await t.test("the stored result digest uses its canonical persisted JSON", async () => {
      const ready = await persistResult(clientA, initialWorld.id, "canonical-commit-digest");
      const canonical = createWorldStructureBackfillResultDigest(ready.normalizedStructure, ready.bindingSupport);
      assert.equal(ready.persisted.result.digest, canonical.digest);
      assert.equal(
        createWorldStructureBackfillRequestHash(ready.request),
        ready.persisted.operation.requestHash,
      );
      assert.equal(await createWorldStructureBackfillCommitService(clientB)
        .readCommitOutcome(initialWorld.id, ready.request.operationId)
        .then((outcome) => outcome.receipt), null);
    });
  } finally {
    const clients = [clientA, clientB, clientC].filter(Boolean);
    await Promise.all(clients.map((client) => client.$disconnect()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
