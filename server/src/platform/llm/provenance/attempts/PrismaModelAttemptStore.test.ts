import assert from "node:assert/strict";
import test from "node:test";
import { PrismaModelAttemptStore } from "./PrismaModelAttemptStore";
import type { ModelAttemptStoreRow } from "./store";

function row(): ModelAttemptStoreRow {
  return {
    attemptId: "attempt-0",
    requestId: "request-0",
    parentAttemptId: null,
    attemptIndex: 0,
    role: "primary",
    routeTier: "primary",
    mode: "invoke",
    status: "started",
    finalAdoption: "pending",
    provider: "mock",
    model: "model-a",
    structuredStrategy: null,
    attributionKind: "novel_world_generate",
    attributionSource: "prompt_invocation",
    novelId: "novel-a",
    taskId: null,
    directorRunId: null,
    directorStepIdempotencyKey: null,
    directorNodeKey: null,
    chapterId: null,
    entrypoint: "novel-world-generate",
    promptId: "world.generate",
    promptVersion: "v1",
    taskType: "world",
    modelRoute: "planner",
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    failureCode: null,
    failureCategory: null,
    failureRetryable: null,
    startedAt: new Date("2026-09-18T00:00:00.000Z"),
    finishedAt: null,
    durationMs: null,
  };
}

test("Prisma adapter uses Serializable transaction, compound lookup, and started-only finalize CAS", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const stored = row();
  const delegate = {
    findUnique: async (args: unknown) => {
      calls.push({ method: "findUnique", args });
      return stored;
    },
    findMany: async (args: unknown) => {
      calls.push({ method: "findMany", args });
      return [stored];
    },
    create: async (args: unknown) => {
      calls.push({ method: "create", args });
      return stored;
    },
    updateMany: async (args: unknown) => {
      calls.push({ method: "updateMany", args });
      return { count: 1 };
    },
  };
  const transactionOptions: unknown[] = [];
  const client = {
    modelAttemptEvidence: delegate,
    $transaction: async <T>(
      operation: (transaction: { modelAttemptEvidence: typeof delegate }) => Promise<T>,
      options: unknown,
    ) => {
      transactionOptions.push(options);
      return operation({ modelAttemptEvidence: delegate });
    },
  };
  const store = new PrismaModelAttemptStore(client);

  await store.withRequestTransaction("request-0", async (transaction) => {
    await transaction.findByRequestAndIndex("request-0", 0);
    await transaction.listByRequestId("request-0");
    assert.equal(await transaction.insertIfAbsent(stored), true);
    assert.equal(await transaction.finalizeIfStarted("attempt-0", {
      status: "succeeded",
      finalAdoption: "adopted",
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      failureCode: null,
      failureCategory: null,
      failureRetryable: null,
      finishedAt: new Date("2026-09-18T00:00:01.000Z"),
      durationMs: 1000,
    }), true);
  });

  assert.deepEqual(transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.find((call) => call.method === "findUnique")?.args, {
    where: { requestId_attemptIndex: { requestId: "request-0", attemptIndex: 0 } },
  });
  assert.deepEqual(calls.find((call) => call.method === "updateMany")?.args, {
    where: { attemptId: "attempt-0", status: "started" },
    data: {
      status: "succeeded",
      finalAdoption: "adopted",
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      failureCode: null,
      failureCategory: null,
      failureRetryable: null,
      finishedAt: new Date("2026-09-18T00:00:01.000Z"),
      durationMs: 1000,
    },
  });
});

test("Prisma adapter restarts the whole transaction after a unique insert conflict", async () => {
  const uniqueError = Object.assign(new Error("unique"), { code: "P2002" });
  let createCount = 0;
  let transactionCount = 0;
  const waits: number[] = [];
  const delegate = {
    findUnique: async () => null,
    findMany: async () => [],
    create: async () => {
      createCount += 1;
      if (createCount === 1) {
        throw uniqueError;
      }
      return row();
    },
    updateMany: async () => ({ count: 0 }),
  };
  const client = {
    modelAttemptEvidence: delegate,
    $transaction: async <T>(operation: (transaction: { modelAttemptEvidence: typeof delegate }) => Promise<T>) => {
      transactionCount += 1;
      return operation({ modelAttemptEvidence: delegate });
    },
  };
  const store = new PrismaModelAttemptStore(client, {
    retryDelaysMs: [0],
    wait: async (delayMs) => { waits.push(delayMs); },
  });
  const inserted = await store.withRequestTransaction(
    "request-0",
    (transaction) => transaction.insertIfAbsent(row()),
  );
  assert.equal(inserted, true);
  assert.equal(transactionCount, 2);
  assert.deepEqual(waits, [0]);
});

test("Prisma adapter retries a serialization conflict with a fresh transaction", async () => {
  let transactionCount = 0;
  const waits: number[] = [];
  const delegate = {
    findUnique: async () => null,
    findMany: async () => [],
    create: async () => row(),
    updateMany: async () => ({ count: 0 }),
  };
  const client = {
    modelAttemptEvidence: delegate,
    $transaction: async <T>(operation: (transaction: { modelAttemptEvidence: typeof delegate }) => Promise<T>) => {
      transactionCount += 1;
      if (transactionCount === 1) {
        throw Object.assign(new Error("serialization failure"), { code: "P2034" });
      }
      return operation({ modelAttemptEvidence: delegate });
    },
  };
  const store = new PrismaModelAttemptStore(client, {
    retryDelaysMs: [7],
    wait: async (delayMs) => { waits.push(delayMs); },
  });

  const result = await store.withRequestTransaction("request-0", async () => "committed");
  assert.equal(result, "committed");
  assert.equal(transactionCount, 2);
  assert.deepEqual(waits, [7]);
});
