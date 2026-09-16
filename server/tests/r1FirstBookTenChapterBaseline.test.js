const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.resolve(repoRoot, "server");
const fixturePath = path.join(__dirname, "fixtures", "r1-first-book-ten-chapter-baseline.json");
const scenarioPath = path.join(__dirname, "r1FirstBookTenChapterBaseline.scenario.cjs");

function loadFixture() {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function pnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function setupTempSqliteDatabase(tempDir) {
  const databasePath = path.join(tempDir, "r1-02-first-book.db");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  fs.closeSync(fs.openSync(databasePath, "a"));
  childProcess.execFileSync(pnpmExecutable(), ["--filter", "@ai-novel/server", "prisma:push"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "ignore", "pipe"],
  });
  return databaseUrl;
}

function runScenario() {
  const tempRoot = path.join(serverRoot, ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "r1-02-"));
  try {
    const databaseUrl = setupTempSqliteDatabase(tempDir);
    const stdout = childProcess.execFileSync(process.execPath, [scenarioPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        R1_02_FIXTURE_PATH: fixturePath,
        NODE_ENV: "test",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const resultLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse()
      .find((line) => line.startsWith("{"));
    if (!resultLine) throw new Error(`R1-02 scenario did not return JSON. stdout=${stdout}`);
    return JSON.parse(resultLine);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("R1-02 fixture freezes stage facts, source-page recovery, and paid-model separation", () => {
  const fixture = loadFixture();

  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.execution.regressionMode, "deterministic_mock");
  assert.equal(fixture.execution.temporarySqlite, true);
  assert.equal(fixture.execution.networkAllowed, false);
  assert.equal(fixture.execution.paidModelCallsExpected, 0);
  assert.equal(fixture.execution.realModelSample.includedInRegression, false);
  assert.equal(fixture.execution.realModelSample.requiresExplicitApproval, true);
  assert.equal(fixture.execution.realModelSample.requiresBudget, true);
  assert.equal(fixture.chapters.length, 10);
  assert.deepEqual(fixture.chapters.map((chapter) => chapter.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(fixture.chapters.map((chapter) => chapter.content)).size, 10);

  const requiredStageIds = [
    "idea",
    "director_preparation",
    "chapter_run",
    "interruption_recovery",
    "local_quality_debt",
    "world_character_update",
    "txt_export",
  ];
  assert.deepEqual(fixture.stages.map((stage) => stage.id), requiredStageIds);
  for (const stage of fixture.stages) {
    assert.ok(stage.factSource.trim(), `${stage.id} must name a fact source`);
    assert.ok(stage.expectedStatus.trim(), `${stage.id} must name an expected status`);
    assert.ok(stage.sourceRoute.startsWith("/novels/"), `${stage.id} must recover from a source page`);
    assert.ok(stage.sourceAction.trim(), `${stage.id} must define a source-page action`);
    assert.ok(stage.failureRecovery.trim(), `${stage.id} must define failure recovery`);
  }
});

test("R1-02 deterministic SQLite chain resumes ten chapters without silent text loss", () => {
  const fixture = loadFixture();
  const result = runScenario();

  assert.equal(result.fixtureId, fixture.fixtureId);
  assert.equal(result.intentStatus, "accepted");
  assert.equal(result.intentExpression, fixture.idea);
  assert.equal(result.directorTaskStatus, "succeeded");
  assert.equal(result.directorCheckpointType, fixture.directorPreparation.checkpointType);

  assert.deepEqual(result.interruptedJob, {
    status: "queued",
    pendingManualRecovery: true,
    completedCount: 5,
  });
  assert.deepEqual(result.savedBeforeRecoveryOrders, fixture.interruption.expectedSavedChapterOrders);
  assert.deepEqual(result.mockCallOrders, [1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10]);

  assert.deepEqual(result.completedJob.status, "succeeded");
  assert.equal(result.completedJob.pendingManualRecovery, false);
  assert.equal(result.completedJob.completedCount, 10);
  assert.equal(result.completedJob.totalCount, 10);
  assert.deepEqual(result.chapterOrders, fixture.chapters.map((chapter) => chapter.order));
  assert.deepEqual(result.chapterContents, fixture.chapters.map((chapter) => chapter.content));
  assert.equal(result.artifactCheckpointCount, 10);

  for (const order of fixture.interruption.expectedSavedChapterOrders) {
    assert.equal(
      result.afterRecoveryHashes[order],
      result.beforeRecoveryHashes[order],
      `chapter ${order} changed after recovery`,
    );
  }

  assert.equal(result.debtRiskFlags.qualityLoop.terminalAction, fixture.qualityDebt.terminalAction);
  assert.notEqual(result.debtRiskFlags.qualityLoop.recommendedAction, "replan");
  assert.ok(result.completedJob.payload.qualityAlertDetails.some((item) => item.includes("第8章")));
  assert.ok(result.qualityReports >= 10);

  assert.equal(result.worldValue, fixture.worldUpdate.value);
  assert.equal(result.characterState, fixture.characterUpdate.currentState);
  assert.equal(result.characterGoal, fixture.characterUpdate.currentGoal);

  assert.equal(result.export.contentType, "text/plain; charset=utf-8");
  assert.match(result.export.fileName, /\.txt$/);
  let previousIndex = -1;
  for (const chapter of fixture.chapters) {
    const titleIndex = result.export.content.indexOf(`第${chapter.order}章 ${chapter.title}`);
    const contentIndex = result.export.content.indexOf(chapter.content);
    assert.ok(titleIndex > previousIndex, `chapter ${chapter.order} title is out of order in TXT`);
    assert.ok(contentIndex > titleIndex, `chapter ${chapter.order} content is missing from TXT`);
    previousIndex = contentIndex;
  }

  assert.equal(result.modelNetworkAttempts, fixture.execution.paidModelCallsExpected);
});
