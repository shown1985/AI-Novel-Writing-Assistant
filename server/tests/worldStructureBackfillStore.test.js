const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const {
  applyRuntimeMigrationsToDatabase,
} = require("../dist/db/runtimeMigrations.js");
const {
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillStore,
  WorldStructureBackfillStoreError,
} = require("../dist/services/world/backfill/index.js");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteMigrationsDir = path.join(prismaRoot, "migrations.sqlite");
const newMigrationName = "20260923120000_world_structure_backfill_store";

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

function runStoreWorker(databasePath, method, input) {
  const workerSource = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { PrismaClient } = require(workerData.prismaClientPath);
    const { PrismaBetterSqlite3 } = require(workerData.sqliteAdapterPath);
    const { createWorldStructureBackfillStore } = require(workerData.modulePath);

    (async () => {
      const client = new PrismaClient({
        adapter: new PrismaBetterSqlite3({ url: "file:" + workerData.databasePath, timeout: 15000 }),
      });
      try {
        const store = createWorldStructureBackfillStore(client);
        const value = await store[workerData.method](workerData.input);
        parentPort.postMessage({
          ok: true,
          operationId: value.operation?.operationId ?? value.state?.operation.operationId ?? null,
          operationRecordId: value.operation?.id ?? value.state?.operation.id ?? null,
          status: value.operation?.status ?? value.state?.operation.status ?? null,
          acquired: value.acquired ?? null,
          requestHash: value.operation?.requestHash ?? null,
        });
      } catch (error) {
        parentPort.postMessage({
          ok: false,
          error: { code: error?.code ?? null, message: error?.message ?? String(error) },
        });
      } finally {
        await client.$disconnect();
      }
    })().catch((error) => {
      parentPort.postMessage({ ok: false, error: { code: error?.code ?? null, message: error?.message ?? String(error) } });
    });
  `;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        databasePath,
        method,
        input,
        prismaClientPath: require.resolve("@prisma/client"),
        sqliteAdapterPath: require.resolve("@prisma/adapter-better-sqlite3"),
        modulePath: path.join(__dirname, "..", "dist", "services", "world", "backfill", "index.js"),
      },
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message.ok) {
        resolve(message);
      } else {
        const error = new Error(message.error.message);
        error.code = message.error.code;
        reject(error);
      }
    });
    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Store worker exited with code ${code}.`));
      }
    });
  });
}

function createWorldStructureBackfillRequest(overrides = {}) {
  return {
    worldId: "world-backfill-store-1",
    operationId: "operation-1",
    baseContentRevision: 1,
    promptId: "world.structure.backfill",
    promptVersion: "v1",
    provider: null,
    model: null,
    generationPolicyVersion: "structure-backfill-policy-v1",
    sourceDigest: "source-digest-1",
    ...overrides,
  };
}

function createIsolatedFixture() {
  const tempDir = fs.mkdtempSync("/tmp/ai-novel-s3-02b3a-");
  const databasePath = path.join(tempDir, "fixture.db");
  const historicalMigrationsPath = path.join(tempDir, "migrations-before-store");
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
  const insertWorld = rawDatabase.prepare(
    `INSERT INTO "World" (
       "id", "name", "description", "status", "version", "contentRevision",
       "structureJson", "bindingSupportJson", "createdAt", "updatedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertWorld.run(
    "world-backfill-store-1",
    "Before migration world",
    "Stored world content",
    "draft",
    8,
    3,
    "{\"structure\":\"preserve\"}",
    "{\"support\":\"preserve\"}",
    "2026-09-23T12:00:00.000Z",
    "2026-09-23T12:00:00.000Z",
  );
  insertWorld.run(
    "world-backfill-store-2",
    "Second world",
    "Second world content",
    "draft",
    2,
    1,
    null,
    null,
    "2026-09-23T12:00:00.000Z",
    "2026-09-23T12:00:00.000Z",
  );
  const worldSnapshotBefore = rawDatabase.prepare(
    `SELECT "id", "name", "description", "version", "contentRevision",
            "structureJson", "bindingSupportJson", "createdAt", "updatedAt"
     FROM "World" ORDER BY "id"`,
  ).all();
  const worldCountBefore = rawDatabase.prepare('SELECT COUNT(*) AS count FROM "World"').get().count;

  rawDatabase.exec(fs.readFileSync(
    path.join(sqliteMigrationsDir, newMigrationName, "migration.sql"),
    "utf8",
  ));
  assert.deepEqual(
    rawDatabase.prepare(
      `SELECT "id", "name", "description", "version", "contentRevision",
              "structureJson", "bindingSupportJson", "createdAt", "updatedAt"
       FROM "World" ORDER BY "id"`,
    ).all(),
    worldSnapshotBefore,
  );
  assert.equal(rawDatabase.prepare('SELECT COUNT(*) AS count FROM "World"').get().count, worldCountBefore);
  assert.equal(rawDatabase.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(rawDatabase.pragma("foreign_key_check"), []);
  rawDatabase.close();

  const clientA = createPrisma(databasePath);
  const clientB = createPrisma(databasePath);
  return {
    clientA,
    clientB,
    databasePath,
    tempDir,
    worldCountBefore,
    worldSnapshotBefore,
  };
}

function expectStoreError(code) {
  return (error) => error instanceof WorldStructureBackfillStoreError && error.code === code;
}

test("world structure backfill store persists claims and normalized results within its owned boundary", async (t) => {
  const fixture = createIsolatedFixture();
  const { clientA, clientB, databasePath, tempDir } = fixture;
  const storeA = createWorldStructureBackfillStore(clientA);
  const storeB = createWorldStructureBackfillStore(clientB);

  try {
    await t.test("both schemas and incremental migrations have matching store contracts", () => {
      const postgresSchema = read("schema.prisma");
      const sqliteSchema = read("schema.sqlite.prisma");
      const postgresMigration = read(path.join("migrations", newMigrationName, "migration.sql"));
      const sqliteMigration = read(path.join("migrations.sqlite", newMigrationName, "migration.sql"));
      const modelNames = ["WorldStructureBackfillOperation", "WorldStructureBackfillResult"];
      const expectedOperationColumns = [
        "id", "worldId", "operationId", "requestHash", "baseContentRevision", "promptId", "promptVersion",
        "provider", "model", "generationPolicyVersion", "sourceDigest", "status", "leaseExpiresAt",
        "modelRequestId", "modelAttemptId", "createdAt", "updatedAt",
      ];
      const expectedResultColumns = [
        "id", "operationRecordId", "normalizedStructureJson", "bindingSupportJson", "baseContentRevision",
        "requestHash", "generationPolicyVersion", "digest", "modelRequestId", "modelAttemptId", "createdAt",
      ];

      for (const modelName of modelNames) {
        const postgresModel = getModelBody(postgresSchema, modelName).trim();
        const sqliteModel = getModelBody(sqliteSchema, modelName).trim();
        assert.notEqual(postgresModel, "", `${modelName} must exist in schema.prisma`);
        assert.equal(sqliteModel, postgresModel, `${modelName} must match between Prisma schemas`);
      }
      assert.match(getModelBody(postgresSchema, "World"), /structureBackfillOperations\s+WorldStructureBackfillOperation\[\]/);
      assert.match(getModelBody(sqliteSchema, "World"), /structureBackfillOperations\s+WorldStructureBackfillOperation\[\]/);

      for (const migration of [postgresMigration, sqliteMigration]) {
        const operationTable = getSqlTableBody(migration, "WorldStructureBackfillOperation");
        const resultTable = getSqlTableBody(migration, "WorldStructureBackfillResult");
        assert.notEqual(operationTable, "");
        assert.notEqual(resultTable, "");
        assert.deepEqual(getSqlColumnNames(operationTable), expectedOperationColumns);
        assert.deepEqual(getSqlColumnNames(resultTable), expectedResultColumns);
        assert.match(migration, /WorldStructureBackfillOperation_worldId_operationId_key/);
        assert.match(migration, /WorldStructureBackfillResult_operationRecordId_key/);
        assert.match(migration, /WorldStructureBackfillOperation_worldId_fkey/);
        assert.match(migration, /WorldStructureBackfillResult_operationRecordId_fkey/);
        assert.doesNotMatch(migration, /FOREIGN KEY\s*\("model(?:Request|Attempt)Id"\)/);
      }

      const rawDatabase = new Database(databasePath, { readonly: true });
      try {
        const operationIndexes = new Set(rawDatabase.prepare(
          'PRAGMA index_list("WorldStructureBackfillOperation")',
        ).all().map((index) => index.name));
        const resultIndexes = new Set(rawDatabase.prepare(
          'PRAGMA index_list("WorldStructureBackfillResult")',
        ).all().map((index) => index.name));
        assert.equal(operationIndexes.has("WorldStructureBackfillOperation_worldId_operationId_key"), true);
        assert.equal(operationIndexes.has("WorldStructureBackfillOperation_worldId_updatedAt_idx"), true);
        assert.equal(resultIndexes.has("WorldStructureBackfillResult_operationRecordId_key"), true);
        const operationForeignKeys = rawDatabase.prepare(
          'PRAGMA foreign_key_list("WorldStructureBackfillOperation")',
        ).all();
        const resultForeignKeys = rawDatabase.prepare(
          'PRAGMA foreign_key_list("WorldStructureBackfillResult")',
        ).all();
        assert.deepEqual(operationForeignKeys.map((key) => [key.table, key.from, key.to, key.on_delete]), [
          ["World", "worldId", "id", "CASCADE"],
        ]);
        assert.deepEqual(resultForeignKeys.map((key) => [key.table, key.from, key.to, key.on_delete]), [
          ["WorldStructureBackfillOperation", "operationRecordId", "id", "CASCADE"],
        ]);
      } finally {
        rawDatabase.close();
      }
    });

    await t.test("request hashing follows the fixed frozen field set", () => {
      const input = createWorldStructureBackfillRequest();
      const hash = createWorldStructureBackfillRequestHash(input);
      assert.equal(
        createWorldStructureBackfillRequestHash({
          sourceDigest: input.sourceDigest,
          generationPolicyVersion: input.generationPolicyVersion,
          model: input.model,
          provider: input.provider,
          promptVersion: input.promptVersion,
          promptId: input.promptId,
          baseContentRevision: input.baseContentRevision,
          worldId: input.worldId,
          operationId: "a-different-operation-id",
          httpRetryId: "retry-2",
          createdAt: new Date("2026-09-24T00:00:00.000Z"),
        }),
        hash,
      );
      assert.equal(createWorldStructureBackfillRequestHash({ ...input, provider: undefined, model: undefined }), hash);

      const changedFields = [
        { worldId: "world-other" },
        { baseContentRevision: 2 },
        { promptId: "world.structure.backfill.other" },
        { promptVersion: "v2" },
        { provider: "provider-other" },
        { model: "model-other" },
        { generationPolicyVersion: "structure-backfill-policy-v2" },
        { sourceDigest: "source-digest-other" },
      ];
      for (const change of changedFields) {
        assert.notEqual(
          createWorldStructureBackfillRequestHash({ ...input, ...change }),
          hash,
          `changing ${Object.keys(change)[0]} must change the request hash`,
        );
      }
    });

    await t.test("concurrent claims share one operation and a changed frozen request is rejected", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "concurrent-claim" });
      const [claimA, claimB] = await Promise.all([
        runStoreWorker(databasePath, "claim", input),
        runStoreWorker(databasePath, "claim", input),
      ]);
      assert.equal(claimA.operationRecordId, claimB.operationRecordId);
      assert.equal(claimA.status, "model_not_called");
      assert.equal(claimA.requestHash, claimB.requestHash);
      assert.equal(await clientA.worldStructureBackfillOperation.count({
        where: { worldId: input.worldId, operationId: input.operationId },
      }), 1);
      await assert.rejects(
        storeB.claim({ ...input, generationPolicyVersion: "structure-backfill-policy-v2" }),
        expectStoreError("OPERATION_ID_REUSED"),
      );
      assert.equal((await storeA.read(input.worldId, input.operationId)).operation.requestHash, claimA.requestHash);
    });

    await t.test("two database connections compete for one model-start transition", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "concurrent-start" });
      await storeA.claim(input);
      const startInput = {
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        modelRequestId: "model-request-concurrent",
        modelAttemptId: "model-attempt-concurrent",
      };
      const starts = await Promise.all([
        runStoreWorker(databasePath, "startModel", startInput),
        runStoreWorker(databasePath, "startModel", startInput),
      ]);
      assert.equal(starts.filter((start) => start.acquired).length, 1);
      assert.equal(starts.filter((start) => !start.acquired).length, 1);
      assert.equal((await storeA.read(input.worldId, input.operationId)).operation.status, "model_in_flight");
    });

    await t.test("result persistence is atomic, replayable across connections, and digest guarded", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "result-replay" });
      const normalizedStructure = {
        profile: { summary: "A durable summary", identity: "A border world" },
        factions: [{ id: "faction-1", name: "The council" }],
      };
      const bindingSupport = {
        supportedFields: ["profile.summary", "factions"],
        sourceDigest: input.sourceDigest,
      };
      await storeA.claim(input);
      await assert.rejects(
        storeA.persistResult({ ...input, normalizedStructure, bindingSupport }),
        expectStoreError("INVALID_STATE"),
      );

      const started = await storeA.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });
      assert.equal(started.acquired, true);
      await assert.rejects(
        storeA.persistResult({
          ...input,
          generationPolicyVersion: "structure-backfill-policy-mismatch",
          normalizedStructure,
          bindingSupport,
        }),
        expectStoreError("OPERATION_ID_REUSED"),
      );
      const persisted = await storeA.persistResult({ ...input, normalizedStructure, bindingSupport });
      assert.equal(persisted.operation.status, "model_succeeded_pending_commit");
      assert.equal(persisted.operation.leaseExpiresAt, null);
      assert.equal(persisted.result.normalizedStructure.profile.summary, "A durable summary");
      assert.equal(persisted.result.bindingSupport.supportedFields.length, 2);

      const replayed = await storeB.read(input.worldId, input.operationId);
      assert.equal(replayed.result.id, persisted.result.id);
      assert.equal(replayed.result.digest, persisted.result.digest);
      assert.deepEqual(replayed.result.normalizedStructure, normalizedStructure);
      assert.deepEqual(replayed.result.bindingSupport, bindingSupport);
      const claimedAgain = await storeB.claim(input);
      assert.equal(claimedAgain.operation.id, persisted.operation.id);
      assert.equal(claimedAgain.result.id, persisted.result.id);

      const reorderedResult = await storeB.persistResult({
        ...input,
        normalizedStructure: {
          factions: [{ name: "The council", id: "faction-1" }],
          profile: { identity: "A border world", summary: "A durable summary" },
        },
        bindingSupport: { sourceDigest: input.sourceDigest, supportedFields: ["profile.summary", "factions"] },
      });
      assert.equal(reorderedResult.result.id, persisted.result.id);
      await assert.rejects(
        storeB.persistResult({
          ...input,
          normalizedStructure: { profile: { summary: "A different result" } },
          bindingSupport,
        }),
        expectStoreError("RESULT_DIGEST_CONFLICT"),
      );
      assert.equal(await clientA.worldStructureBackfillResult.count({
        where: { operationRecordId: persisted.operation.id },
      }), 1);
    });

    await t.test("model attempt references are optional but must match the operation", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "matched-attempt-references" });
      const modelReferences = {
        modelRequestId: "request-ref-1",
        modelAttemptId: "attempt-ref-1",
      };
      await storeA.claim(input);
      await storeA.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        ...modelReferences,
      });
      await assert.rejects(
        storeB.startModel({
          worldId: input.worldId,
          operationId: input.operationId,
          leaseExpiresAt: new Date(Date.now() + 60_000),
        }),
        expectStoreError("MODEL_REFERENCE_MISMATCH"),
      );
      await assert.rejects(
        storeB.persistResult({
          ...input,
          normalizedStructure: { profile: { summary: "Omitted references" } },
          bindingSupport: {},
        }),
        expectStoreError("MODEL_REFERENCE_MISMATCH"),
      );
      await assert.rejects(
        storeA.persistResult({
          ...input,
          normalizedStructure: { profile: { summary: "Wrong attempt" } },
          bindingSupport: {},
          ...modelReferences,
          modelAttemptId: "attempt-ref-mismatch",
        }),
        expectStoreError("MODEL_REFERENCE_MISMATCH"),
      );
      const saved = await storeB.persistResult({
        ...input,
        normalizedStructure: { profile: { summary: "Matching attempt" } },
        bindingSupport: {},
        ...modelReferences,
      });
      assert.equal(saved.result.modelRequestId, modelReferences.modelRequestId);
      assert.equal(saved.result.modelAttemptId, modelReferences.modelAttemptId);
    });

    await t.test("an expired lease can only move to unknown and cannot be reclaimed", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "expired-lease" });
      const now = new Date("2026-09-24T00:00:00.000Z");
      const modelReferences = {
        modelRequestId: "request-ref-expired",
        modelAttemptId: "attempt-ref-expired",
      };
      await storeA.claim(input);
      await storeA.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(now.getTime() - 1),
        ...modelReferences,
      });
      const notExpiredYet = await storeB.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "lease_expired",
        now: new Date(now.getTime() - 2),
      });
      assert.equal(notExpiredYet.changed, false);
      assert.equal(notExpiredYet.state.operation.status, "model_in_flight");
      const marked = await storeB.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "lease_expired",
        now,
      });
      assert.equal(marked.changed, true);
      assert.equal(marked.state.operation.status, "model_unknown");
      const replayed = await storeA.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "lease_expired",
        now,
      });
      assert.equal(replayed.changed, false);
      assert.equal(replayed.state.operation.status, "model_unknown");
      const noReclaim = await storeB.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        ...modelReferences,
      });
      assert.equal(noReclaim.acquired, false);
      assert.equal(noReclaim.operation.status, "model_unknown");
      await assert.rejects(
        storeA.persistResult({
          ...input,
          normalizedStructure: { profile: { summary: "Late result" } },
          bindingSupport: {},
          ...modelReferences,
        }),
        expectStoreError("INVALID_STATE"),
      );
      assert.equal(await clientA.worldStructureBackfillResult.count({
        where: { operationRecordId: marked.state.operation.id },
      }), 0);
    });

    await t.test("an unknown provider result can be marked immediately without lease expiry", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "unknown-provider-result" });
      const leaseExpiresAt = new Date(Date.now() + 60_000);
      await storeA.claim(input);
      await storeA.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt,
      });
      const marked = await storeB.markUnknown({
        worldId: input.worldId,
        operationId: input.operationId,
        reason: "unknown_result",
        now: new Date(),
      });
      assert.equal(marked.changed, true);
      assert.equal(marked.state.operation.status, "model_unknown");
      assert.equal(marked.state.operation.leaseExpiresAt.getTime(), leaseExpiresAt.getTime());
      const noReclaim = await storeA.startModel({
        worldId: input.worldId,
        operationId: input.operationId,
        leaseExpiresAt: new Date(Date.now() + 120_000),
      });
      assert.equal(noReclaim.acquired, false);
      assert.equal(noReclaim.operation.status, "model_unknown");
    });

    await t.test("world scoping blocks unknown and cross-world operations without changing world content", async () => {
      const input = createWorldStructureBackfillRequest({ operationId: "world-scoped-operation" });
      await assert.rejects(
        storeA.claim({ ...input, worldId: "missing-world" }),
        expectStoreError("WORLD_NOT_FOUND"),
      );
      await storeA.claim(input);
      assert.equal(await storeB.read("world-backfill-store-2", input.operationId), null);
      await assert.rejects(
        storeB.startModel({
          worldId: "world-backfill-store-2",
          operationId: input.operationId,
          leaseExpiresAt: new Date(Date.now() + 60_000),
        }),
        expectStoreError("OPERATION_NOT_FOUND"),
      );
      await assert.rejects(
        storeB.persistResult({
          ...input,
          worldId: "world-backfill-store-2",
          normalizedStructure: { profile: { summary: "Wrong world" } },
          bindingSupport: {},
        }),
        expectStoreError("OPERATION_NOT_FOUND"),
      );
      assert.equal(await clientA.worldStructureBackfillResult.count(), 2);
      const currentWorldRows = await clientA.world.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          version: true,
          contentRevision: true,
          structureJson: true,
          bindingSupportJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      assert.deepEqual(currentWorldRows, fixture.worldSnapshotBefore.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      })));
      assert.equal(currentWorldRows.length, fixture.worldCountBefore);
    });
  } finally {
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
