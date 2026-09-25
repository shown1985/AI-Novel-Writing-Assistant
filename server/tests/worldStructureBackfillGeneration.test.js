const test = require("node:test");
const assert = require("node:assert/strict");
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
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
const attempts = require("../dist/platform/llm/provenance/index.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { worldStructureBackfillPrompt } = require("../dist/prompting/prompts/world/world.prompts.js");
const {
  createWorldStructureBackfillCommitService,
  createWorldStructureBackfillGenerationService,
  createWorldStructureBackfillRequestHash,
  createWorldStructureBackfillSourceDigest,
  createWorldStructureBackfillStore,
  WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
  WorldStructureBackfillStoreError,
} = require("../dist/services/world/backfill/index.js");
const { buildWorldStructurePromptSource } = require("../dist/services/world/worldServiceShared.js");

const sqliteMigrationsDir = path.join(__dirname, "..", "src", "prisma", "migrations.sqlite");
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

function createFileFixture() {
  const tempDir = fs.mkdtempSync("/tmp/ai-novel-s3-02b3b2b-");
  const databasePath = path.join(tempDir, "fixture.db");
  const rawDatabase = new Database(databasePath);
  applyRuntimeMigrationsToDatabase(rawDatabase, sqliteMigrationsDir);
  rawDatabase.close();
  return {
    tempDir,
    databasePath,
    clientA: createPrisma(databasePath),
    clientB: createPrisma(databasePath),
  };
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

/** Counts physical provider calls at the provider `.stream()` layer. */
function installProvider(respond) {
  const originals = {
    resolveLLMClientOptions: factory.resolveLLMClientOptions,
    createLLMFromResolvedOptions: factory.createLLMFromResolvedOptions,
    getLLM: factory.getLLM,
    getStructuredFallbackSettings: structuredFallbackSettings.getStructuredFallbackSettings,
  };
  const repository = new RecordingAttemptRepository();
  const harness = { calls: [], repairs: [], repository, respond };
  attempts.setModelAttemptRepositoryForTests(repository);
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
  factory.createLLMFromResolvedOptions = (resolved) => ({
    stream: async (_messages, streamOptions = {}) => {
      const call = {
        provider: resolved.provider,
        model: resolved.model,
        requestId: attempts.getModelAttemptRequestState()?.requestId ?? null,
      };
      harness.calls.push(call);
      return harness.respond(call, harness.calls.length, streamOptions);
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
    claim: (input) => base.claim(input),
    read: (worldId, operationId) => base.read(worldId, operationId),
    startModel: (input) => base.startModel(input),
    persistResult: (input) => base.persistResult(input),
    markUnknown: (input) => base.markUnknown(input),
    markFailed: (worldId, operationId) => base.markFailed(worldId, operationId),
    ...overrides,
  };
}

function service(client, options = {}) {
  return createWorldStructureBackfillGenerationService(client, { clock: () => FIXED_NOW, ...options });
}

function input(worldId, operationId, overrides = {}) {
  return { worldId, operationId, baseContentRevision: 4, provider: PROVIDER, model: MODEL, ...overrides };
}

async function worldFacts(client, worldId) {
  const world = await client.world.findUnique({ where: { id: worldId } });
  return {
    world,
    snapshots: await client.worldSnapshot.count({ where: { worldId } }),
    ragJobs: await client.ragIndexJob.count(),
    receipts: await client.worldStructureBackfillCommitReceipt.count({ where: { worldId } }),
  };
}

async function operationRow(client, worldId, operationId) {
  return client.worldStructureBackfillOperation.findUnique({
    where: { worldId_operationId: { worldId, operationId } },
    include: { result: true },
  });
}

function registerTests() {
test("world structure backfill generation orchestration", async (t) => {
  const fixture = createFileFixture();
  const { clientA, clientB } = fixture;
  const storeA = createWorldStructureBackfillStore(clientA);
  try {
    await t.test("AC2 success stores one normalized result, binds the attempt id, and leaves the world untouched", async () => {
      const worldId = "world-success";
      await seedWorld(clientA, worldId);
      const before = await worldFacts(clientA, worldId);
      const duringCall = [];
      const harness = installProvider(async () => {
        duringCall.push(await operationRow(clientB, worldId, "op-success"));
        return jsonStream(validOutput());
      });
      try {
        const outcome = await service(clientA).generatePersistedResult(input(worldId, "op-success"));
        assert.equal(harness.calls.length, 1);
        assert.equal(harness.repairs.length, 0);
        assert.equal(outcome.kind, "result_stored");
        assert.equal(outcome.replayed, false);
        assert.equal(outcome.operation.status, "model_succeeded_pending_commit");
        assert.match(outcome.result.digest, /^[0-9a-f]{64}$/);
        assert.equal(outcome.result.normalizedStructure.metadata.seededFrom, "ai-backfill");
        assert.equal(outcome.result.normalizedStructure.metadata.lastBackfilledAt, FIXED_NOW.toISOString());

        const [attempt] = harness.repository.rows;
        assert.equal(harness.repository.rows.length, 1);
        assert.equal(duringCall[0].modelAttemptId, null, "startModel leaves the attempt id unbound");
        assert.equal(outcome.operation.modelRequestId, attempt.requestId);
        assert.equal(harness.calls[0].requestId, attempt.requestId);
        assert.equal(outcome.operation.modelAttemptId, attempt.attemptId);
        assert.equal(outcome.result.modelAttemptId, attempt.attemptId);
        assert.equal(outcome.result.modelRequestId, attempt.requestId);

        const second = await service(clientB).generatePersistedResult(input(worldId, "op-success-repeat"));
        assert.equal(harness.calls.length, 2);
        assert.equal(second.result.digest, outcome.result.digest, "same world and clock yield the same digest");

        const after = await worldFacts(clientA, worldId);
        assert.deepEqual(after, before);
      } finally {
        harness.restore();
      }
    });

    await t.test("AC2 attempt binding still rejects mismatched references with zero writes", async () => {
      const worldId = "world-binding";
      const world = await seedWorld(clientA, worldId);
      const request = (operationId) => ({
        worldId,
        operationId,
        baseContentRevision: world.contentRevision,
        promptId: worldStructureBackfillPrompt.id,
        promptVersion: worldStructureBackfillPrompt.version,
        provider: PROVIDER,
        model: MODEL,
        generationPolicyVersion: WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
        sourceDigest: "binding-source",
      });
      const payload = { normalizedStructure: { profile: { summary: "x" } }, bindingSupport: {} };
      const lease = new Date(Date.now() + 60_000);

      await storeA.claim(request("bound-attempt"));
      await storeA.startModel({
        worldId, operationId: "bound-attempt", leaseExpiresAt: lease, modelRequestId: "req-1", modelAttemptId: "att-1",
      });
      const boundBefore = await operationRow(clientA, worldId, "bound-attempt");
      await assert.rejects(
        storeA.persistResult({ ...request("bound-attempt"), ...payload, modelRequestId: "req-1", modelAttemptId: "att-2" }),
        expectStoreError("MODEL_REFERENCE_MISMATCH"),
      );
      assert.deepEqual(await operationRow(clientA, worldId, "bound-attempt"), boundBefore);

      await storeA.claim(request("request-mismatch"));
      await storeA.startModel({
        worldId, operationId: "request-mismatch", leaseExpiresAt: lease, modelRequestId: "req-1",
      });
      const unboundBefore = await operationRow(clientA, worldId, "request-mismatch");
      await assert.rejects(
        storeA.persistResult({ ...request("request-mismatch"), ...payload, modelRequestId: "req-other", modelAttemptId: "att-1" }),
        expectStoreError("MODEL_REFERENCE_MISMATCH"),
      );
      assert.deepEqual(await operationRow(clientA, worldId, "request-mismatch"), unboundBefore);
      assert.equal(unboundBefore.result, null);

      const bound = await storeA.persistResult({
        ...request("request-mismatch"), ...payload, modelRequestId: "req-1", modelAttemptId: "att-late",
      });
      assert.equal(bound.operation.modelAttemptId, "att-late");
      assert.equal(bound.result.modelAttemptId, "att-late");
    });

    await t.test("AC3 the claim is durable and in flight on another connection before the provider is called", async () => {
      const worldId = "world-claim";
      await seedWorld(clientA, worldId);
      const observed = [];
      const harness = installProvider(async (call) => {
        observed.push({ row: await operationRow(clientB, worldId, "op-claim"), requestId: call.requestId });
        return jsonStream(validOutput());
      });
      try {
        await service(clientA).generatePersistedResult(input(worldId, "op-claim"));
        assert.equal(harness.calls.length, 1);
        assert.equal(observed[0].row.status, "model_in_flight");
        assert.equal(observed[0].row.modelRequestId, observed[0].requestId);
        assert.ok(observed[0].row.leaseExpiresAt instanceof Date);

        const claimFailure = service(clientA, {
          store: wrapStore(storeA, { claim: async () => { throw new Error("injected claim failure"); } }),
        });
        await assert.rejects(claimFailure.generatePersistedResult(input(worldId, "op-claim-fail")), /injected claim failure/);
        assert.equal(await operationRow(clientA, worldId, "op-claim-fail"), null);

        const startFailure = service(clientA, {
          store: wrapStore(storeA, { startModel: async () => { throw new Error("injected startModel failure"); } }),
        });
        await assert.rejects(startFailure.generatePersistedResult(input(worldId, "op-start-fail")), /injected startModel failure/);
        assert.equal((await operationRow(clientA, worldId, "op-start-fail")).status, "model_not_called");
        assert.equal(harness.calls.length, 1, "claim/startModel failures open zero provider calls");
      } finally {
        harness.restore();
      }
    });

    await t.test("AC4 concurrent services on two connections make exactly one provider call", async () => {
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
      assert.equal(reports[0].calls + reports[1].calls, 1, "one provider .stream() call across both services");
      const winner = reports.find((report) => report.start.acquired);
      const loser = reports.find((report) => !report.start.acquired);
      assert.ok(winner && loser);
      assert.equal(winner.calls, 1);
      assert.equal(loser.calls, 0);
      assert.notEqual(winner.start.requestId, loser.start.requestId);
      assert.equal(loser.start.hasCurrent, true, "loser receives { acquired: false, current }");
      assert.equal(loser.start.currentModelRequestId, winner.start.requestId);
      assert.equal(winner.outcome.kind, "result_stored");
      assert.equal(winner.outcome.replayed, false);
      assert.equal(loser.outcome.replayed, true);
      assert.ok(["in_progress", "result_stored"].includes(loser.outcome.kind));
      assert.deepEqual(winner.attemptRequestIds, [winner.start.requestId]);

      const finalA = await createWorldStructureBackfillStore(clientA).read(worldId, "op-race");
      const finalB = await createWorldStructureBackfillStore(clientB).read(worldId, "op-race");
      assert.equal(finalA.operation.status, "model_succeeded_pending_commit");
      assert.equal(finalA.operation.modelRequestId, winner.start.requestId);
      assert.equal(finalA.result.digest, finalB.result.digest);
      assert.equal(finalA.result.digest, winner.outcome.digest);
    });

    await t.test("AC5 replays, restarts, and lost responses never open a new provider call", async () => {
      const worldId = "world-replay";
      await seedWorld(clientA, worldId);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        const first = await service(clientA).generatePersistedResult(input(worldId, "op-pending"));
        const replay = await service(clientB).generatePersistedResult(input(worldId, "op-pending"));
        assert.equal(harness.calls.length, 1);
        assert.equal(replay.kind, "result_stored");
        assert.equal(replay.replayed, true);
        assert.equal(replay.operation.status, "model_succeeded_pending_commit");
        assert.equal(replay.result.digest, first.result.digest);

        await createWorldStructureBackfillCommitService(clientA).commitPersistedResult(worldId, "op-pending");
        const committed = await service(clientB).generatePersistedResult(input(worldId, "op-pending"));
        assert.equal(committed.operation.status, "committed");
        assert.equal(committed.kind, "result_stored");
        assert.equal(committed.result.digest, first.result.digest);

        const conflictWorld = "world-conflict";
        await seedWorld(clientA, conflictWorld);
        await service(clientA).generatePersistedResult(input(conflictWorld, "op-conflict"));
        await clientA.world.update({ where: { id: conflictWorld }, data: { contentRevision: { increment: 1 } } });
        await createWorldStructureBackfillCommitService(clientA).commitPersistedResult(conflictWorld, "op-conflict");
        const conflict = await service(clientB).generatePersistedResult(input(conflictWorld, "op-conflict"));
        assert.equal(conflict.operation.status, "conflict_result_retained");
        assert.equal(conflict.kind, "result_stored");
        assert.equal(harness.calls.length, 2);

        const notCalledWorld = "world-not-called";
        await seedWorld(clientA, notCalledWorld);
        const startFailure = service(clientA, {
          store: wrapStore(storeA, { startModel: async () => { throw new Error("lost before start"); } }),
        });
        await assert.rejects(startFailure.generatePersistedResult(input(notCalledWorld, "op-not-called")));
        const resumed = await service(clientB).generatePersistedResult(input(notCalledWorld, "op-not-called"));
        assert.equal(harness.calls.length, 3, "model_not_called replay makes exactly one call");
        assert.equal(resumed.kind, "result_stored");
        assert.equal(resumed.replayed, false);

        await assert.rejects(startFailure.generatePersistedResult(input(notCalledWorld, "op-leased")));
        await storeA.startModel({
          worldId: notCalledWorld,
          operationId: "op-leased",
          leaseExpiresAt: new Date(FIXED_NOW.getTime() + 60_000),
          modelRequestId: "lost-owner",
        });
        const inFlight = await service(clientB).generatePersistedResult(input(notCalledWorld, "op-leased"));
        assert.equal(inFlight.kind, "in_progress");
        assert.equal(inFlight.operation.status, "model_in_flight");
        const expired = await service(clientB, { clock: () => new Date(FIXED_NOW.getTime() + 120_000) })
          .generatePersistedResult(input(notCalledWorld, "op-leased"));
        assert.equal(expired.kind, "model_unknown");
        assert.equal(expired.operation.status, "model_unknown");
        assert.equal(expired.failureCategory, "lease_expired");
        const unknownReplay = await service(clientA).generatePersistedResult(input(notCalledWorld, "op-leased"));
        assert.equal(unknownReplay.kind, "model_unknown");
        assert.equal(unknownReplay.operation.modelRequestId, "lost-owner");
        assert.equal(harness.calls.length, 3, "in-flight, lease-expired, and unknown replays make zero calls");
      } finally {
        harness.restore();
      }
    });

    await t.test("AC6 provider failures map to failed_terminal or model_unknown without results or world writes", async (t2) => {
      const worldId = "world-failures";
      await seedWorld(clientA, worldId);
      const before = await worldFacts(clientA, worldId);
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
        {
          operationId: "f-cancelled",
          cancel: true,
          kind: "model_unknown",
          category: "cancelled",
        },
        {
          operationId: "f-unstructured",
          unstructured: true,
          respond: async () => jsonStream(validOutput()),
          kind: "model_unknown",
          category: "unstructured_error",
        },
        {
          operationId: "f-persist",
          persistFailure: true,
          respond: async () => jsonStream(validOutput()),
          kind: "model_unknown",
          category: "persist_failed",
        },
      ];
      for (const scenario of scenarios) {
        await t2.test(`${scenario.operationId} -> ${scenario.kind}`, async () => {
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
          if (scenario.unstructured) {
            promptRunner.setPromptRunnerStructuredInvokerForTests(async (...args) => {
              await invokeStructuredLlmDetailed(...args);
              throw new TypeError("unstructured failure after the provider call");
            });
          }
          try {
            const generation = service(clientA, scenario.persistFailure
              ? { store: wrapStore(storeA, { persistResult: async () => { throw new Error("injected persist failure"); } }) }
              : {});
            const outcome = await generation.generatePersistedResult({
              ...input(worldId, scenario.operationId),
              signal: scenario.cancel ? controller.signal : undefined,
            });
            assert.equal(harness.calls.length, 1);
            assert.equal(harness.repairs.length, 0);
            assert.equal(outcome.kind, scenario.kind);
            assert.equal(outcome.operation.status, scenario.kind);
            assert.equal(outcome.failureCategory, scenario.category);
            assert.equal(outcome.result, null);
            const row = await operationRow(clientB, worldId, scenario.operationId);
            assert.equal(row.status, scenario.kind);
            assert.equal(row.result, null);

            const replay = await service(clientB).generatePersistedResult(input(worldId, scenario.operationId));
            assert.equal(replay.kind, scenario.kind);
            assert.equal(replay.replayed, true);
            assert.equal(harness.calls.length, 1, "terminal replays cannot reopen the call");
          } finally {
            harness.restore();
          }
        });
      }
      assert.deepEqual(await worldFacts(clientA, worldId), before);
    });

    await t.test("AC7 frozen identity: base drift, operation reuse, and registered prompt identity", async () => {
      const worldId = "world-identity";
      await seedWorld(clientA, worldId);
      const harness = installProvider(async () => jsonStream(validOutput()));
      try {
        await assert.rejects(
          service(clientA).generatePersistedResult(input(worldId, "op-stale", { baseContentRevision: 3 })),
          expectStoreError("BASE_REVISION_MISMATCH"),
        );
        assert.equal(await clientA.worldStructureBackfillOperation.count({ where: { worldId } }), 0);
        assert.equal(harness.calls.length, 0);

        const outcome = await service(clientA).generatePersistedResult(input(worldId, "op-identity"));
        const [attempt] = harness.repository.rows;
        assert.equal(attempt.mode, "invoke");
        assert.equal(attempt.prompt.promptId, worldStructureBackfillPrompt.id);
        assert.equal(attempt.prompt.promptVersion, worldStructureBackfillPrompt.version);
        assert.equal(outcome.operation.promptId, worldStructureBackfillPrompt.id);
        assert.equal(outcome.operation.promptVersion, worldStructureBackfillPrompt.version);
        const world = await clientA.world.findUnique({ where: { id: worldId } });
        const sourceDigest = createWorldStructureBackfillSourceDigest(buildWorldStructurePromptSource(world));
        assert.equal(outcome.operation.sourceDigest, sourceDigest);
        assert.equal(outcome.operation.requestHash, createWorldStructureBackfillRequestHash({
          worldId,
          operationId: "op-identity",
          baseContentRevision: 4,
          promptId: worldStructureBackfillPrompt.id,
          promptVersion: worldStructureBackfillPrompt.version,
          provider: PROVIDER,
          model: MODEL,
          generationPolicyVersion: WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION,
          sourceDigest,
        }));

        for (const overrides of [{ provider: "deepseek" }, { model: "other-model" }, { baseContentRevision: 5 }]) {
          await assert.rejects(
            service(clientB).generatePersistedResult(input(worldId, "op-identity", overrides)),
            expectStoreError("OPERATION_ID_REUSED"),
          );
        }
        assert.equal(harness.calls.length, 1);

        const startFailure = service(clientA, {
          store: wrapStore(storeA, { startModel: async () => { throw new Error("lost before start"); } }),
        });
        await assert.rejects(startFailure.generatePersistedResult(input(worldId, "op-drift-source")));
        await assert.rejects(startFailure.generatePersistedResult(input(worldId, "op-drift-revision")));
        const sourceBefore = await operationRow(clientA, worldId, "op-drift-source");
        await clientA.world.update({ where: { id: worldId }, data: { geography: "北门已被封锁。" } });
        await assert.rejects(
          service(clientB).generatePersistedResult(input(worldId, "op-drift-source")),
          expectStoreError("BASE_REVISION_MISMATCH"),
        );
        assert.deepEqual(await operationRow(clientA, worldId, "op-drift-source"), sourceBefore);

        const revisionBefore = await operationRow(clientA, worldId, "op-drift-revision");
        await clientA.world.update({
          where: { id: worldId },
          data: { geography: world.geography, contentRevision: { increment: 1 } },
        });
        await assert.rejects(
          service(clientB).generatePersistedResult(input(worldId, "op-drift-revision")),
          expectStoreError("BASE_REVISION_MISMATCH"),
        );
        assert.deepEqual(await operationRow(clientA, worldId, "op-drift-revision"), revisionBefore);
        assert.equal(harness.calls.length, 1);
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

/** Main thread: run one service instance on its own connection in a worker thread. */
function runConcurrentWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`));
    });
  });
}

/** Worker thread: provider calls are counted at this worker's provider .stream() layer. */
async function runWorker({ databasePath, worldId, operationId, barrier }) {
  const view = new Int32Array(barrier);
  const client = createPrisma(databasePath);
  const base = createWorldStructureBackfillStore(client);
  let start = null;
  const store = wrapStore(base, {
    read: async (w, o) => {
      const value = await base.read(w, o);
      arriveAtBarrier(view, 0);
      return value;
    },
    startModel: async (value) => {
      arriveAtBarrier(view, 1);
      const started = await base.startModel(value);
      start = {
        acquired: started.acquired,
        requestId: value.modelRequestId,
        hasCurrent: Boolean(started.current),
        currentModelRequestId: started.current?.operation.modelRequestId ?? null,
      };
      return started;
    },
  });
  const harness = installProvider(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return jsonStream(validOutput());
  });
  try {
    const outcome = await service(client, { store }).generatePersistedResult(input(worldId, operationId));
    parentPort.postMessage({
      ok: true,
      calls: harness.calls.length,
      start,
      attemptRequestIds: harness.repository.rows.map((row) => row.requestId),
      outcome: { kind: outcome.kind, replayed: outcome.replayed, digest: outcome.result?.digest ?? null },
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
