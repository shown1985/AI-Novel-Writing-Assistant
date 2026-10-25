// World.contentRevision is the shared CAS token that the structure backfill commit
// and the world maintenance commit compare. The deepening answer-integration writer
// must check and bump it, or a concurrent backfill commit could overwrite the
// integrated answers without noticing (lost update).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { initializeTemporarySqliteDatabase } = require("./testInfrastructure/tempSqliteDatabase.cjs");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "world-answer-revision-"));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, "isolated.db");
process.env.NODE_ENV = "test";
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = directory;

const { prisma } = require("../dist/db/prisma");
const runner = require("../dist/prompting/core/promptRunner");
const { integrateWorldAnswers } = require("../dist/services/world/deepening");
const { normalizeWorldStructuredData } = require("../dist/services/world/worldStructure");

const original = runner.runStructuredPrompt;
let nextId = 0;
let beforeReturn = async () => {};
runner.runStructuredPrompt = async (input) => {
  const raw = {
    answers: input.promptInput.answers.map((row) => ({ questionId: row.questionId, summary: "通行规则已补入规则中心" })),
    changes: { rules: { axioms: [{ id: "permit-rule", name: "通行证", summary: "由三家商会轮流签发" }] } },
  };
  await beforeReturn();
  const parsed = input.asset.outputSchema.parse(raw);
  return { output: input.asset.postValidate(parsed, input.promptInput, {}), meta: {}, context: {} };
};

test.after(async () => {
  runner.runStructuredPrompt = original;
  await prisma.$disconnect();
});
test.beforeEach(() => {
  beforeReturn = async () => {};
});

async function fixture() {
  const id = `world-revision-${++nextId}`;
  const structure = normalizeWorldStructuredData({
    profile: { identity: "海港世界", coreConflict: "原有核心冲突" },
    rules: { axioms: [{ id: "old-rule", name: "旧规则", summary: "必须保留" }] },
  });
  await prisma.world.create({
    data: { id, name: "隔离世界", structureJson: JSON.stringify(structure), bindingSupportJson: "{}", version: 1 },
  });
  const question = await prisma.worldDeepeningQA.create({
    data: { id: `${id}-question`, worldId: id, question: "通行证如何签发？", targetLayer: "foundation", targetField: "角色定位", status: "pending" },
  });
  return { id, question, answers: [{ questionId: question.id, answer: "三家商会轮流签发" }] };
}

test("answer integration bumps World.contentRevision together with version", async () => {
  const f = await fixture();
  const before = await prisma.world.findUniqueOrThrow({ where: { id: f.id } });
  await integrateWorldAnswers(f.id, f.answers);
  const after = await prisma.world.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(after.version, before.version + 1);
  assert.equal(after.contentRevision, before.contentRevision + 1);
});

test("a concurrent content-revision bump rejects the stale integration instead of overwriting it", async () => {
  const f = await fixture();
  const before = await prisma.world.findUniqueOrThrow({ where: { id: f.id } });
  // Simulate another revision-checked writer committing while the model runs:
  // only contentRevision moves, so version/updatedAt/structureJson alone would not catch it.
  beforeReturn = async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "World" SET "contentRevision" = "contentRevision" + 1 WHERE "id" = '${f.id}'`,
    );
  };
  await assert.rejects(integrateWorldAnswers(f.id, f.answers), (error) => error.statusCode === 409);
  const after = await prisma.world.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(after.version, before.version);
  assert.equal(after.contentRevision, before.contentRevision + 1);
  assert.equal(after.structureJson, before.structureJson);
  const question = await prisma.worldDeepeningQA.findUniqueOrThrow({ where: { id: f.question.id } });
  assert.equal(question.status, "pending");
});
