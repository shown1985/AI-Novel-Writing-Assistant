const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildConsistencySummary,
  localizeConsistencyField,
  localizeConsistencyIssue,
} = require("../dist/services/world/worldConsistency.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  updateWorldConsistencyIssueStatus,
} = require("../dist/services/world/worldImprovementService.js");

test("buildConsistencySummary returns chinese summaries", () => {
  assert.equal(buildConsistencySummary("pass", 0, 0), "一致性检查通过，未发现明显硬冲突。");
  assert.equal(buildConsistencySummary("warn", 0, 2), "检测到 2 个警告项，建议继续修正。");
  assert.equal(buildConsistencySummary("error", 2, 1), "检测到 2 个严重冲突，1 个警告项。");
});

test("localizeConsistencyIssue rewrites known english issues into chinese", () => {
  const issue = localizeConsistencyIssue({
    severity: "error",
    code: "GENRE_MISMATCH",
    message: "Payload genre markers clash with the enforced historical realism",
    detail: "The RAG context and name suggest a strange-hero story.",
    source: "llm",
    targetField: "conflicts",
  });

  assert.equal(issue.message, "题材信号与当前世界观约束不一致。");
  assert.match(issue.detail ?? "", /题材预期/);
  assert.equal(localizeConsistencyField("conflicts"), "核心冲突");
});

test("world consistency issue status updates enforce world ownership atomically", async (t) => {
  const persistence = prisma.worldConsistencyIssue;
  const originalUpdateManyAndReturn = persistence.updateManyAndReturn;
  const originalFindUnique = persistence.findUnique;
  let issues;
  let updateAttempts;
  let writeCount;
  let lookupCount;

  const resetPersistence = (rows) => {
    issues = new Map(rows.map((row) => [row.id, { ...row }]));
    updateAttempts = [];
    writeCount = 0;
    lookupCount = 0;
  };

  persistence.updateManyAndReturn = async ({ where, data }) => {
    updateAttempts.push({ where, data });
    const current = issues.get(where.id);
    if (!current || current.worldId !== where.worldId) {
      return [];
    }
    const updated = {
      ...current,
      ...data,
      updatedAt: new Date("2026-09-17T01:00:00.000Z"),
    };
    issues.set(updated.id, updated);
    writeCount += 1;
    return [updated];
  };
  persistence.findUnique = async ({ where, select }) => {
    lookupCount += 1;
    const current = issues.get(where.id);
    if (!current) {
      return null;
    }
    return select ? { worldId: current.worldId } : { ...current };
  };

  try {
    await t.test("rejects a missing issue with zero rows written", async () => {
      resetPersistence([]);

      await assert.rejects(
        updateWorldConsistencyIssueStatus("world-a", "missing-issue", "resolved"),
        /Issue not found\./,
      );

      assert.equal(writeCount, 0);
      assert.equal(lookupCount, 1);
      assert.deepEqual(updateAttempts, [{
        where: { id: "missing-issue", worldId: "world-a" },
        data: { status: "resolved" },
      }]);
    });

    await t.test("rejects a cross-world issue without changing its status", async () => {
      resetPersistence([{
        id: "issue-b",
        worldId: "world-b",
        status: "open",
      }]);

      await assert.rejects(
        updateWorldConsistencyIssueStatus("world-a", "issue-b", "ignored"),
        /Issue does not belong to world\./,
      );

      assert.equal(writeCount, 0);
      assert.equal(lookupCount, 1);
      assert.equal(issues.get("issue-b").status, "open");
      assert.deepEqual(updateAttempts[0].where, { id: "issue-b", worldId: "world-a" });
    });

    await t.test("returns the updated issue for every supported status", async () => {
      resetPersistence([{
        id: "issue-a",
        worldId: "world-a",
        status: "open",
      }]);

      for (const status of ["resolved", "ignored", "open"]) {
        const updated = await updateWorldConsistencyIssueStatus("world-a", "issue-a", status);
        assert.equal(updated.worldId, "world-a");
        assert.equal(updated.status, status);
      }

      assert.equal(writeCount, 3);
      assert.equal(lookupCount, 0);
      assert.deepEqual(
        updateAttempts.map((attempt) => attempt.where),
        Array.from({ length: 3 }, () => ({ id: "issue-a", worldId: "world-a" })),
      );
    });
  } finally {
    persistence.updateManyAndReturn = originalUpdateManyAndReturn;
    persistence.findUnique = originalFindUnique;
  }
});
