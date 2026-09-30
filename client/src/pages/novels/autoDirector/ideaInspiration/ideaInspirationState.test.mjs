import assert from "node:assert/strict";
import test from "node:test";
import { ideaInspirationContextKey, isCurrentIdeaInspirationRequest } from "./ideaInspirationState.ts";

const base = { idea: "主角寻找父亲", worldId: "world-a", genreId: "", primaryStoryModeId: "", secondaryStoryModeId: "" };

test("input, world, and foundation changes make inspiration responses stale", () => {
  const original = ideaInspirationContextKey(base);
  for (const patch of [{ idea: "主角寻找母亲" }, { worldId: "world-b" }, { genreId: "genre-a" }, { primaryStoryModeId: "mode-a" }]) {
    assert.equal(isCurrentIdeaInspirationRequest(1, 1, original, ideaInspirationContextKey({ ...base, ...patch })), false);
  }
});

test("latest request wins even after input changes back", () => {
  const original = ideaInspirationContextKey(base);
  assert.equal(isCurrentIdeaInspirationRequest(1, 2, original, original), false);
  assert.equal(isCurrentIdeaInspirationRequest(2, 2, original, original), true);
});
