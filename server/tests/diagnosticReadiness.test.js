const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { Prisma, PrismaClient } = require("@prisma/client");
const {
  DiagnosticService,
  ConfigurationFingerprint,
  PrismaDiagnosticStore,
} = require("../dist/modules/diagnostics/index.js");

function target(state = "not_checked", errorSummary = null) {
  return {
    targetId: "model-route:writer",
    targetKind: "model_route",
    taskType: "writer",
    provider: "mock",
    model: "mock-model",
    checkState: state,
    checkedAt: state === "not_checked" ? null : new Date().toISOString(),
    errorSummary,
    capabilities: [{
      capability: "plain",
      checkState: state,
      latencyMs: state === "healthy" ? 1 : null,
      errorSummary,
    }],
    recommendation: null,
    revision: 1,
  };
}

class MemoryStore {
  constructor() {
    this.runs = [];
    this.claims = 0;
    this.completions = 0;
  }

  async read(scope) {
    return this.runs
      .filter((run) => run.scope === scope)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  }

  async claim(snapshot, expiresAt) {
    this.claims += 1;
    const active = this.runs.find((run) => run.scope === snapshot.scope
      && run.configurationFingerprint === snapshot.configurationFingerprint
      && !run.completedAt
      && run.leaseExpiresAt.getTime() > Date.now());
    if (active) return { acquired: false, run: active };
    const run = {
      id: `run-${this.runs.length + 1}`,
      scope: snapshot.scope,
      configurationFingerprint: snapshot.configurationFingerprint,
      checkState: "not_checked",
      startedAt: new Date(),
      completedAt: null,
      leaseExpiresAt: expiresAt,
      targets: [],
    };
    this.runs.unshift(run);
    return { acquired: true, run };
  }

  async complete(id, targets) {
    this.completions += 1;
    const run = this.runs.find((item) => item.id === id);
    run.targets = targets;
    run.checkState = targets.every((item) => item.checkState === "healthy") ? "healthy" : "failed";
    run.completedAt = new Date();
    run.leaseExpiresAt = null;
  }

  async prune() {}
}

test("passive readiness reads current configuration without probing or claiming", async () => {
  const store = new MemoryStore();
  store.runs.push({
    id: "expired-run",
    scope: "model_routes",
    configurationFingerprint: "fingerprint-a",
    checkState: "not_checked",
    startedAt: new Date(Date.now() - 120_000),
    completedAt: null,
    leaseExpiresAt: new Date(Date.now() - 60_000),
    targets: [],
  });
  let probes = 0;
  const service = new DiagnosticService(store, async (scope) => ({
    scope,
    configurationFingerprint: "fingerprint-a",
    targets: [target()],
    probe: async () => {
      probes += 1;
      return [target("healthy")];
    },
  }));

  const report = await service.read("model_routes");
  assert.equal(report.checkState, "not_checked");
  assert.equal(report.pending, undefined);
  assert.equal(probes, 0);
  assert.equal(store.claims, 0);
  assert.equal(store.completions, 0);
});

test("same-fingerprint checks share one probe and completed report survives service restart", async () => {
  const store = new MemoryStore();
  let probes = 0;
  let releaseProbe;
  const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
  const loader = async (scope) => ({
    scope,
    configurationFingerprint: "fingerprint-a",
    targets: [target()],
    probe: async () => {
      probes += 1;
      await probeGate;
      return [target("healthy")];
    },
  });
  const service = new DiagnosticService(store, loader);
  const first = service.check("model_routes");
  const second = service.check("model_routes");
  await new Promise((resolve) => setImmediate(resolve));
  releaseProbe();
  const [firstReport, secondReport] = await Promise.all([first, second]);

  assert.equal(probes, 1);
  assert.equal(store.completions, 1);
  assert.equal(firstReport.diagnosticId, secondReport.diagnosticId);
  assert.equal(firstReport.checkState, "healthy");
  const restarted = new DiagnosticService(store, loader);
  assert.equal((await restarted.read("model_routes")).checkState, "healthy");
});

test("configuration changes make old reports stale and a failed retry keeps prior healthy evidence", async () => {
  const store = new MemoryStore();
  let fingerprint = "fingerprint-a";
  let fail = false;
  const service = new DiagnosticService(store, async (scope) => ({
    scope,
    configurationFingerprint: fingerprint,
    targets: [target()],
    probe: async () => [target(fail ? "failed" : "healthy", fail ? "secret=must-not-survive" : null)],
  }));
  await service.check("model_routes");
  fail = true;
  await service.check("model_routes");
  const failed = await service.read("model_routes");
  assert.equal(failed.checkState, "failed");
  assert.equal(failed.previousReport.checkState, "healthy");

  await service.check("model_routes");
  const failedAgain = await service.read("model_routes");
  assert.equal(failedAgain.checkState, "failed");
  assert.equal(failedAgain.previousReport.checkState, "failed");

  fingerprint = "fingerprint-b";
  const stale = await service.read("model_routes");
  assert.equal(stale.checkState, "stale");
  assert.ok(stale.targets.every((item) => item.checkState === "stale"));
});

async function createDiagnosticDatabase() {
  const databasePath = path.join(os.tmpdir(), `ai-novel-diagnostics-${randomUUID()}.db`);
  const client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }),
  });
  const statements = [
    `CREATE TABLE "DiagnosticRun" ("id" TEXT NOT NULL PRIMARY KEY, "scope" TEXT NOT NULL, "configurationFingerprint" TEXT NOT NULL, "checkState" TEXT NOT NULL, "startedAt" DATETIME NOT NULL, "completedAt" DATETIME, "errorSummary" TEXT, "activeClaimKey" TEXT, "leaseExpiresAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`,
    `CREATE TABLE "DiagnosticTargetResult" ("id" TEXT NOT NULL PRIMARY KEY, "runId" TEXT NOT NULL, "targetId" TEXT NOT NULL, "targetKind" TEXT NOT NULL, "taskType" TEXT, "provider" TEXT, "model" TEXT, "checkState" TEXT NOT NULL, "capabilitiesJson" TEXT NOT NULL, "errorSummary" TEXT, "recommendationJson" TEXT, "revision" INTEGER NOT NULL DEFAULT 0, "checkedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DiagnosticTargetResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
    `CREATE TABLE "DiagnosticRecommendationApplication" ("id" TEXT NOT NULL PRIMARY KEY, "operationId" TEXT NOT NULL, "diagnosticId" TEXT NOT NULL, "selectionHash" TEXT NOT NULL, "expectedFingerprint" TEXT NOT NULL, "currentFingerprint" TEXT NOT NULL, "resultJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DiagnosticRecommendationApplication_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "DiagnosticRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
    `CREATE UNIQUE INDEX "DiagnosticRun_activeClaimKey_key" ON "DiagnosticRun"("activeClaimKey")`,
    `CREATE INDEX "DiagnosticRun_scope_createdAt_idx" ON "DiagnosticRun"("scope", "createdAt")`,
    `CREATE UNIQUE INDEX "DiagnosticTargetResult_runId_targetId_key" ON "DiagnosticTargetResult"("runId", "targetId")`,
    `CREATE UNIQUE INDEX "DiagnosticRecommendationApplication_operationId_key" ON "DiagnosticRecommendationApplication"("operationId")`,
  ];
  for (const statement of statements) await client.$executeRawUnsafe(statement);
  return client;
}

test("Prisma store atomically merges claims, reclaims expired leases, persists sanitized results", async () => {
  const client = await createDiagnosticDatabase();
  try {
    const store = new PrismaDiagnosticStore(client);
    const snapshot = {
      scope: "model_routes",
      configurationFingerprint: "fingerprint-a",
      targets: [target()],
      probe: async () => [target("healthy")],
    };
    const concurrentStore = new PrismaDiagnosticStore(client);
    const claims = await Promise.all([
      store.claim(snapshot, new Date(Date.now() + 60_000)),
      concurrentStore.claim(snapshot, new Date(Date.now() + 60_000)),
    ]);
    const first = claims.find((claim) => claim.acquired);
    const duplicate = claims.find((claim) => !claim.acquired);
    assert.ok(first);
    assert.ok(duplicate);
    assert.equal(duplicate.run.id, first.run.id);

    await client.diagnosticRun.update({
      where: { id: first.run.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const reclaimed = await store.claim(snapshot, new Date(Date.now() + 60_000));
    assert.equal(reclaimed.acquired, true);
    assert.notEqual(reclaimed.run.id, first.run.id);
    await store.complete(reclaimed.run.id, [target("failed", "Bearer paid-secret https://service.test/?key=secret")]);

    const restartedStore = new PrismaDiagnosticStore(client);
    const persisted = await restartedStore.read("model_routes");
    const latest = persisted.find((run) => run.id === reclaimed.run.id);
    assert.equal(latest.checkState, "failed");
    assert.equal(latest.targets[0].errorSummary, "检测未完成，请检查连接配置后重试。");
    assert.doesNotMatch(JSON.stringify(latest), /paid-secret|service\.test|key=secret/);

    const recommended = await store.claim({
      ...snapshot,
      configurationFingerprint: "fingerprint-recommended",
    }, new Date(Date.now() + 60_000));
    await store.complete(recommended.run.id, [{
      ...target("healthy"),
      recommendation: {
        recommendationId: "recommendation-preserved",
        requestProtocol: "openai_compatible",
        structuredResponseFormat: "prompt_json",
        reason: "请确认后再应用。",
      },
    }]);

    for (let index = 0; index < 25; index += 1) {
      const claim = await store.claim(snapshot, new Date(Date.now() + 60_000));
      await store.complete(claim.run.id, [target(index % 2 === 0 ? "healthy" : "failed")]);
    }
    const otherSnapshot = { ...snapshot, configurationFingerprint: "fingerprint-active" };
    await store.claim(otherSnapshot, new Date(Date.now() + 60_000));
    await store.prune("model_routes");
    const rows = await store.read("model_routes");
    assert.equal(rows.filter((run) => run.completedAt).length, 21);
    assert.equal(rows.filter((run) => !run.completedAt).length, 1);
    assert.ok(rows.some((run) => run.id === recommended.run.id));
  } finally {
    await client.$disconnect();
  }
});

test("a unique-claim loser reads the winner even when it completed before the retry", async () => {
  const completedAt = new Date();
  const completedWinner = {
    id: "winner-run",
    scope: "model_routes",
    configurationFingerprint: "fingerprint-a",
    checkState: "healthy",
    startedAt: new Date(completedAt.getTime() - 10),
    completedAt,
    errorSummary: null,
    activeClaimKey: null,
    leaseExpiresAt: null,
    createdAt: new Date(completedAt.getTime() - 10),
    updatedAt: completedAt,
    targets: [],
  };
  const client = {
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError("claim lost", {
        code: "P2002",
        clientVersion: "test",
      });
    },
    diagnosticRun: {
      findFirst: async () => completedWinner,
    },
  };
  const store = new PrismaDiagnosticStore(client);
  const claim = await store.claim({
    scope: "model_routes",
    configurationFingerprint: "fingerprint-a",
    targets: [target()],
    probe: async () => [target("healthy")],
  }, new Date(Date.now() + 60_000));

  assert.equal(claim.acquired, false);
  assert.equal(claim.run.id, "winner-run");
  assert.equal(claim.run.checkState, "healthy");
});

test("configuration fingerprints are opaque, secret-sensitive, and stable across instances", async () => {
  const directory = path.join(os.tmpdir(), `ai-novel-diagnostic-fingerprint-${randomUUID()}`);
  const first = new ConfigurationFingerprint(directory);
  const second = new ConfigurationFingerprint(directory);
  const value = { provider: "mock", credential: "paid-secret-value", baseURL: "https://service.test" };
  const firstDigest = await first.create(value);
  const restartedDigest = await second.create(value);
  const changedDigest = await second.create({ ...value, credential: "different-secret" });
  assert.equal(firstDigest, restartedDigest);
  assert.notEqual(firstDigest, changedDigest);
  assert.match(firstDigest, /^hmac-v1:[a-f0-9]{64}$/);
  assert.doesNotMatch(firstDigest, /paid-secret|service\.test/);
});
