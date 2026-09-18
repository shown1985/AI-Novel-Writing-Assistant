import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizeModelAttemptInput,
  ModelAttemptAttribution,
  StartModelAttemptInput,
} from "./contracts";
import { PersistedModelAttemptRepository } from "./PersistedModelAttemptRepository";
import type {
  FinalizeModelAttemptStorePatch,
  ModelAttemptStore,
  ModelAttemptStoreRow,
  ModelAttemptStoreTransaction,
  StartModelAttemptStoreRow,
} from "./store";

function cloneRow(row: ModelAttemptStoreRow): ModelAttemptStoreRow {
  return {
    ...row,
    startedAt: new Date(row.startedAt),
    finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
  };
}

class IsolatedMemoryAttemptStore implements ModelAttemptStore {
  private rows = new Map<string, ModelAttemptStoreRow>();
  private readonly requestTails = new Map<string, Promise<void>>();

  constructor(seedRows: ModelAttemptStoreRow[] = []) {
    for (const row of seedRows) {
      this.rows.set(row.attemptId, cloneRow(row));
    }
  }

  async withRequestTransaction<T>(
    requestId: string,
    operation: (transaction: ModelAttemptStoreTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.requestTails.get(requestId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.requestTails.set(requestId, previous.then(() => current));
    await previous;

    const snapshot = new Map([...this.rows].map(([attemptId, row]) => [attemptId, cloneRow(row)]));
    const transaction: ModelAttemptStoreTransaction = {
      findByAttemptId: async (attemptId) => this.cloneOrNull(this.rows.get(attemptId)),
      findByRequestAndIndex: async (candidateRequestId, attemptIndex) => this.cloneOrNull(
        [...this.rows.values()].find((row) => (
          row.requestId === candidateRequestId && row.attemptIndex === attemptIndex
        )),
      ),
      listByRequestId: async (candidateRequestId) => [...this.rows.values()]
        .filter((row) => row.requestId === candidateRequestId)
        .map(cloneRow),
      insertIfAbsent: async (row) => this.insertIfAbsent(row),
      finalizeIfStarted: async (attemptId, patch) => this.finalizeIfStarted(attemptId, patch),
    };
    try {
      return await operation(transaction);
    } catch (error) {
      this.rows = snapshot;
      throw error;
    } finally {
      release?.();
      if (this.requestTails.get(requestId) === current) {
        this.requestTails.delete(requestId);
      }
    }
  }

  async findByAttemptId(attemptId: string): Promise<ModelAttemptStoreRow | null> {
    return this.cloneOrNull(this.rows.get(attemptId));
  }

  async listByRequestId(requestId: string): Promise<ModelAttemptStoreRow[]> {
    return [...this.rows.values()].filter((row) => row.requestId === requestId).map(cloneRow);
  }

  async listByNovelId(novelId: string): Promise<ModelAttemptStoreRow[]> {
    return [...this.rows.values()].filter((row) => row.novelId === novelId).map(cloneRow);
  }

  exportRows(): ModelAttemptStoreRow[] {
    return [...this.rows.values()].map(cloneRow);
  }

  private cloneOrNull(row: ModelAttemptStoreRow | undefined): ModelAttemptStoreRow | null {
    return row ? cloneRow(row) : null;
  }

  private insertIfAbsent(row: StartModelAttemptStoreRow): boolean {
    if (
      this.rows.has(row.attemptId)
      || [...this.rows.values()].some((candidate) => (
        candidate.requestId === row.requestId && candidate.attemptIndex === row.attemptIndex
      ))
    ) {
      return false;
    }
    this.rows.set(row.attemptId, cloneRow(row));
    return true;
  }

  private finalizeIfStarted(attemptId: string, patch: FinalizeModelAttemptStorePatch): boolean {
    const existing = this.rows.get(attemptId);
    if (!existing || existing.status !== "started") {
      return false;
    }
    this.rows.set(attemptId, cloneRow({ ...existing, ...patch }));
    return true;
  }
}

function attribution(novelId: string): ModelAttemptAttribution {
  return {
    kind: "novel_world_generate",
    source: "prompt_invocation",
    novelId,
    taskId: null,
    directorRunId: null,
    directorStepIdempotencyKey: null,
    directorNodeKey: null,
    chapterId: null,
    entrypoint: "novel-world-generate",
  };
}

function startInput(overrides: Partial<StartModelAttemptInput> = {}): StartModelAttemptInput {
  return {
    requestId: "request-a",
    attemptId: "attempt-a0",
    parentAttemptId: null,
    attemptIndex: 0,
    role: "primary",
    routeTier: "primary",
    mode: "invoke",
    provider: "mock-provider",
    model: "mock/model-a",
    structuredStrategy: null,
    attribution: attribution("novel-a"),
    prompt: {
      promptId: "world.generate",
      promptVersion: "v1",
      taskType: "world",
      modelRoute: "planner",
    },
    startedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function finalizeInput(overrides: Partial<FinalizeModelAttemptInput> = {}): FinalizeModelAttemptInput {
  return {
    requestId: "request-a",
    attemptId: "attempt-a0",
    status: "succeeded",
    finalAdoption: "adopted",
    usage: null,
    failure: null,
    finishedAt: "2026-09-18T00:00:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

test("start/finalize are idempotent, null usage survives, and terminal conflicts never rewrite", async () => {
  const store = new IsolatedMemoryAttemptStore();
  const repository = new PersistedModelAttemptRepository(store);
  const start = startInput();
  const terminal = finalizeInput();

  await repository.startAttempt(start);
  await repository.startAttempt(start);
  await repository.finalizeAttempt(terminal);
  await repository.startAttempt(start);
  await repository.finalizeAttempt(terminal);

  await assert.rejects(
    repository.finalizeAttempt({ ...terminal, finalAdoption: "not_adopted" }),
    /attempt_finalize_conflict/,
  );
  const record = await repository.findAttempt(start.attemptId);
  assert.equal(record?.status, "succeeded");
  assert.equal(record?.finalAdoption, "adopted");
  assert.equal(record?.usage, null);
});

test("a started row remains intact when the process never finalizes it", async () => {
  const store = new IsolatedMemoryAttemptStore();
  const repository = new PersistedModelAttemptRepository(store);
  await repository.startAttempt(startInput({ requestId: "crash-request", attemptId: "crash-attempt" }));

  const reconstructed = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore(store.exportRows()));
  const record = await reconstructed.findAttempt("crash-attempt");
  assert.equal(record?.status, "started");
  assert.equal(record?.finalAdoption, "pending");
  assert.equal(record?.finishedAt, null);
});

test("concurrent terminal writes allow at most one adopted attempt per request", async () => {
  const store = new IsolatedMemoryAttemptStore();
  const repository = new PersistedModelAttemptRepository(store);
  await repository.startAttempt(startInput());
  await repository.startAttempt(startInput({
    attemptId: "attempt-a1",
    parentAttemptId: "attempt-a0",
    attemptIndex: 1,
    role: "transport_retry",
    startedAt: "2026-09-18T00:00:00.100Z",
  }));

  const outcomes = await Promise.allSettled([
    repository.finalizeAttempt(finalizeInput()),
    repository.finalizeAttempt(finalizeInput({
      attemptId: "attempt-a1",
      finishedAt: "2026-09-18T00:00:01.100Z",
    })),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.match(String(outcomes.find((outcome) => outcome.status === "rejected")?.reason), /request_already_adopted/);

  const evidence = await repository.reconstructRequest("request-a");
  assert.equal(evidence?.attempts.filter((attempt) => attempt.finalAdoption === "adopted").length, 1);
  assert.ok(evidence?.adoptedAttemptId);
});

test("request index uniqueness, contiguous lineage, and immutable request identity are enforced", async () => {
  const repository = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore());
  await repository.startAttempt(startInput());

  await assert.rejects(
    repository.startAttempt(startInput({ attemptId: "same-index" })),
    /attempt_index_conflict/,
  );
  await assert.rejects(
    repository.startAttempt(startInput({
      attemptId: "gap",
      attemptIndex: 2,
      parentAttemptId: "attempt-a0",
      role: "transport_retry",
    })),
    /attempt_index_gap/,
  );
  await assert.rejects(
    repository.startAttempt(startInput({
      attemptId: "wrong-novel",
      attemptIndex: 1,
      parentAttemptId: "attempt-a0",
      role: "transport_retry",
      attribution: attribution("novel-b"),
    })),
    /attempt_request_identity_conflict/,
  );
});

test("repair attempts may use a distinct prompt identity within the same request", async () => {
  const repository = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore());
  await repository.startAttempt(startInput());
  await repository.startAttempt(startInput({
    attemptId: "repair-attempt",
    attemptIndex: 1,
    parentAttemptId: "attempt-a0",
    role: "json_repair",
    prompt: {
      promptId: "structured.json-repair",
      promptVersion: "v3",
      taskType: "json_repair",
      modelRoute: "repair",
    },
  }));

  const evidence = await repository.reconstructRequest("request-a");
  assert.deepEqual(evidence?.attempts.map((attempt) => attempt.prompt.promptId), [
    "world.generate",
    "structured.json-repair",
  ]);
});

test("restart reconstruction preserves ordered aggregates and isolates novels", async () => {
  const store = new IsolatedMemoryAttemptStore();
  const repository = new PersistedModelAttemptRepository(store);
  await repository.startAttempt(startInput());
  await repository.finalizeAttempt(finalizeInput({ finalAdoption: "not_adopted" }));
  await repository.startAttempt(startInput({
    requestId: "request-b",
    attemptId: "attempt-b0",
    attribution: attribution("novel-b"),
    startedAt: "2026-09-18T00:00:02.000Z",
  }));

  const restarted = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore(store.exportRows()));
  assert.deepEqual((await restarted.findByNovelId("novel-a")).map((row) => row.requestId), ["request-a"]);
  assert.deepEqual((await restarted.findByNovelId("novel-b")).map((row) => row.requestId), ["request-b"]);
  assert.equal((await restarted.reconstructRequest("request-a"))?.attempts[0]?.attemptId, "attempt-a0");
  assert.equal(await restarted.reconstructRequest("missing-request"), null);
});

test("only the allow-listed scalar projection is persisted", async () => {
  const store = new IsolatedMemoryAttemptStore();
  const repository = new PersistedModelAttemptRepository(store);
  const unsafeRuntimeInput = {
    ...startInput({ requestId: "redacted-request", attemptId: "redacted-attempt" }),
    apiKey: "sk-never-store",
    baseUrl: "https://private.invalid/v1",
    headers: { authorization: "Bearer never-store" },
    promptText: "private manuscript context",
    output: "private model output",
    reasoning: "private reasoning",
    providerErrorBody: "private provider error",
  } as StartModelAttemptInput;
  await repository.startAttempt(unsafeRuntimeInput);

  const serialized = JSON.stringify(store.exportRows());
  for (const forbidden of [
    "sk-never-store",
    "private.invalid",
    "Bearer never-store",
    "private manuscript context",
    "private model output",
    "private reasoning",
    "private provider error",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("legacy or unknown persisted classifiers are projected as explicit unknown facts", async () => {
  const baseStore = new IsolatedMemoryAttemptStore();
  const baseRepository = new PersistedModelAttemptRepository(baseStore);
  await baseRepository.startAttempt(startInput({ requestId: "legacy-request", attemptId: "legacy-attempt" }));
  const legacyRow = baseStore.exportRows()[0];
  assert.ok(legacyRow);
  const legacyStore = new IsolatedMemoryAttemptStore([{
    ...legacyRow,
    role: "old_role",
    routeTier: "old_tier",
    mode: "old_mode",
    status: "old_status",
    finalAdoption: "old_adoption",
    attributionKind: "old_kind",
    attributionSource: "old_source",
    provider: null,
    model: null,
    failureCode: "secret_shaped_but_syntactically_safe",
    failureCategory: "transport",
    failureRetryable: false,
  }]);
  const record = await new PersistedModelAttemptRepository(legacyStore).findAttempt("legacy-attempt");

  assert.equal(record?.role, "legacy_unknown");
  assert.equal(record?.routeTier, "legacy_unknown");
  assert.equal(record?.mode, "legacy_unknown");
  assert.equal(record?.status, "legacy_unknown");
  assert.equal(record?.finalAdoption, "legacy_unknown");
  assert.equal(record?.attribution.kind, "unattributed");
  assert.equal(record?.attribution.source, "legacy_unknown");
  assert.equal(record?.provider, null);
  assert.equal(record?.model, null);
  assert.equal(record?.failure?.code, "legacy_unknown");
});

test("stable failure metadata is accepted while provider error bodies are rejected", async () => {
  const repository = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore());
  await repository.startAttempt(startInput());
  await repository.finalizeAttempt(finalizeInput({
    status: "failed",
    finalAdoption: "not_adopted",
    failure: { code: "upstream_timeout", category: "timeout", retryable: true },
  }));
  const failed = await repository.findAttempt("attempt-a0");
  assert.deepEqual(failed?.failure, { code: "upstream_timeout", category: "timeout", retryable: true });

  const second = new PersistedModelAttemptRepository(new IsolatedMemoryAttemptStore());
  await second.startAttempt(startInput());
  await assert.rejects(
    second.finalizeAttempt(finalizeInput({
      status: "failed",
      finalAdoption: "not_adopted",
      failure: {
        code: "transport_secret_abcdef1234567890" as "transport_error",
        category: "transport",
        retryable: false,
      },
    })),
    /invalid_attempt_failure/,
  );
});
