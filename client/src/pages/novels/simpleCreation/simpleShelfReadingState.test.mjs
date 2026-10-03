import test from "node:test";
import assert from "node:assert/strict";
import {
  createReadingPosition,
  matchesSimpleShelfNovel,
  readLastReadableChapterId,
  readReadingPosition,
  resolveReadingScrollTop,
  resolveSimpleShelfReadingSelection,
  saveLastReadableChapterId,
  saveReadingPosition,
} from "./simpleShelfReadingState.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const readableChapters = [{ id: "chapter-1" }, { id: "chapter-2" }, { id: "chapter-3" }];

test("a legal explicit chapter URL wins over the stored chapter", () => {
  assert.deepEqual(resolveSimpleShelfReadingSelection({
    explicitChapterId: "chapter-1",
    lastChapterId: "chapter-2",
    readableChapters,
  }), {
    chapterId: "chapter-1",
    shouldReplaceUrl: false,
  });
});

test("an ordinary entry restores the novel's last readable chapter and canonicalizes the URL", () => {
  assert.deepEqual(resolveSimpleShelfReadingSelection({
    explicitChapterId: null,
    lastChapterId: "chapter-2",
    readableChapters,
  }), {
    chapterId: "chapter-2",
    shouldReplaceUrl: true,
  });
});

test("invalid explicit or stored chapters use the existing latest-readable fallback", () => {
  assert.deepEqual(resolveSimpleShelfReadingSelection({
    explicitChapterId: "missing",
    lastChapterId: "chapter-1",
    readableChapters,
  }), {
    chapterId: "chapter-3",
    shouldReplaceUrl: true,
  });
  assert.deepEqual(resolveSimpleShelfReadingSelection({
    explicitChapterId: null,
    lastChapterId: "no-longer-readable",
    readableChapters,
  }), {
    chapterId: "chapter-3",
    shouldReplaceUrl: true,
  });
});

test("an unreadable shelf clears an invalid explicit chapter without inventing a selection", () => {
  assert.deepEqual(resolveSimpleShelfReadingSelection({
    explicitChapterId: "missing",
    lastChapterId: null,
    readableChapters: [],
  }), {
    chapterId: null,
    shouldReplaceUrl: true,
  });
});

test("chapter preference and position are isolated by novel and chapter", () => {
  const storage = createStorage();
  saveLastReadableChapterId(storage, "novel-a", "chapter-1");
  saveLastReadableChapterId(storage, "novel-b", "chapter-3");
  saveReadingPosition(storage, "novel-a", "chapter-1", createReadingPosition(240, 800, "v1"));
  saveReadingPosition(storage, "novel-a", "chapter-2", createReadingPosition(80, 200, "v2"));

  assert.equal(readLastReadableChapterId(storage, "novel-a"), "chapter-1");
  assert.equal(readLastReadableChapterId(storage, "novel-b"), "chapter-3");
  assert.equal(readReadingPosition(storage, "novel-a", "chapter-1")?.scrollTop, 240);
  assert.equal(readReadingPosition(storage, "novel-a", "chapter-2")?.scrollTop, 80);
  assert.equal(readReadingPosition(storage, "novel-b", "chapter-1"), null);
});

test("blocked storage is treated as an unavailable preference, never a reading failure", () => {
  const blockedStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(readLastReadableChapterId(blockedStorage, "novel-a"), null);
  assert.equal(readReadingPosition(blockedStorage, "novel-a", "chapter-1"), null);
  assert.doesNotThrow(() => saveLastReadableChapterId(blockedStorage, "novel-a", "chapter-1"));
  assert.doesNotThrow(() => saveReadingPosition(
    blockedStorage,
    "novel-a",
    "chapter-1",
    createReadingPosition(20, 100, "v1"),
  ));
});

test("same content restores exact position while changed content preserves proportional progress", () => {
  const position = createReadingPosition(300, 1_000, "v1");
  assert.equal(resolveReadingScrollTop(position, "v1", 700), 300);
  assert.equal(resolveReadingScrollTop(position, "v2", 2_000), 600);
  assert.equal(resolveReadingScrollTop(position, "v1", 200), 200);
});

test("a shelf response is accepted only for the requested novel", () => {
  assert.equal(matchesSimpleShelfNovel("novel-a", "novel-a"), true);
  assert.equal(matchesSimpleShelfNovel("novel-a", "novel-b"), false);
  assert.equal(matchesSimpleShelfNovel("novel-a", null), false);
});
