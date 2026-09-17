import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCandidateToContent,
  buildAiRevisionRequest,
} from "./chapterEditorUtils.ts";

test("selection revision keeps the exact target range in the request", () => {
  const content = "第一段正文。\n\n第二段需要修改。\n\n第三段正文。";
  const targetText = "第二段需要修改。";
  const from = content.indexOf(targetText);
  const to = from + targetText.length;

  const request = buildAiRevisionRequest({
    source: "preset",
    scope: "selection",
    presetOperation: "polish",
    selection: { from, to, text: targetText },
    content,
  });

  assert.deepEqual(request.selection, { from, to, text: targetText });
  assert.deepEqual(request.context, {
    beforeParagraphs: ["第一段正文。"],
    afterParagraphs: ["第三段正文。"],
  });
  assert.equal(request.contentSnapshot, content);
});

test("chapter revision never leaks a stale selection into the request", () => {
  const request = buildAiRevisionRequest({
    source: "freeform",
    scope: "chapter",
    instruction: "  收紧全章节奏  ",
    selection: { from: 0, to: 2, text: "正文" },
    content: "正文内容。",
  });

  assert.equal(request.selection, undefined);
  assert.equal(request.context, undefined);
  assert.equal(request.instruction, "收紧全章节奏");
});

test("candidate application replaces only the selected content", () => {
  assert.equal(
    applyCandidateToContent("开头中间结尾", { from: 2, to: 4, text: "中间" }, "替换"),
    "开头替换结尾",
  );
});
