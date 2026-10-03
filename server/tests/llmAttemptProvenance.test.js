const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const {
  projectModelAttemptProvenance,
  readModelAttemptRequest,
  setModelAttemptRepositoryForTests,
} = require("../dist/platform/llm/provenance/index.js");
const llmRouter = require("../dist/routes/llm.js").default;

function record(overrides = {}) {
  return {
    requestId: "request-1",
    attemptId: "attempt-0",
    parentAttemptId: null,
    attemptIndex: 0,
    role: "primary",
    routeTier: "primary",
    mode: "invoke",
    status: "failed",
    finalAdoption: "not_adopted",
    provider: "openai",
    model: "gpt-primary",
    structuredStrategy: "json_schema",
    attribution: {
      kind: "novel_world_generate",
      source: "prompt_invocation",
      novelId: "novel-1",
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId: null,
      entrypoint: "novel-world-generate",
    },
    prompt: {
      promptId: "world.generate",
      promptVersion: "v1",
      taskType: "world",
      modelRoute: "planner",
    },
    usage: null,
    failure: { code: "transport_error", category: "transport", retryable: true },
    startedAt: "2026-09-20T00:00:00.000Z",
    finishedAt: "2026-09-20T00:00:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

function repositoryFor(request, calls = { reads: 0, writes: 0 }) {
  return {
    async startAttempt() { calls.writes += 1; },
    async finalizeAttempt() { calls.writes += 1; },
    async findAttempt() { return null; },
    async reconstructRequest() { calls.reads += 1; return request; },
    async findByNovelId() { return []; },
  };
}

test("public mapper only exposes the frozen whitelist and preserves fallback lineage", () => {
  const first = record();
  const second = record({
    attemptId: "attempt-1",
    parentAttemptId: "attempt-0",
    attemptIndex: 1,
    role: "fallback",
    routeTier: "fallback",
    status: "succeeded",
    finalAdoption: "adopted",
    provider: "deepseek",
    model: "deepseek-chat",
    failure: null,
  });
  const output = projectModelAttemptProvenance({
    status: "found",
    requestId: "request-1",
    request: { requestId: "request-1", attempts: [first, second], adoptedAttemptId: "attempt-1" },
    attempts: [first, second],
    lineage: [first, second],
    adoptedAttemptId: "attempt-1",
    adoptedAttempt: second,
    attributionStatus: "complete",
  });
  assert.deepEqual(Object.keys(output), ["status", "requestId", "attributionStatus", "adoptedAttemptId", "attempts"]);
  assert.equal(output.attempts[0].failureCode, "transport_error");
  assert.equal(output.attempts[1].provider, "deepseek");
  assert.equal("prompt" in output.attempts[0], false);
  assert.equal("structuredStrategy" in output.attempts[0], false);
  assert.equal("baseURL" in output.attempts[0], false);
});

test("request read maps found, not_found and repository error without leaking details", async () => {
  setModelAttemptRepositoryForTests(repositoryFor({
    requestId: "request-found",
    attempts: [record({ requestId: "request-found" })],
    adoptedAttemptId: null,
  }));
  const found = projectModelAttemptProvenance(await readModelAttemptRequest({ requestId: "request-found" }));
  assert.equal(found.status, "found");

  setModelAttemptRepositoryForTests(repositoryFor(null));
  const notFound = projectModelAttemptProvenance(await readModelAttemptRequest({ requestId: "missing" }));
  assert.equal(notFound.status, "not_found");
  assert.deepEqual(notFound.attempts, []);

  setModelAttemptRepositoryForTests({
    ...repositoryFor(null),
    async reconstructRequest() { throw new Error("database secret and provider endpoint"); },
  });
  const failed = projectModelAttemptProvenance(await readModelAttemptRequest({ requestId: "broken" }));
  assert.equal(failed.status, "error");
  assert.deepEqual(failed.attempts, []);
  assert.equal("errorCode" in failed, false);
  setModelAttemptRepositoryForTests();
});

function requestJson(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const request = http.get({ host: "127.0.0.1", port: address.port, path }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          server.close(() => resolve({ status: response.statusCode, body: JSON.parse(body) }));
        });
      });
      request.on("error", (error) => server.close(() => reject(error)));
    });
  });
}

test("provenance route keeps legal read outcomes at HTTP 200 and rejects oversized ids", async () => {
  const app = express();
  app.use("/api/llm", llmRouter);
  app.use((error, _req, res, _next) => res.status(error?.statusCode ?? 400).json({ error: "请求参数校验失败。" }));
  const calls = { reads: 0, writes: 0 };
  setModelAttemptRepositoryForTests(repositoryFor(null, calls));
  const notFound = await requestJson(app, "/api/llm/attempt-requests/missing/provenance");
  assert.equal(notFound.status, 200);
  assert.equal(notFound.body.data.status, "not_found");
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes, 0);

  setModelAttemptRepositoryForTests({
    ...repositoryFor(null),
    async reconstructRequest() { throw new Error("repository path and credential must stay private"); },
  });
  const failed = await requestJson(app, "/api/llm/attempt-requests/broken/provenance");
  assert.equal(failed.status, 200);
  assert.equal(failed.body.data.status, "error");
  assert.doesNotMatch(JSON.stringify(failed.body), /repository path|credential/);

  const oversized = await requestJson(app, `/api/llm/attempt-requests/${"x".repeat(129)}/provenance`);
  assert.equal(oversized.status, 400);
  const empty = await requestJson(app, "/api/llm/attempt-requests/provenance");
  assert.equal(empty.status, 400);
  setModelAttemptRepositoryForTests();
});
