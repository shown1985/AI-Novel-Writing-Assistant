const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { AppError } = require("../dist/middleware/errorHandler.js");
const { createApp } = require("../dist/app.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");

function createService() {
  const service = new NovelWorkflowService();
  const calls = {
    getTaskById: [],
    getVisibleRowsByNovelId: [],
    createWorkflow: [],
  };

  service.getTaskById = async (taskId) => {
    calls.getTaskById.push(taskId);
    return null;
  };
  service.getVisibleRowsByNovelId = async (...args) => {
    calls.getVisibleRowsByNovelId.push(args);
    return [];
  };
  service.createWorkflow = async (input) => {
    calls.createWorkflow.push(input);
    return { id: "created-task", ...input };
  };

  return { service, calls };
}

test("bootstrapTask returns the existing task when the explicit task ID is visible", async () => {
  const { service, calls } = createService();
  const existing = {
    id: "task-existing",
    lane: "auto_director",
    novelId: null,
    seedPayloadJson: null,
  };
  service.getTaskById = async (taskId) => {
    calls.getTaskById.push(taskId);
    return existing;
  };

  const result = await service.bootstrapTask({
    workflowTaskId: " task-existing ",
    lane: "auto_director",
  });

  assert.equal(result, existing);
  assert.deepEqual(calls.getTaskById, ["task-existing"]);
  assert.equal(calls.createWorkflow.length, 0);
});

test("bootstrapTask preserves the lane mismatch conflict for an existing explicit task ID", async () => {
  const { service, calls } = createService();
  service.getTaskById = async (taskId) => {
    calls.getTaskById.push(taskId);
    return {
      id: "task-existing",
      lane: "auto_director",
      novelId: null,
      seedPayloadJson: null,
    };
  };

  await assert.rejects(
    () => service.bootstrapTask({
      workflowTaskId: "task-existing",
      lane: "manual_create",
    }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.existingLane, "auto_director");
      assert.equal(error.details.requestedLane, "manual_create");
      return true;
    },
  );
  assert.equal(calls.createWorkflow.length, 0);
});

test("bootstrapTask rejects an explicit missing task ID without creating a replacement", async () => {
  const { service, calls } = createService();

  const attempts = await Promise.allSettled([
    service.bootstrapTask({
      workflowTaskId: " archived-task ",
      lane: "auto_director",
    }),
    service.bootstrapTask({
      workflowTaskId: " archived-task ",
      lane: "auto_director",
    }),
  ]);

  assert.ok(attempts.every((attempt) => attempt.status === "rejected"));
  for (const attempt of attempts) {
    assert.ok(attempt.reason instanceof AppError);
    assert.equal(attempt.reason.statusCode, 404);
  }
  assert.deepEqual(calls.getTaskById, ["archived-task", "archived-task"]);
  assert.equal(calls.getVisibleRowsByNovelId.length, 0);
  assert.equal(calls.createWorkflow.length, 0);
});

test("bootstrapTask still creates a task when no task ID was requested", async () => {
  const { service, calls } = createService();

  const result = await service.bootstrapTask({
    lane: "auto_director",
  });

  assert.equal(result.id, "created-task");
  assert.equal(calls.getTaskById.length, 0);
  assert.deepEqual(calls.createWorkflow, [{
    lane: "auto_director",
    novelId: null,
  }]);
});

test("GET /api/novel-workflows/:id loads task details without running state healing", async () => {
  const originalHeal = NovelWorkflowService.prototype.healAutoDirectorTaskState;
  let healCalls = 0;
  NovelWorkflowService.prototype.healAutoDirectorTaskState = async () => {
    healCalls += 1;
    throw new Error("Restore detail GET must not invoke healing.");
  };

  const server = http.createServer(createApp());
  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/restore-read-only-probe`);
    assert.equal(response.status, 404);
    assert.equal(healCalls, 0);
  } finally {
    NovelWorkflowService.prototype.healAutoDirectorTaskState = originalHeal;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
