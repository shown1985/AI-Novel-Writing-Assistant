const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isMainThread, parentPort, Worker, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { applyRuntimeMigrationsToDatabase } = require("../dist/db/runtimeMigrations.js");
const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const attempts = require("../dist/platform/llm/provenance/index.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const {
  createWorldStructureBackfillCommitService,
  createWorldStructureBackfillGenerationService,
  createWorldStructureBackfillRunService,
  createWorldStructureBackfillStore,
  WORLD_STRUCTURE_BACKFILL_FAILURE_CATEGORIES,
  WorldStructureBackfillStoreError,
} = require("../dist/services/world/backfill/index.js");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteMigrationsDir = path.join(prismaRoot, "migrations.sqlite");
const newMigrationName = "20260926120000_world_structure_backfill_failure_category";
const ADD_COLUMN_SQL = 'ALTER TABLE "WorldStructureBackfillOperation" ADD COLUMN "failureCategory" TEXT;';
const PROVIDER = "openai";
const MODEL = "gpt-4o-mini";
const FIXED_NOW = new Date("2026-09-25T08:00:00.000Z");

function expectStoreError(code) {
  return (error) => error instanceof WorldStructureBackfillStoreError && error.code === code;
}

function createPrisma(databasePath) {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}`, timeout: 15000 }),
  });
}

function listMigrationNames(migrationsDir) {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function createFileFixture() {
  const tempDir = fs.mkdtempSync("/tmp/ai-novel-s3-02b3c1-");
  const databasePath = path.join(tempDir, "fixture.db");
  const rawDatabase = new Database(databasePath);
  applyRuntimeMigrationsToDatabase(rawDatabase, sqliteMigrationsDir);
  rawDatabase.close();
  return { tempDir, databasePath, clientA: createPrisma(databasePath), clientB: createPrisma(databasePath) };
}

async function seedWorld(client, id) {
  return client.world.create({
    data: {
      id,
      name: `世界 ${id}`,
      description: "边境上的两股势力争夺关口。",
      worldType: "fantasy",
      axioms: "力量必须付出代价。",
      geography: "北门是唯一的关口。",
      politics: "边境守军与商会对峙。",
      contentRevision: 4,
      version: 9,
    },
  });
}

function validOutput(summary = "边境世界") {
  return JSON.stringify({
    profile: { summary, identity: "边境", tone: "克制", themes: ["选择"], coreConflict: "两股势力争夺关口" },
    rules: { summary: "力量有代价", axioms: [], taboo: [], sharedConsequences: [] },
    factions: [],
    forces: [{ id: "force-1", name: "边境守军", type: "military", summary: "守卫边境" }],
    locations: [{ id: "location-1", name: "北门", terrain: "石墙", summary: "边境关口", controllingForceIds: ["force-1"] }],
    relations: { forceRelations: [], locationControls: [] },
  });
}

function jsonStream(content) {
  return (async function* () {
    yield { content };
  })();
}

class RecordingAttemptRepository {
  constructor() {
    this.rows = [];
  }

  async startAttempt(input) {
    this.rows.push({ ...input, status: "started", finalAdoption: "pending" });
  }

  async finalizeAttempt(input) {
    const row = this.rows.find((candidate) => candidate.attemptId === input.attemptId);
    if (row) Object.assign(row, input);
  }

  async findAttempt(attemptId) {
    return this.rows.find((row) => row.attemptId === attemptId) ?? null;
  }

  async reconstructRequest(requestId) {
    const rows = this.rows.filter((row) => row.requestId === requestId);
    return rows.length ? { requestId, attempts: rows, adoptedAttemptId: null } : null;
  }

  async findByNovelId() {
    return [];
  }
}

/** Mock provider; physical calls are counted at the provider `.stream()` layer. */
function installProvider(respond) {
  const originals = {
    resolveLLMClientOptions: factory.resolveLLMClientOptions,
    createLLMFromResolvedOptions: factory.createLLMFromResolvedOptions,
    getLLM: factory.getLLM,
    getStructuredFallbackSettings: structuredFallbackSettings.getStructuredFallbackSettings,
  };
  const harness = { calls: [], repairs: [], respond };
  attempts.setModelAttemptRepositoryForTests(new RecordingAttemptRepository());
  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? PROVIDER;
    const resolvedModel = options.model ?? MODEL;
    const baseURL = "https://api.openai.com/v1";
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-only-key",
      baseURL,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
      authMode: "bearer",
      requestProtocol: "chat_completions",
      executionMode: options.executionMode ?? "plain",
      structuredProfile: options.executionMode === "structured"
        ? resolveStructuredOutputProfile({
          provider: resolvedProvider,
          model: resolvedModel,
          baseURL,
          executionMode: "structured",
        })
        : null,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningEnabled: true,
      reasoningEffort: options.reasoningEffort,
      reasoningForcedOff: false,
      taskType: options.taskType,
      promptMeta: options.promptMeta,
      modelKwargs: undefined,
      includeRawResponse: false,
    };
  };
  factory.createLLMFromResolvedOptions = () => ({
    stream: async (_messages, streamOptions = {}) => {
      harness.calls.push(attempts.getModelAttemptRequestState()?.requestId ?? null);
      return harness.respond(harness.calls.length, streamOptions);
    },
  });
  factory.getLLM = async () => ({
    stream: async () => {
      harness.repairs.push("repair");
      return jsonStream(validOutput());
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: true,
    provider: "deepseek",
    model: "distinct-fallback",
    temperature: 0.2,
    maxTokens: null,
    retryCount: 2,
  });
  harness.restore = () => {
    factory.resolveLLMClientOptions = originals.resolveLLMClientOptions;
    factory.createLLMFromResolvedOptions = originals.createLLMFromResolvedOptions;
    factory.getLLM = originals.getLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originals.getStructuredFallbackSettings;
    attempts.setModelAttemptRepositoryForTests();
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  };
  return harness;
}

function wrapStore(base, overrides = {}) {
  return {
    claim: (value) => base.claim(value),
    read: (worldId, operationId) => base.read(worldId, operationId),
    startModel: (value) => base.startModel(value),
    persistResult: (value) => base.persistResult(value),
    markUnknown: (value) => base.markUnknown(value),
    markFailed: (worldId, operationId, category) => base.markFailed(worldId, operationId, category),
    ...overrides,
  };
}

function runService(client, options = {}) {
  return createWorldStructureBackfillRunService(client, { clock: () => FIXED_NOW, ...options });
}

function generation(client, options = {}) {
  return createWorldStructureBackfillGenerationService(client, { clock: () => FIXED_NOW, ...options });
}

function input(worldId, operationId, overrides = {}) {
  return { worldId, operationId, baseContentRevision: 4, provider: PROVIDER, model: MODEL, ...overrides };
}

function commitUnknown() {
  return new WorldStructureBackfillStoreError("COMMIT_RESULT_UNKNOWN", "injected: commit outcome not confirmed");
}

/** Injected commit port: `before` runs in place of (or around) the real commit, then the call throws. */
function throwingCommitPort(client, { before = async () => {}, error = commitUnknown, read } = {}) {
  const real = createWorldStructureBackfillCommitService(client);
  return {
    commitPersistedResult: async (worldId, operationId) => {
      await before(real, worldId, operationId);
      throw error();
    },
    readCommitOutcome: read ?? ((worldId, operationId) => real.readCommitOutcome(worldId, operationId)),
  };
}

async function tableCounts(client) {
  return {
    worlds: await client.world.count(),
    operations: await client.worldStructureBackfillOperation.count(),
    results: await client.worldStructureBackfillResult.count(),
    receipts: await client.worldStructureBackfillCommitReceipt.count(),
    snapshots: await client.worldSnapshot.count(),
    ragJobs: await client.ragIndexJob.count(),
  };
}

async function operationRow(client, worldId, operationId) {
  return client.worldStructureBackfillOperation.findUnique({
    where: { worldId_operationId: { worldId, operationId } },
    include: { result: true, commitReceipt: true },
  });
}

async function claimInFlight(client, store, worldId, operationId) {
  const blocked = generation(client, {
    store: wrapStore(store, { startModel: async () => { throw new Error("injected: owner lost before start"); } }),
  });
  await assert.rejects(blocked.generatePersistedResult(input(worldId, operationId)), /owner lost before start/);
  const notCalled = await runService(client).readRunOutcome(worldId, operationId);
  await store.startModel({
    worldId,
    operationId,
    leaseExpiresAt: new Date(FIXED_NOW.getTime() + 60_000),
    modelRequestId: `lost-owner-${operationId}`,
  });
  return notCalled;
}

function registerTests() {
test("world structure backfill run orchestration", async (t) => {
  const fixture = createFileFixture();
  const { clientA, clientB } = fixture;
  const storeA = createWorldStructureBackfillStore(clientA);
  try {
    await t.test("AC1 success commits once with one provider call, one receipt, no snapshot and no RAG job", async () => {
      const worldId = "world-success";
      await seedWorld(clientA, worldId);
      const before = await tableCounts(clientA);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        const outcome = await runService(clientA).runBackfill(input(worldId, "op-success"));
        assert.equal(harness.calls.length, 1);
        assert.equal(harness.repairs.length, 0);
        assert.equal(outcome.kind, "committed");
        assert.equal(outcome.operation.status, "committed");
        assert.equal(outcome.failureCategory, null);
        assert.ok(outcome.result && outcome.receipt);
        assert.equal(outcome.receipt.resultDigest, outcome.result.digest);
        assert.equal(outcome.receipt.committedRevision, 5);
        assert.equal((await clientA.world.findUnique({ where: { id: worldId } })).contentRevision, 5);
        const after = await tableCounts(clientA);
        assert.equal(after.receipts - before.receipts, 1);
        assert.equal(after.snapshots, before.snapshots, "c1 creates no snapshot");
        assert.equal(after.ragJobs, before.ragJobs, "c1 enqueues no RAG job");
      } finally {
        harness.restore();
      }
    });

    await t.test("AC2 lost response and restart replay return the same receipt with zero model calls", async () => {
      const worldId = "world-success";
      const first = await runService(clientA).readRunOutcome(worldId, "op-success");
      const restarted = createPrisma(fixture.databasePath);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        for (const client of [restarted, clientB]) {
          const replay = await runService(client).runBackfill(input(worldId, "op-success"));
          assert.equal(replay.kind, "committed");
          assert.equal(replay.receipt.id, first.receipt.id);
          assert.equal(replay.result.digest, first.result.digest);
        }
        assert.equal(harness.calls.length, 0);
        assert.equal((await clientB.world.findUnique({ where: { id: worldId } })).contentRevision, 5);
        assert.equal(await clientB.worldStructureBackfillCommitReceipt.count({ where: { worldId } }), 1);
      } finally {
        harness.restore();
        await restarted.$disconnect();
      }
    });

    await t.test("AC3 interrupted commits converge only through persisted facts", async (t2) => {
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        await t2.test("unconfirmed commit without a receipt stays pending, then a replay commits once", async () => {
          const worldId = "world-pending";
          await seedWorld(clientA, worldId);
          const stored = await generation(clientA).generatePersistedResult(input(worldId, "op-pending"));
          assert.equal(stored.operation.status, "model_succeeded_pending_commit");
          assert.equal(harness.calls.length, 1);

          for (const error of [commitUnknown, () => new Error("injected: connection dropped during commit")]) {
            const pending = await runService(clientB, { commit: throwingCommitPort(clientB, { error }) })
              .runBackfill(input(worldId, "op-pending"));
            assert.equal(pending.kind, "result_pending_commit");
            assert.equal(pending.receipt, null, "no verifiable receipt is never reported as committed");
            assert.equal(pending.result.digest, stored.result.digest);
          }
          await assert.rejects(
            runService(clientB, { commit: throwingCommitPort(clientB, { read: async () => null }) })
              .runBackfill(input(worldId, "op-pending")),
            expectStoreError("COMMIT_RESULT_UNKNOWN"),
            "an unreadable outcome rethrows instead of guessing",
          );
          const realCommit = createWorldStructureBackfillCommitService(clientB);
          await assert.rejects(
            runService(clientB, {
              commit: throwingCommitPort(clientB, {
                read: async (w, o) => {
                  const state = await realCommit.readCommitOutcome(w, o);
                  return { ...state, operation: { ...state.operation, status: "committed" }, receipt: null };
                },
              }),
            }).runBackfill(input(worldId, "op-pending")),
            expectStoreError("COMMIT_RESULT_UNKNOWN"),
            "a committed status without a receipt rethrows and is never reported as committed",
          );
          assert.equal((await clientA.world.findUnique({ where: { id: worldId } })).contentRevision, 4);

          const committed = await runService(clientA).runBackfill(input(worldId, "op-pending"));
          assert.equal(committed.kind, "committed");
          const again = await runService(clientB).runBackfill(input(worldId, "op-pending"));
          assert.equal(again.receipt.id, committed.receipt.id);
          assert.equal((await clientA.world.findUnique({ where: { id: worldId } })).contentRevision, 5);
          assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({ where: { worldId } }), 1);
          assert.equal(harness.calls.length, 1, "pending commit recovery makes zero model calls");
        });

        await t2.test("commit that landed before COMMIT_RESULT_UNKNOWN is confirmed as committed", async () => {
          const worldId = "world-landed";
          await seedWorld(clientA, worldId);
          await generation(clientA).generatePersistedResult(input(worldId, "op-landed"));
          const calls = harness.calls.length;
          const outcome = await runService(clientB, {
            commit: throwingCommitPort(clientB, { before: (real, w, o) => real.commitPersistedResult(w, o) }),
          }).runBackfill(input(worldId, "op-landed"));
          assert.equal(outcome.kind, "committed");
          assert.ok(outcome.receipt);
          assert.equal((await clientA.world.findUnique({ where: { id: worldId } })).contentRevision, 5);
          assert.equal(harness.calls.length, calls);
        });

        await t2.test("COMMIT_RESULT_UNKNOWN over a retained conflict reports conflict, not pending", async () => {
          const worldId = "world-commit-conflict";
          await seedWorld(clientA, worldId);
          await generation(clientA).generatePersistedResult(input(worldId, "op-commit-conflict"));
          await clientA.world.update({ where: { id: worldId }, data: { contentRevision: { increment: 1 } } });
          const calls = harness.calls.length;
          const outcome = await runService(clientB, {
            commit: throwingCommitPort(clientB, { before: (real, w, o) => real.commitPersistedResult(w, o) }),
          }).runBackfill(input(worldId, "op-commit-conflict"));
          assert.equal(outcome.kind, "conflict_result_retained");
          assert.equal(outcome.receipt, null);
          assert.ok(outcome.result);
          assert.equal(harness.calls.length, calls);
        });
      } finally {
        harness.restore();
      }
    });

    await t.test("AC4 author edit before commit retains the result without touching the world", async () => {
      const worldId = "world-author";
      await seedWorld(clientA, worldId);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        await generation(clientA).generatePersistedResult(input(worldId, "op-author"));
        await clientB.world.update({
          where: { id: worldId },
          data: { description: "作者改写后的简介", contentRevision: { increment: 1 } },
        });
        const authored = await clientB.world.findUnique({ where: { id: worldId } });
        const outcome = await runService(clientA).runBackfill(input(worldId, "op-author"));
        assert.equal(outcome.kind, "conflict_result_retained");
        assert.ok(outcome.result);
        assert.equal(outcome.receipt, null);
        assert.deepEqual(await clientA.world.findUnique({ where: { id: worldId } }), authored);

        const counts = await tableCounts(clientA);
        const row = await operationRow(clientA, worldId, "op-author");
        const replay = await runService(clientB).runBackfill(input(worldId, "op-author"));
        assert.equal(replay.kind, "conflict_result_retained");
        assert.equal(replay.result.digest, outcome.result.digest);
        assert.equal(harness.calls.length, 1);
        assert.deepEqual(await tableCounts(clientA), counts);
        assert.deepEqual(await operationRow(clientA, worldId, "op-author"), row, "conflict replay writes nothing");
        assert.deepEqual(await clientA.world.findUnique({ where: { id: worldId } }), authored);
      } finally {
        harness.restore();
      }
    });

    await t.test("AC5 two worker threads on one file database call the provider once and commit once", async () => {
      const worldId = "world-concurrent";
      await seedWorld(clientA, worldId);
      const barrier = new SharedArrayBuffer(8);
      const reports = await Promise.all([
        runConcurrentWorker({ databasePath: fixture.databasePath, worldId, operationId: "op-race", barrier }),
        runConcurrentWorker({ databasePath: fixture.databasePath, worldId, operationId: "op-race", barrier }),
      ]);
      for (const report of reports) {
        assert.equal(report.ok, true, report.error?.message);
      }
      assert.equal(reports[0].calls + reports[1].calls, 1, "one provider .stream() call across both workers");
      const winner = reports.find((report) => report.calls === 1);
      const loser = reports.find((report) => report.calls === 0);
      assert.ok(winner && loser);
      assert.equal(winner.kind, "committed");
      assert.ok(["in_progress", "result_pending_commit", "committed"].includes(loser.kind), loser.kind);
      assert.equal((await clientA.world.findUnique({ where: { id: worldId } })).contentRevision, 5);
      assert.equal(await clientA.worldStructureBackfillCommitReceipt.count({ where: { worldId } }), 1);

      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        const replayA = await runService(clientA).runBackfill(input(worldId, "op-race"));
        const replayB = await runService(clientB).runBackfill(input(worldId, "op-race"));
        assert.equal(replayA.receipt.id, winner.receiptId);
        assert.equal(replayB.receipt.id, winner.receiptId);
        assert.equal(harness.calls.length, 0);
      } finally {
        harness.restore();
      }
    });

    await t.test("AC6 failure categories persist, read back on a new connection, and are never overwritten", async (t2) => {
      const worldId = "world-failures";
      await seedWorld(clientA, worldId);
      const scenarios = [
        { operationId: "f-malformed", respond: async () => jsonStream("这不是 JSON"), kind: "failed_terminal", category: "malformed_json" },
        { operationId: "f-empty", respond: async () => jsonStream("   "), kind: "failed_terminal", category: "empty_content" },
        {
          operationId: "f-schema",
          respond: async () => jsonStream(JSON.stringify({ profile: { summary: "缺字段" } })),
          kind: "failed_terminal",
          category: "schema_mismatch",
        },
        {
          operationId: "f-transport",
          respond: async () => { throw new Error("socket hang up: connection reset by peer"); },
          kind: "model_unknown",
          category: "transport_error",
        },
        { operationId: "f-cancelled", cancel: true, kind: "model_unknown", category: "cancelled" },
        {
          operationId: "f-persist",
          persistFailure: true,
          respond: async () => jsonStream(validOutput()),
          kind: "model_unknown",
          category: "persist_failed",
        },
      ];
      for (const scenario of scenarios) {
        await t2.test(`${scenario.operationId} -> ${scenario.kind}/${scenario.category}`, async () => {
          const controller = new AbortController();
          const respond = scenario.cancel
            ? async () => (async function* () {
              yield { content: "{\"profile\":" };
              controller.abort(new Error("request cancelled during the provider call"));
              await new Promise((resolve) => setTimeout(resolve, 5));
              throw new Error("provider stream stopped after cancellation");
            })()
            : scenario.respond;
          const harness = installProvider(respond);
          try {
            const outcome = await runService(clientA, scenario.persistFailure
              ? { store: wrapStore(storeA, { persistResult: async () => { throw new Error("injected persist failure"); } }) }
              : {}).runBackfill({
              ...input(worldId, scenario.operationId),
              signal: scenario.cancel ? controller.signal : undefined,
            });
            assert.equal(harness.calls.length, 1);
            assert.equal(outcome.kind, scenario.kind);
            assert.equal(outcome.failureCategory, scenario.category);
            assert.equal((await operationRow(clientB, worldId, scenario.operationId)).failureCategory, scenario.category);

            const restarted = createPrisma(fixture.databasePath);
            try {
              const read = await runService(restarted).readRunOutcome(worldId, scenario.operationId);
              assert.equal(read.kind, scenario.kind);
              assert.equal(read.failureCategory, scenario.category);
              assert.equal(read.operation.failureCategory, scenario.category);
            } finally {
              await restarted.$disconnect();
            }
            const replay = await runService(clientB).runBackfill(input(worldId, scenario.operationId));
            assert.equal(replay.kind, scenario.kind);
            assert.equal(replay.failureCategory, scenario.category);
            assert.equal(harness.calls.length, 1, "terminal replays make zero model calls");
          } finally {
            harness.restore();
          }
        });
      }

      await t2.test("lease expiry persists lease_expired; not-called and in-flight carry no category", async () => {
        const harness = installProvider(async () => jsonStream(validOutput()));
        try {
          const notCalled = await claimInFlight(clientA, storeA, worldId, "f-lease");
          assert.equal(notCalled.operation.status, "model_not_called");
          assert.equal(notCalled.kind, "in_progress");
          assert.equal(notCalled.failureCategory, null);
          const inFlight = await runService(clientB).readRunOutcome(worldId, "f-lease");
          assert.equal(inFlight.operation.status, "model_in_flight");
          assert.equal(inFlight.failureCategory, null);

          const expired = await runService(clientB, { clock: () => new Date(FIXED_NOW.getTime() + 120_000) })
            .runBackfill(input(worldId, "f-lease"));
          assert.equal(expired.kind, "model_unknown");
          assert.equal(expired.failureCategory, "lease_expired");
          const restarted = createPrisma(fixture.databasePath);
          try {
            assert.equal((await runService(restarted).readRunOutcome(worldId, "f-lease")).failureCategory, "lease_expired");
          } finally {
            await restarted.$disconnect();
          }
          assert.equal((await runService(clientA).runBackfill(input(worldId, "f-lease"))).failureCategory, "lease_expired");
          assert.equal(harness.calls.length, 0);
        } finally {
          harness.restore();
        }
      });

      await t2.test("a settled row keeps its category and recordFailure reports the stored one", async () => {
        const failedAgain = await storeA.markFailed(worldId, "f-transport", "malformed_json");
        assert.equal(failedAgain.changed, false);
        assert.equal(failedAgain.state.operation.failureCategory, "transport_error");
        const unknownAgain = await storeA.markUnknown({
          worldId, operationId: "f-malformed", reason: "unknown_result", failureCategory: "transport_error",
        });
        assert.equal(unknownAgain.changed, false);
        assert.equal(unknownAgain.state.operation.failureCategory, "malformed_json");

        // The lease expires between the provider failure and markFailed: the row settles first.
        const harness = installProvider(async () => jsonStream("这不是 JSON"));
        try {
          const racing = wrapStore(storeA, {
            markFailed: async (w, o, category) => {
              await storeA.markUnknown({
                worldId: w, operationId: o, reason: "lease_expired", now: new Date(FIXED_NOW.getTime() + 3_600_000),
              });
              return storeA.markFailed(w, o, category);
            },
          });
          const outcome = await runService(clientA, { store: racing }).runBackfill(input(worldId, "f-settled"));
          assert.equal(outcome.kind, "model_unknown");
          assert.equal(outcome.failureCategory, "lease_expired", "stored category, not the unwritten malformed_json");
          assert.equal((await operationRow(clientB, worldId, "f-settled")).failureCategory, "lease_expired");

          // Same race through the generation service directly: recordFailure must return the stored category.
          const direct = await generation(clientA, { store: racing }).generatePersistedResult(input(worldId, "f-settled-direct"));
          assert.equal(direct.kind, "model_unknown");
          assert.equal(direct.failureCategory, "lease_expired", "generation returns the stored category when changed=false");
        } finally {
          harness.restore();
        }
      });
    });

    await t.test("AC7 only allowlisted categories are stored; others are rejected without a state change", async () => {
      const worldId = "world-guard";
      await seedWorld(clientA, worldId);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        await claimInFlight(clientA, storeA, worldId, "op-guard");
      } finally {
        harness.restore();
      }
      const before = await operationRow(clientA, worldId, "op-guard");
      for (const invalid of ["socket hang up: api key sk-test-secret", "MALFORMED_JSON", "", 42, { category: "malformed_json" }]) {
        await assert.rejects(storeA.markFailed(worldId, "op-guard", invalid), expectStoreError("INVALID_INPUT"));
        await assert.rejects(
          storeA.markUnknown({ worldId, operationId: "op-guard", reason: "unknown_result", failureCategory: invalid }),
          expectStoreError("INVALID_INPUT"),
        );
      }
      await assert.rejects(
        storeA.markUnknown({
          worldId, operationId: "op-guard", reason: "lease_expired", failureCategory: "transport_error",
          now: new Date(FIXED_NOW.getTime() + 3_600_000),
        }),
        expectStoreError("INVALID_INPUT"),
      );
      assert.deepEqual(await operationRow(clientA, worldId, "op-guard"), before, "rejected categories change nothing");

      assert.deepEqual([...WORLD_STRUCTURE_BACKFILL_FAILURE_CATEGORIES].sort(), [
        "cancelled", "empty_content", "incomplete_json", "lease_expired", "malformed_json", "normalization_failed",
        "output_truncated", "persist_failed", "reasoning_budget_exhausted", "request_too_large", "schema_mismatch",
        "thinking_pollution", "transport_error", "unstructured_error", "unsupported_native_json",
      ]);
      const rawDatabase = new Database(fixture.databasePath, { readonly: true });
      try {
        const stored = rawDatabase.prepare(
          'SELECT DISTINCT "failureCategory" AS category FROM "WorldStructureBackfillOperation"',
        ).all().map((row) => row.category);
        assert.ok(stored.includes("malformed_json"));
        for (const category of stored) {
          assert.ok(category === null || WORLD_STRUCTURE_BACKFILL_FAILURE_CATEGORIES.has(category), String(category));
        }
        const columns = rawDatabase.prepare('PRAGMA table_info("WorldStructureBackfillOperation")').all().map((c) => c.name);
        assert.deepEqual(columns, [
          "id", "worldId", "operationId", "requestHash", "baseContentRevision", "promptId", "promptVersion",
          "provider", "model", "generationPolicyVersion", "sourceDigest", "status", "leaseExpiresAt",
          "modelRequestId", "modelAttemptId", "createdAt", "updatedAt", "failureCategory",
        ]);
      } finally {
        rawDatabase.close();
      }
    });

    await t.test("AC8 readRunOutcome reports every state with zero model calls and zero writes", async () => {
      const worldId = "world-read";
      await seedWorld(clientA, worldId);
      const setup = installProvider(async () => jsonStream(validOutput()));
      try {
        await generation(clientA).generatePersistedResult(input(worldId, "op-read-pending"));
        await claimInFlight(clientA, storeA, worldId, "op-read-in-flight");
        await assert.rejects(generation(clientA, {
          store: wrapStore(storeA, { startModel: async () => { throw new Error("injected: not started"); } }),
        }).generatePersistedResult(input(worldId, "op-read-not-called")));
      } finally {
        setup.restore();
      }
      const cases = [
        ["world-read", "op-read-not-called", "in_progress", null],
        ["world-read", "op-read-in-flight", "in_progress", null],
        ["world-read", "op-read-pending", "result_pending_commit", null],
        ["world-success", "op-success", "committed", null],
        ["world-author", "op-author", "conflict_result_retained", null],
        ["world-failures", "f-schema", "failed_terminal", "schema_mismatch"],
        ["world-failures", "f-cancelled", "model_unknown", "cancelled"],
      ];
      const harness = installProvider(async () => { throw new Error("readRunOutcome must not call a model"); });
      try {
        const countsBefore = await tableCounts(clientA);
        const rowsBefore = await clientA.worldStructureBackfillOperation.findMany({ orderBy: { id: "asc" } });
        const worldsBefore = await clientA.world.findMany({ orderBy: { id: "asc" } });
        for (const [w, o, kind, category] of cases) {
          const outcome = await runService(clientB).readRunOutcome(w, o);
          assert.equal(outcome.kind, kind, `${o}`);
          assert.equal(outcome.failureCategory, category, `${o}`);
          assert.equal(outcome.receipt !== null, kind === "committed", `${o} receipt only when committed`);
          assert.equal(outcome.result !== null, ["committed", "conflict_result_retained", "result_pending_commit"].includes(kind));
          assert.deepEqual(Object.keys(outcome).sort(), ["failureCategory", "kind", "operation", "receipt", "result"]);
        }
        assert.equal(await runService(clientB).readRunOutcome("world-read", "op-missing"), null);
        assert.equal(await runService(clientB).readRunOutcome("world-author", "op-read-pending"), null, "cross-world is null");
        assert.equal(harness.calls.length, 0);
        assert.deepEqual(await tableCounts(clientA), countsBefore);
        assert.deepEqual(await clientA.worldStructureBackfillOperation.findMany({ orderBy: { id: "asc" } }), rowsBefore);
        assert.deepEqual(await clientA.world.findMany({ orderBy: { id: "asc" } }), worldsBefore);
      } finally {
        harness.restore();
      }
    });
  } finally {
    await clientA.$disconnect();
    await clientB.$disconnect();
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

function readSchemaMaster(database) {
  return database.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
  ).all();
}

function copyMigrations(targetDir, include) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const migrationName of listMigrationNames(sqliteMigrationsDir).filter(include)) {
    fs.mkdirSync(path.join(targetDir, migrationName), { recursive: true });
    fs.copyFileSync(
      path.join(sqliteMigrationsDir, migrationName, "migration.sql"),
      path.join(targetDir, migrationName, "migration.sql"),
    );
  }
}

function seedPreUpgradeRows(database) {
  const at = "2026-09-24T12:00:00.000Z";
  database.prepare(
    `INSERT INTO "World" ("id", "name", "description", "status", "version", "contentRevision",
       "structureJson", "bindingSupportJson", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("world-upgrade", "升级前的世界", "保留的世界内容", "draft", 3, 2, "{\"s\":1}", "{\"b\":1}", at, at);
  const insertOperation = database.prepare(
    `INSERT INTO "WorldStructureBackfillOperation" ("id", "worldId", "operationId", "requestHash",
       "baseContentRevision", "promptId", "promptVersion", "provider", "model", "generationPolicyVersion",
       "sourceDigest", "status", "leaseExpiresAt", "modelRequestId", "modelAttemptId", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertOperation.run("opr-committed", "world-upgrade", "op-committed", "hash-1", 1, "world.structure.backfill", "v1",
    "openai", "gpt-4o-mini", "structure-backfill-policy-v1", "source-1", "committed", null, "req-1", "att-1", at, at);
  insertOperation.run("opr-failed", "world-upgrade", "op-failed", "hash-2", 2, "world.structure.backfill", "v1",
    null, null, "structure-backfill-policy-v1", "source-2", "failed_terminal", at, "req-2", null, at, at);
  database.prepare(
    `INSERT INTO "WorldStructureBackfillResult" ("id", "operationRecordId", "normalizedStructureJson",
       "bindingSupportJson", "baseContentRevision", "requestHash", "generationPolicyVersion", "digest",
       "modelRequestId", "modelAttemptId", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("res-1", "opr-committed", "{\"s\":2}", "{\"b\":2}", 1, "hash-1", "structure-backfill-policy-v1", "digest-1",
    "req-1", "att-1", at);
  database.prepare(
    `INSERT INTO "WorldStructureBackfillCommitReceipt" ("id", "operationRecordId", "worldId", "operationId",
       "resultDigest", "baseContentRevision", "committedRevision", "beforeDigest", "afterDigest", "committedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("rcp-1", "opr-committed", "world-upgrade", "op-committed", "digest-1", 1, 2, "before-1", "after-1", at);
}

function readSeededRows(database) {
  const rows = {};
  for (const table of ["World", "WorldStructureBackfillOperation", "WorldStructureBackfillResult", "WorldStructureBackfillCommitReceipt"]) {
    rows[table] = database.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all();
  }
  return rows;
}

test("AC9 failure category migration adds one nullable column and upgrades existing rows in place", async (t) => {
  const migrationSql = {
    postgres: fs.readFileSync(path.join(prismaRoot, "migrations", newMigrationName, "migration.sql"), "utf8"),
    sqlite: fs.readFileSync(path.join(sqliteMigrationsDir, newMigrationName, "migration.sql"), "utf8"),
  };
  assert.equal(migrationSql.postgres.trim(), ADD_COLUMN_SQL);
  assert.equal(migrationSql.sqlite.trim(), ADD_COLUMN_SQL);
  for (const schemaFile of ["schema.prisma", "schema.sqlite.prisma"]) {
    const schema = fs.readFileSync(path.join(prismaRoot, schemaFile), "utf8");
    const model = schema.match(/^model WorldStructureBackfillOperation\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";
    assert.match(model, /^\s*failureCategory\s+String\?\s*$/m, `${schemaFile} declares only a nullable column`);
  }

  const tempDir = fs.mkdtempSync("/tmp/ai-novel-s3-02b3c1-migrate-");
  try {
    const freshDatabase = new Database(path.join(tempDir, "fresh.db"));
    applyRuntimeMigrationsToDatabase(freshDatabase, sqliteMigrationsDir);

    const betaMigrationsDir = path.join(tempDir, "beta-migrations");
    copyMigrations(betaMigrationsDir, (name) => !name.startsWith("20260926120000_"));
    const upgradeDatabase = new Database(path.join(tempDir, "upgrade.db"));
    applyRuntimeMigrationsToDatabase(upgradeDatabase, betaMigrationsDir);
    seedPreUpgradeRows(upgradeDatabase);
    const rowsBefore = readSeededRows(upgradeDatabase);
    applyRuntimeMigrationsToDatabase(upgradeDatabase, sqliteMigrationsDir);

    const freshMaster = readSchemaMaster(freshDatabase);
    const upgradeMaster = readSchemaMaster(upgradeDatabase);
    assert.deepEqual(upgradeMaster, freshMaster, "fresh and upgraded sqlite_master are identical");
    const digest = crypto.createHash("sha256").update(JSON.stringify(freshMaster)).digest("hex");
    t.diagnostic(`sqlite_master entries=${freshMaster.length} sha256=${digest}`);

    const rowsAfter = readSeededRows(upgradeDatabase);
    for (const operation of rowsAfter.WorldStructureBackfillOperation) {
      assert.equal(operation.failureCategory, null);
    }
    rowsAfter.WorldStructureBackfillOperation = rowsAfter.WorldStructureBackfillOperation
      .map(({ failureCategory: _failureCategory, ...rest }) => rest);
    assert.deepEqual(rowsAfter, rowsBefore, "seeded World, operation, result and receipt rows are unchanged");
    assert.equal(upgradeDatabase.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(upgradeDatabase.pragma("foreign_key_check"), []);
    t.diagnostic(`seeded rows unchanged: ${Object.entries(rowsBefore).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
    freshDatabase.close();
    upgradeDatabase.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
}

/** Main thread: run one run-service instance on its own connection in a worker thread. */
function runConcurrentWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: data });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`));
    });
  });
}

function arriveAtBarrier(view, slot) {
  Atomics.add(view, slot, 1);
  Atomics.notify(view, slot);
  const deadline = Date.now() + 10_000;
  while (Atomics.load(view, slot) < 2) {
    if (Date.now() > deadline) throw new Error("barrier timeout");
    Atomics.wait(view, slot, Atomics.load(view, slot), 50);
  }
}

/** Worker thread: SQLite write-lock waits rely on the adapter busy timeout, never on in-process connections. */
async function runWorker({ databasePath, worldId, operationId, barrier }) {
  const view = new Int32Array(barrier);
  const client = createPrisma(databasePath);
  const base = createWorldStructureBackfillStore(client);
  let arrived = false;
  const store = wrapStore(base, {
    read: async (w, o) => {
      const value = await base.read(w, o);
      if (!arrived) {
        arrived = true;
        arriveAtBarrier(view, 0);
      }
      return value;
    },
  });
  const harness = installProvider(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return jsonStream(validOutput());
  });
  try {
    const outcome = await runService(client, { store }).runBackfill(input(worldId, operationId));
    parentPort.postMessage({
      ok: true,
      calls: harness.calls.length,
      kind: outcome.kind,
      receiptId: outcome.receipt?.id ?? null,
    });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: { code: error?.code ?? null, message: String(error?.message ?? error) } });
  } finally {
    harness.restore();
    await client.$disconnect();
  }
}

if (isMainThread) {
  registerTests();
} else {
  runWorker(workerData);
}
