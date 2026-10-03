import assert from "node:assert/strict";
import test from "node:test";
import type {
  ModelAttemptAttribution,
  ModelAttemptPromptIdentity,
  ModelAttemptUsage,
} from "../contracts";
import type { ModelAttemptRepository } from "../repository";
import { InMemoryModelAttemptRepository } from "./InMemoryModelAttemptRepository";
import {
  executeAttemptSeamPrototype,
  PrototypeTransportError,
  type PrototypeAttemptRequest,
  type PrototypeModelTransport,
  type PrototypeStreamChunk,
  type PrototypeTransportSuccess,
  type PrototypeTransportTarget,
} from "./attemptSeamPrototype";

const prompt: ModelAttemptPromptIdentity = {
  promptId: "prototype.prompt",
  promptVersion: "v1",
  taskType: "planner",
  modelRoute: "planner",
};

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

const usage: ModelAttemptUsage = {
  promptTokens: 10,
  completionTokens: 4,
  reasoningTokens: null,
  totalTokens: 14,
};

function request(overrides: Partial<PrototypeAttemptRequest> = {}): PrototypeAttemptRequest {
  return {
    requestId: "request-1",
    mode: "invoke",
    attribution: attribution("novel-a"),
    prompt,
    attempts: [{
      attemptId: "attempt-0",
      parentAttemptId: null,
      attemptIndex: 0,
      role: "primary",
      routeTier: "primary",
      target: { provider: "mock", model: "model-a" },
    }],
    ...overrides,
  };
}

function invokeTransport<T>(runner: (target: PrototypeTransportTarget) => Promise<PrototypeTransportSuccess<T>>): PrototypeModelTransport<T> {
  return {
    invoke: runner,
    stream: async () => { throw new Error("unexpected stream"); },
  };
}

test("invoke persists an adopted attempt even when usage is null", async () => {
  const repository = new InMemoryModelAttemptRepository();
  const result = await executeAttemptSeamPrototype({
    request: request(),
    repository,
    transport: invokeTransport(async () => ({ output: "ok", usage: null, accepted: true })),
  });

  assert.equal(result.output, "ok");
  assert.equal(result.evidenceStatus, "complete");
  const evidence = await repository.reconstructRequest("request-1");
  assert.equal(evidence?.attempts[0]?.status, "succeeded");
  assert.equal(evidence?.attempts[0]?.finalAdoption, "adopted");
  assert.equal(evidence?.attempts[0]?.usage, null);
});

test("stream stores terminal usage and uses the same lineage semantics as invoke", async () => {
  async function* chunks(): AsyncIterable<PrototypeStreamChunk<string>> {
    yield { delta: "o" };
    yield { delta: "k", output: "ok", usage };
  }
  const repository = new InMemoryModelAttemptRepository();
  const result = await executeAttemptSeamPrototype({
    request: request({ requestId: "stream-request", mode: "stream" }),
    repository,
    transport: {
      invoke: async () => { throw new Error("unexpected invoke"); },
      stream: async () => ({ chunks: chunks(), accepted: true }),
    },
  });

  assert.equal(result.output, "ok");
  const evidence = await repository.reconstructRequest("stream-request");
  assert.deepEqual(evidence?.attempts[0]?.usage, usage);
});

test("failed transport retry, strategy retry, fallback, repair and semantic retry retain explicit parents", async () => {
  const repository = new InMemoryModelAttemptRepository();
  const roles = ["primary", "transport_retry", "strategy_retry", "fallback", "json_repair", "semantic_retry"] as const;
  const planned = roles.map((role, attemptIndex) => ({
    attemptId: `chain-${attemptIndex}`,
    parentAttemptId: attemptIndex === 0 ? null : `chain-${attemptIndex - 1}`,
    attemptIndex,
    role,
    routeTier: attemptIndex >= 3 ? "fallback" as const : "primary" as const,
    target: {
      provider: attemptIndex >= 3 ? "fallback-provider" : "primary-provider",
      model: `model-${attemptIndex}`,
      structuredStrategy: role === "strategy_retry" ? "prompt_json" : null,
    },
  }));
  let callCount = 0;
  const result = await executeAttemptSeamPrototype({
    request: request({ requestId: "chain-request", attempts: planned }),
    repository,
    transport: invokeTransport(async () => {
      callCount += 1;
      if (callCount <= 2) {
        throw new PrototypeTransportError("upstream_timeout", "timeout", true);
      }
      return { output: `output-${callCount}`, usage, accepted: callCount === roles.length };
    }),
  });

  assert.equal(result.output, `output-${roles.length}`);
  const evidence = await repository.reconstructRequest("chain-request");
  assert.deepEqual(evidence?.attempts.map((attempt) => attempt.role), roles);
  assert.deepEqual(
    evidence?.attempts.map((attempt) => attempt.parentAttemptId),
    [null, "chain-0", "chain-1", "chain-2", "chain-3", "chain-4"],
  );
  assert.deepEqual(
    evidence?.attempts.map((attempt) => attempt.finalAdoption),
    ["not_adopted", "not_adopted", "not_adopted", "not_adopted", "not_adopted", "adopted"],
  );
});

test("observation failure never repeats generation and exposes missing evidence", async () => {
  let transportCalls = 0;
  const brokenRepository: ModelAttemptRepository = {
    startAttempt: async () => { throw new Error("store unavailable"); },
    finalizeAttempt: async () => { throw new Error("store unavailable"); },
    findAttempt: async () => null,
    reconstructRequest: async () => null,
    findByNovelId: async () => [],
  };
  const result = await executeAttemptSeamPrototype({
    request: request({ requestId: "observation-failure" }),
    repository: brokenRepository,
    transport: invokeTransport(async () => {
      transportCalls += 1;
      return { output: "usable", usage: null, accepted: true };
    }),
  });

  assert.equal(result.output, "usable");
  assert.equal(transportCalls, 1);
  assert.equal(result.evidenceStatus, "missing");
  assert.deepEqual(result.observationIssues.map((issue) => issue.phase), ["start", "finalize"]);
});

test("a persisted start with a failed finalize reports partial evidence", async () => {
  let transportCalls = 0;
  const repository = new InMemoryModelAttemptRepository();
  const partialRepository: ModelAttemptRepository = {
    startAttempt: (input) => repository.startAttempt(input),
    finalizeAttempt: async () => { throw new Error("finalize unavailable"); },
    findAttempt: (attemptId) => repository.findAttempt(attemptId),
    reconstructRequest: (requestId) => repository.reconstructRequest(requestId),
    findByNovelId: (novelId) => repository.findByNovelId(novelId),
  };
  const result = await executeAttemptSeamPrototype({
    request: request({ requestId: "partial-evidence" }),
    repository: partialRepository,
    transport: invokeTransport(async () => {
      transportCalls += 1;
      return { output: "usable", usage: null, accepted: true };
    }),
  });

  assert.equal(result.output, "usable");
  assert.equal(transportCalls, 1);
  assert.equal(result.evidenceStatus, "partial");
  assert.deepEqual(result.observationIssues.map((issue) => issue.phase), ["finalize"]);
  assert.equal((await repository.findAttempt("attempt-0"))?.status, "started");
});

test("two novels execute concurrently without request or query cross-contamination", async () => {
  const repository = new InMemoryModelAttemptRepository();
  const run = (novelId: string) => executeAttemptSeamPrototype({
    request: request({
      requestId: `request-${novelId}`,
      attribution: attribution(novelId),
      attempts: [{
        attemptId: `attempt-${novelId}`,
        parentAttemptId: null,
        attemptIndex: 0,
        role: "primary",
        routeTier: "primary",
        target: { provider: "mock", model: novelId },
      }],
    }),
    repository,
    transport: invokeTransport(async (target) => {
      await Promise.resolve();
      return { output: target.model, usage: null, accepted: true };
    }),
  });

  await Promise.all([run("novel-a"), run("novel-b")]);
  assert.deepEqual((await repository.findByNovelId("novel-a")).map((row) => row.requestId), ["request-novel-a"]);
  assert.deepEqual((await repository.findByNovelId("novel-b")).map((row) => row.requestId), ["request-novel-b"]);
});

test("repository evidence is redacted and can be reconstructed by a fresh adapter", async () => {
  const repository = new InMemoryModelAttemptRepository();
  const secret = "sk-prototype-secret";
  const promptText = "private manuscript passage";
  await executeAttemptSeamPrototype({
    request: request({
      requestId: "redacted-request",
      attempts: [{
        attemptId: "redacted-attempt",
        parentAttemptId: null,
        attemptIndex: 0,
        role: "primary",
        routeTier: "primary",
        target: {
          provider: "mock",
          model: "safe-model-name",
          apiKey: secret,
          baseUrl: "https://secret-host.invalid/v1",
          authHeader: `Bearer ${secret}`,
          payload: { prompt: promptText },
        },
      }],
    }),
    repository,
    transport: invokeTransport(async () => ({ output: "ok", usage, accepted: true })),
  });

  const serializedRows = JSON.stringify(repository.exportRowsForReconstruction());
  assert.equal(serializedRows.includes(secret), false);
  assert.equal(serializedRows.includes(promptText), false);
  assert.equal(serializedRows.includes("secret-host"), false);

  const reconstructedRepository = new InMemoryModelAttemptRepository(repository.exportRowsForReconstruction());
  const reconstructed = await reconstructedRepository.reconstructRequest("redacted-request");
  assert.equal(reconstructed?.adoptedAttemptId, "redacted-attempt");
  assert.equal(reconstructed?.attempts[0]?.provider, "mock");
  assert.equal(reconstructed?.attempts[0]?.model, "safe-model-name");
});

test("finalize is idempotent, conflicting terminal rewrites fail, and started rows survive crashes", async () => {
  const repository = new InMemoryModelAttemptRepository();
  const start = {
    requestId: "crash-request",
    attemptId: "crash-attempt",
    parentAttemptId: null,
    attemptIndex: 0,
    role: "primary" as const,
    routeTier: "primary" as const,
    mode: "invoke" as const,
    provider: "mock",
    model: "model-a",
    attribution: attribution("novel-crash"),
    prompt,
    startedAt: "2026-09-18T00:00:00.000Z",
  };
  await repository.startAttempt(start);
  await repository.startAttempt(start);
  assert.equal((await repository.findAttempt("crash-attempt"))?.status, "started");

  const terminal = {
    requestId: "crash-request",
    attemptId: "crash-attempt",
    status: "succeeded" as const,
    finalAdoption: "adopted" as const,
    usage: null,
    failure: null,
    finishedAt: "2026-09-18T00:00:01.000Z",
    durationMs: 1000,
  };
  await repository.finalizeAttempt(terminal);
  await repository.finalizeAttempt(terminal);
  await assert.rejects(
    repository.finalizeAttempt({ ...terminal, finalAdoption: "not_adopted" }),
    /attempt_finalize_conflict/,
  );
});
