import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireSingleBookPrimaryAction,
  buildSingleBookPrimaryActionRequestKey,
  dispatchSingleBookPrimaryAction,
  releaseSingleBookPrimaryAction,
  resolveSingleBookPrimaryActionCommand,
} from "./singleBookPrimaryAction.ts";

function action(overrides = {}) {
  return {
    type: "continue",
    label: "从进度点继续",
    target: { novelId: "novel-a", taskId: "task-a" },
    commandPayload: { taskId: "task-a", continuationMode: "resume" },
    ...overrides,
  };
}

function projection(primaryAction = action()) {
  return {
    novelId: "novel-a",
    focusNovel: { id: "novel-a", title: "A", href: "/novels/novel-a/edit" },
    latestTask: { id: "task-a" },
    primaryAction,
  };
}

test("verified source action dispatches the existing command once with the real task id", () => {
  const projectedAction = action();
  const command = resolveSingleBookPrimaryActionCommand({
    novelId: "novel-a",
    directorTaskId: "task-a",
    projection: projection(projectedAction),
    action: projectedAction,
  });
  assert.deepEqual(command, {
    kind: "continue",
    novelId: "novel-a",
    taskId: "task-a",
    mode: "resume",
  });

  const lock = { current: null };
  const requestKey = buildSingleBookPrimaryActionRequestKey(command);
  const calls = [];
  const run = () => {
    if (!acquireSingleBookPrimaryAction(lock, "novel-a", requestKey)) return;
    dispatchSingleBookPrimaryAction(command, {
      continue: (value) => calls.push(value),
      confirmCandidate: () => assert.fail("unexpected candidate command"),
      openChapter: () => assert.fail("unexpected chapter command"),
      openQualityRepair: () => assert.fail("unexpected quality command"),
      openDetails: () => assert.fail("unexpected details command"),
      navigate: () => assert.fail("unexpected navigation command"),
    });
  };
  run();
  run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskId, "task-a");
  assert.equal(calls[0].mode, "resume");
});

test("mismatched book, task, or stale projected action cannot dispatch", () => {
  const projectedAction = action();
  const base = {
    novelId: "novel-a",
    directorTaskId: "task-a",
    projection: projection(projectedAction),
    action: projectedAction,
  };
  assert.equal(resolveSingleBookPrimaryActionCommand({
    ...base,
    novelId: "novel-b",
  }), null);
  assert.equal(resolveSingleBookPrimaryActionCommand({
    ...base,
    directorTaskId: "task-b",
  }), null);
  assert.equal(resolveSingleBookPrimaryActionCommand({
    ...base,
    action: action({
      commandPayload: { taskId: "task-a", continuationMode: "auto_execute_range" },
    }),
  }), null);
});

test("structured action types map without inspecting their labels", () => {
  const cases = [
    ["auto_execute_range", "continue", "auto_execute_range"],
    ["confirm_candidate", "confirm_candidate", undefined],
    ["open_chapter", "open_chapter", undefined],
    ["open_quality_repair", "open_quality_repair", undefined],
    ["open_details", "open_details", undefined],
  ];
  for (const [type, kind, mode] of cases) {
    const projectedAction = action({
      type,
      label: "任意展示文案",
      commandPayload: type === "auto_execute_range"
        ? { taskId: "task-a", continuationMode: "auto_execute_range" }
        : null,
    });
    const command = resolveSingleBookPrimaryActionCommand({
      novelId: "novel-a",
      directorTaskId: "task-a",
      projection: projection(projectedAction),
      action: { ...projectedAction, label: "展示文案变化不影响结构化路由" },
    });
    assert.equal(command?.kind, kind);
    if (mode) assert.equal(command?.mode, mode);
  }
});

test("an old-book completion cannot release or overwrite the current-book request lock", () => {
  const lock = { current: null };
  assert.equal(acquireSingleBookPrimaryAction(lock, "novel-a", "a"), true);
  assert.equal(acquireSingleBookPrimaryAction(lock, "novel-b", "b"), true);
  releaseSingleBookPrimaryAction(lock, "novel-a", "a");
  assert.deepEqual(lock.current, { novelId: "novel-b", requestKey: "b" });
  releaseSingleBookPrimaryAction(lock, "novel-b", "b");
  assert.equal(lock.current, null);
});

test("source navigation actions stay navigation-only", () => {
  const projectedAction = action({
    type: "open_novel",
    label: "查看推进状态",
    target: {
      novelId: "novel-a",
      taskId: "task-a",
      href: "/novels/novel-a/edit?directorTaskId=task-a",
    },
    commandPayload: null,
  });
  const command = resolveSingleBookPrimaryActionCommand({
    novelId: "novel-a",
    directorTaskId: "task-a",
    projection: projection(projectedAction),
    action: projectedAction,
  });
  assert.deepEqual(command, {
    kind: "navigate",
    novelId: "novel-a",
    taskId: "task-a",
    href: "/novels/novel-a/edit?directorTaskId=task-a",
  });
});
