import assert from "node:assert/strict";
import test from "node:test";
import { ideaInspirationElapsedSeconds, selectIdeaInspirationSessions } from "./ideaInspirationLiveState.ts";

const session = (itemKey, promptId, startedAt) => ({
  context: { itemKey, promptId }, startedAt,
});

test("only this inspiration request's sessions appear, including its retries", () => {
  const sessions = [
    session("other", "novel.director.idea_inspiration", "2026-01-01T00:00:00Z"),
    session("key", "novel.director.idea_inspiration", "2026-01-01T00:00:02Z"),
    session("key", "novel.director.idea_inspiration", "2026-01-01T00:00:01Z"),
    session("key", "other.prompt", "2026-01-01T00:00:03Z"),
  ];
  assert.deepEqual(selectIdeaInspirationSessions(sessions, "key").map((item) => item.startedAt), [
    "2026-01-01T00:00:01Z", "2026-01-01T00:00:02Z",
  ]);
});

test("elapsed time is based on request start and never negative", () => {
  assert.equal(ideaInspirationElapsedSeconds(1000, 4500), 3);
  assert.equal(ideaInspirationElapsedSeconds(5000, 4500), 0);
});
