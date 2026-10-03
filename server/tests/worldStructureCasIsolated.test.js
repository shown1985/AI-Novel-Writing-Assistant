const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("structure entry uses real isolated SQLite CAS, receipt, legacy projection, and RAG enqueue", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "world-structure-cas-entry-"));
  const databasePath = path.join(tempDir, "structure.db");
  fs.closeSync(fs.openSync(databasePath, "a"));
  // Keep the isolated database for inspection; this test never deletes a database file.
  const child = spawnSync(process.execPath, [path.join(__dirname, "worldStructureCasIsolatedChild.cjs"), databasePath], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const output = JSON.parse(child.stdout.trim().split("\n").at(-1));
  assert.equal(output.firstState, "committed");
  assert.equal(output.secondState, "committed");
  assert.equal(output.replayState, "replayed");
  assert.equal(output.contentRevision, 6);
  assert.equal(output.storedSummary, "保存 B", "A replay 只能返回 receipt，不能把已保存的 B 改回 A");
  assert.match(output.firstBackground, /可开局入口：custom-entry/);
  assert.deepEqual(output.firstBindingSupport.recommendedEntryPoints, ["custom-entry"]);
  assert.equal(output.receiptCount, 2);
  assert.equal(output.operationCount, 2);
  assert.equal(output.ragJobCount, 1, "同一 world 的索引任务合并为一条");
});
