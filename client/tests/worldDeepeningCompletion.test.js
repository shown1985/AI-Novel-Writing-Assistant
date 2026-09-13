import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = read("../src/pages/worlds/WorldWorkspace.tsx");
const deepeningTab = read("../src/pages/worlds/components/workspace/WorldDeepeningTab.tsx");

test("integrated deepening questions leave the answer queue instead of returning as blank drafts", () => {
  assert.match(workspace, /list\.filter\(\(question\) => question\.status !== "integrated"\)\.slice\(0, 3\)/);
  assert.doesNotMatch(workspace, /actionable\.length > 0 \? actionable : list/);
  assert.match(workspace, /integratedQuestionCount=\{integratedDeepeningQuestionCount\}/);
  assert.match(deepeningTab, /这一批关键设定已整合/);
  assert.match(deepeningTab, /已将 \$\{integratedQuestionCount\} 条回答写入世界手册/);
});
