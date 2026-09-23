"use strict";

/**
 * S3-02b3s seam proof only.
 *
 * This file deliberately implements the proposed claim/result contract in an
 * isolated SQLite fixture. It is not imported by production backfill code and
 * does not claim that POST /worlds/:id/structure/backfill is idempotent today.
 * Every fixture is retained under /tmp/ai-novel-s3-02b3s-* for independent
 * review of the database rows and transition log.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const evidenceRoot = fs.mkdtempSync(path.join("/tmp", "ai-novel-s3-02b3s-"));
const fixtures = [];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeOperationInput(operationId, overrides = {}) {
  const input = {
    worldId: "world-spike",
    operationId,
    baseRevision: 1,
    promptId: "world.structure.backfill",
    promptVersion: "v1",
    provider: "mock-provider",
    model: "mock-model",
    sourceDigest: hash({ source: "world source at revision 1" }),
    ...overrides,
  };
  return {
    ...input,
    requestHash: hash({
      targetType: "world",
      targetId: input.worldId,
      operationType: "structure_backfill",
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      promptId: input.promptId,
      promptVersion: input.promptVersion,
      provider: input.provider,
      model: input.model,
      sourceDigest: input.sourceDigest,
    }),
  };
}

function mockStructure(operationId) {
  return {
    profile: { summary: `mock result for ${operationId}`, identity: "隔离测试世界", tone: "冷静", themes: [], coreConflict: "无" },
    rules: { summary: "mock", axioms: [], taboo: [], sharedConsequences: [] },
    factions: [],
    forces: [],
    locations: [],
    relations: { forceRelations: [], locationControls: [], locationConnections: [] },
    metadata: { schemaVersion: 1, seededFrom: "mock-model" },
  };
}

function normalizeModelOutput(raw, input) {
  const normalized = clone(raw);
  normalized.metadata = {
    ...(normalized.metadata || {}),
    schemaVersion: 1,
    operationId: input.operationId,
    baseRevision: input.baseRevision,
  };
  return normalized;
}

class IsolatedBackfillStore {
  constructor(label, existingDirectory = null) {
    this.directory = existingDirectory ?? fs.mkdtempSync(path.join(evidenceRoot, `${label}-`));
    this.databasePath = path.join(this.directory, "fixture.db");
    this.transitionPath = path.join(this.directory, "state-transitions.ndjson");
    this.db = new Database(this.databasePath);
    if (existingDirectory) {
      fixtures.push(this);
      return;
    }
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE worlds (
        id TEXT PRIMARY KEY,
        content_revision INTEGER NOT NULL,
        structure_json TEXT NOT NULL
      );
      CREATE TABLE backfill_operations (
        world_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        model_state TEXT NOT NULL,
        lease_until INTEGER,
        result_id TEXT,
        receipt_json TEXT,
        conflict_revision INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (world_id, operation_id)
      );
      CREATE TABLE backfill_results (
        result_id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        normalized_structure_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE backfill_receipts (
        operation_id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        committed_revision INTEGER NOT NULL,
        result_id TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    this.db.prepare("INSERT INTO worlds VALUES (?, ?, ?)").run(
      "world-spike",
      1,
      JSON.stringify({ source: "author content", revision: 1 }),
    );
    fixtures.push(this);
  }

  now() {
    return Date.now();
  }

  transition(operationId, from, to, reason, details = {}) {
    const row = {
      at: new Date().toISOString(),
      operationId,
      from,
      to,
      reason,
      ...details,
    };
    fs.appendFileSync(this.transitionPath, `${JSON.stringify(row)}\n`);
  }

  getOperation(input) {
    return this.db.prepare(
      "SELECT * FROM backfill_operations WHERE world_id = ? AND operation_id = ?",
    ).get(input.worldId, input.operationId);
  }

  getResult(input) {
    const operation = this.getOperation(input);
    if (!operation?.result_id) return null;
    const result = this.db.prepare("SELECT * FROM backfill_results WHERE result_id = ?").get(operation.result_id);
    return result ? { ...result, structure: JSON.parse(result.normalized_structure_json) } : null;
  }

  getReceipt(input) {
    const row = this.db.prepare("SELECT * FROM backfill_receipts WHERE operation_id = ?").get(input.operationId);
    return row ? JSON.parse(row.receipt_json) : null;
  }

  getWorld() {
    return this.db.prepare("SELECT * FROM worlds WHERE id = 'world-spike'").get();
  }

  claim(input, leaseMs = 1000) {
    const now = this.now();
    const claim = this.db.transaction(() => {
      const existing = this.getOperation(input);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO backfill_operations
            (world_id, operation_id, request_hash, base_revision, state, model_state, lease_until, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'model_not_called', 'not_called', ?, ?, ?)
        `).run(input.worldId, input.operationId, input.requestHash, input.baseRevision, now + leaseMs, now, now);
        this.transition(input.operationId, null, "model_not_called", "durable_claim_created");
        return { kind: "claimed" };
      }
      if (existing.request_hash !== input.requestHash) {
        return { kind: "operation_id_reused" };
      }
      if (existing.state === "committed") return { kind: "committed", receipt: this.getReceipt(input), result: this.getResult(input) };
      if (existing.state === "model_succeeded_pending_commit") return { kind: "result_pending", result: this.getResult(input) };
      if (existing.state === "conflict_result_retained") return { kind: "conflict_result_retained", result: this.getResult(input) };
      if (existing.state === "model_unknown") return { kind: "model_unknown" };
      if (existing.state === "failed_terminal") return { kind: "failed_terminal" };
      if (existing.state === "model_in_flight" && existing.lease_until <= now) {
        this.db.prepare("UPDATE backfill_operations SET state = 'model_unknown', model_state = 'unknown', updated_at = ? WHERE world_id = ? AND operation_id = ?")
          .run(now, input.worldId, input.operationId);
        this.transition(input.operationId, "model_in_flight", "model_unknown", "lease_expired_no_auto_retry");
        return { kind: "model_unknown" };
      }
      return { kind: existing.state };
    });
    return claim();
  }

  startModel(input, leaseMs = 1000) {
    const now = this.now();
    const result = this.db.prepare(`
      UPDATE backfill_operations
      SET state = 'model_in_flight', model_state = 'in_flight', lease_until = ?, updated_at = ?
      WHERE world_id = ? AND operation_id = ? AND state = 'model_not_called'
    `).run(now + leaseMs, now, input.worldId, input.operationId);
    if (result.changes !== 1) return false;
    this.transition(input.operationId, "model_not_called", "model_in_flight", "claim_owner_before_provider_call");
    return true;
  }

  markUnknown(input, reason) {
    const now = this.now();
    this.db.prepare("UPDATE backfill_operations SET state = 'model_unknown', model_state = 'unknown', updated_at = ? WHERE world_id = ? AND operation_id = ?")
      .run(now, input.worldId, input.operationId);
    this.transition(input.operationId, "model_in_flight", "model_unknown", reason);
  }

  persistResult(input, normalized) {
    const now = this.now();
    const resultId = `result-${input.operationId}`;
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO backfill_results
          (result_id, world_id, operation_id, request_hash, base_revision, normalized_structure_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(resultId, input.worldId, input.operationId, input.requestHash, input.baseRevision, JSON.stringify(normalized), now);
      this.db.prepare(`
        UPDATE backfill_operations
        SET state = 'model_succeeded_pending_commit', model_state = 'succeeded', result_id = ?, updated_at = ?
        WHERE world_id = ? AND operation_id = ? AND state = 'model_in_flight'
      `).run(resultId, now, input.worldId, input.operationId);
    })();
    this.transition(input.operationId, "model_in_flight", "model_succeeded_pending_commit", "normalized_result_durable");
    return resultId;
  }

  commit(input) {
    const operation = this.getOperation(input);
    if (operation?.state === "committed") return { state: "committed", replayed: true, receipt: this.getReceipt(input), result: this.getResult(input) };
    const result = this.getResult(input);
    if (!result) return { state: "result_missing" };
    const outcome = this.db.transaction(() => {
      const world = this.getWorld();
      const current = this.getOperation(input);
      if (world.content_revision !== input.baseRevision) {
        this.db.prepare(`
          UPDATE backfill_operations
          SET state = 'conflict_result_retained', conflict_revision = ?, updated_at = ?
          WHERE world_id = ? AND operation_id = ? AND state = 'model_succeeded_pending_commit'
        `).run(world.content_revision, this.now(), input.worldId, input.operationId);
        return { state: "conflict_result_retained", currentRevision: world.content_revision, result };
      }
      const committedRevision = world.content_revision + 1;
      const receipt = {
        operationId: input.operationId,
        worldId: input.worldId,
        baseRevision: input.baseRevision,
        committedRevision,
        resultId: current.result_id,
        normalizedStructureDigest: hash(result.structure),
      };
      const updated = this.db.prepare("UPDATE worlds SET structure_json = ?, content_revision = ? WHERE id = ? AND content_revision = ?")
        .run(JSON.stringify(result.structure), committedRevision, input.worldId, input.baseRevision);
      if (updated.changes !== 1) return { state: "commit_race" };
      this.db.prepare("INSERT INTO backfill_receipts VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(input.operationId, input.worldId, input.baseRevision, committedRevision, current.result_id, JSON.stringify(receipt), this.now());
      this.db.prepare("UPDATE backfill_operations SET state = 'committed', updated_at = ?, receipt_json = ? WHERE world_id = ? AND operation_id = ?")
        .run(this.now(), JSON.stringify(receipt), input.worldId, input.operationId);
      return { state: "committed", receipt, result };
    })();
    if (outcome.state === "conflict_result_retained") {
      this.transition(input.operationId, "model_succeeded_pending_commit", "conflict_result_retained", "base_revision_changed_no_world_write", {
        currentRevision: outcome.currentRevision,
      });
    } else if (outcome.state === "committed") {
      this.transition(input.operationId, "model_succeeded_pending_commit", "committed", "cas_commit_and_receipt");
    }
    return outcome;
  }

  writeEvidence(label, modelCalls) {
    const transitions = fs.readFileSync(this.transitionPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    const evidence = {
      label,
      databasePath: this.databasePath,
      transitionPath: this.transitionPath,
      modelCalls,
      finalWorld: this.getWorld(),
      operations: this.db.prepare("SELECT world_id, operation_id, request_hash, base_revision, state, model_state, result_id, receipt_json, conflict_revision FROM backfill_operations").all(),
      results: this.db.prepare("SELECT result_id, world_id, operation_id, request_hash, base_revision, normalized_structure_json FROM backfill_results").all(),
      receipts: this.db.prepare("SELECT operation_id, world_id, base_revision, committed_revision, result_id, receipt_json FROM backfill_receipts").all(),
      transitions,
    };
    fs.writeFileSync(path.join(this.directory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`[s3-02b3s] ${label}: db=${this.databasePath} transitions=${transitions.map((item) => `${item.from ?? "none"}->${item.to}`).join(",")} modelCalls=${modelCalls}`);
  }

  close() {
    this.db.close();
  }
}

class MockModel {
  constructor({ delayMs = 0, failure = null } = {}) {
    this.delayMs = delayMs;
    this.failure = failure;
    this.calls = 0;
  }

  async generate(input) {
    this.calls += 1;
    if (this.delayMs) await delay(this.delayMs);
    if (this.failure) throw this.failure;
    return mockStructure(input.operationId);
  }
}

async function executeBackfill(store, model, input, options = {}) {
  const claimed = store.claim(input, options.leaseMs ?? 1000);
  if (claimed.kind === "operation_id_reused") throw new Error("operation_id_reused");
  if (claimed.kind === "committed") return { state: "committed", replayed: true, receipt: claimed.receipt, result: claimed.result };
  if (claimed.kind === "result_pending") return store.commit(input);
  if (claimed.kind === "conflict_result_retained") return { state: "conflict_result_retained", result: claimed.result };
  if (claimed.kind === "model_unknown") return { state: "model_unknown" };
  if (claimed.kind === "failed_terminal") return { state: "failed_terminal" };
  if (claimed.kind !== "claimed") return { state: claimed.kind };

  assert.equal(store.startModel(input, options.leaseMs ?? 1000), true, "only claim owner can start model");
  let raw;
  try {
    raw = await model.generate(input);
  } catch (error) {
    store.markUnknown(input, error.code === "TRANSPORT_UNKNOWN" ? "provider_outcome_unknown" : "provider_failure_without_safe_retry");
    return { state: "model_unknown" };
  }
  const normalized = normalizeModelOutput(raw, input);
  store.persistResult(input, normalized);
  if (options.abortBeforeCommit) return { state: "result_pending", result: store.getResult(input) };
  if (options.beforeCommit) await options.beforeCommit();
  const committed = store.commit(input);
  if (options.responseLost && committed.state === "committed") {
    const error = new Error("response_lost_after_commit");
    error.code = "RESPONSE_LOST";
    throw error;
  }
  return committed;
}

test("同 operation 并发与重放共享 durable claim，最多一次 mock 模型调用", async () => {
  const store = new IsolatedBackfillStore("concurrency");
  const competingStore = new IsolatedBackfillStore("concurrency-competing", store.directory);
  const model = new MockModel({ delayMs: 30 });
  const input = makeOperationInput("op-concurrent");
  const outcomes = await Promise.all([
    executeBackfill(store, model, input),
    executeBackfill(competingStore, model, input),
  ]);
  assert.equal(model.calls, 1);
  assert.equal(outcomes.filter((item) => item.state === "committed").length, 1);
  const replay = await executeBackfill(store, model, input);
  assert.equal(replay.replayed, true);
  assert.equal(model.calls, 1);
  const mismatched = makeOperationInput(input.operationId, { provider: "different-mock-provider" });
  await assert.rejects(() => executeBackfill(store, model, mismatched), /operation_id_reused/);
  assert.equal(model.calls, 1, "request hash mismatch cannot trigger another provider call");
  assert.equal(store.getWorld().content_revision, 2);
  competingStore.close();
  store.writeEvidence("concurrency", model.calls);
  store.close();
});

test("模型成功但提交前中断后复用 durable result，不重新调用模型", async () => {
  const store = new IsolatedBackfillStore("result-recovery");
  const model = new MockModel();
  const input = makeOperationInput("op-result-recovery");
  const interrupted = await executeBackfill(store, model, input, { abortBeforeCommit: true });
  assert.equal(interrupted.state, "result_pending");
  assert.equal(model.calls, 1);
  assert.ok(store.getResult(input));
  const fixtureDirectory = store.directory;
  store.close();
  const reopened = new IsolatedBackfillStore("result-recovery-reopened", fixtureDirectory);
  const persistedAfterRestart = reopened.getResult(input);
  assert.ok(persistedAfterRestart, "normalized result survives a new SQLite connection");
  const resumed = await executeBackfill(reopened, model, input);
  assert.equal(resumed.state, "committed");
  assert.equal(model.calls, 1);
  assert.equal(resumed.result.structure.metadata.operationId, input.operationId);
  reopened.writeEvidence("result-recovery", model.calls);
  reopened.close();
});

test("模型状态未知时重启与 lease 到期都不自动重调", async () => {
  const store = new IsolatedBackfillStore("unknown-restart");
  const model = new MockModel({ failure: Object.assign(new Error("provider did not confirm outcome"), { code: "TRANSPORT_UNKNOWN" }) });
  const input = makeOperationInput("op-unknown");
  const first = await executeBackfill(store, model, input, { leaseMs: 10 });
  assert.equal(first.state, "model_unknown");
  assert.equal(model.calls, 1);
  store.db.prepare("UPDATE backfill_operations SET lease_until = ? WHERE operation_id = ?").run(Date.now() - 1, input.operationId);
  const leaseInput = makeOperationInput("op-lease-expired");
  assert.deepEqual(store.claim(leaseInput, 10), { kind: "claimed" });
  assert.equal(store.startModel(leaseInput, 10), true);
  store.db.prepare("UPDATE backfill_operations SET lease_until = ? WHERE operation_id = ?").run(Date.now() - 1, leaseInput.operationId);
  store.close();

  // Reopen the original isolated fixture rather than using application/user storage.
  const reopened = new IsolatedBackfillStore("unknown-restart-reopened", store.directory);
  const row = reopened.db.prepare("SELECT state, model_state FROM backfill_operations WHERE operation_id = ?").get(input.operationId);
  assert.deepEqual(row, { state: "model_unknown", model_state: "unknown" });
  const noCallModel = new MockModel();
  const afterRestart = await executeBackfill(reopened, noCallModel, input);
  assert.equal(afterRestart.state, "model_unknown");
  const afterLease = await executeBackfill(reopened, noCallModel, leaseInput);
  assert.equal(afterLease.state, "model_unknown");
  assert.equal(noCallModel.calls, 0);
  reopened.writeEvidence("unknown-restart-and-lease", model.calls + noCallModel.calls);
  reopened.close();
});

test("生成期间 revision 改变时 CAS 零世界覆盖并保留结果", async () => {
  const store = new IsolatedBackfillStore("revision-conflict");
  const model = new MockModel();
  const input = makeOperationInput("op-revision-conflict");
  const result = await executeBackfill(store, model, input, {
    beforeCommit: async () => {
      store.db.prepare("UPDATE worlds SET structure_json = ?, content_revision = 2 WHERE id = ? AND content_revision = 1")
        .run(JSON.stringify({ source: "newer author content", revision: 2 }), input.worldId);
    },
  });
  assert.equal(result.state, "conflict_result_retained");
  assert.equal(model.calls, 1);
  assert.deepEqual(JSON.parse(store.getWorld().structure_json), { source: "newer author content", revision: 2 });
  assert.ok(store.getResult(input));
  assert.equal(store.getOperation(input).state, "conflict_result_retained");
  store.writeEvidence("revision-conflict", model.calls);
  store.close();
});

test("提交成功但响应丢失可按 operation 读回 receipt 与 normalized result", async () => {
  const store = new IsolatedBackfillStore("response-lost");
  const model = new MockModel();
  const input = makeOperationInput("op-response-lost");
  await assert.rejects(() => executeBackfill(store, model, input, { responseLost: true }), /response_lost_after_commit/);
  assert.equal(model.calls, 1);
  const receipt = store.getReceipt(input);
  const result = store.getResult(input);
  assert.equal(receipt.operationId, input.operationId);
  assert.equal(receipt.committedRevision, 2);
  assert.equal(result.structure.metadata.operationId, input.operationId);
  const replay = await executeBackfill(store, model, input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, receipt);
  assert.deepEqual(replay.result.structure, result.structure);
  assert.equal(model.calls, 1);
  store.writeEvidence("response-lost", model.calls);
  store.close();
});

test.after(() => {
  const summaryPath = path.join(evidenceRoot, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({ root: evidenceRoot, fixtures: fixtures.map((item) => ({ directory: item.directory, databasePath: item.databasePath, transitionPath: item.transitionPath })) }, null, 2)}\n`);
  console.log(`[s3-02b3s] retained evidence root: ${evidenceRoot}`);
});
