const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const { prisma } = require("../dist/db/prisma.js");
const {
  NovelWorldSliceService,
} = require("../dist/services/novel/storyWorldSlice/NovelWorldSliceService.js");
const {
  NovelWorldInstanceService,
} = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const {
  buildStoryWorldSliceCacheDigest,
} = require("../dist/services/novel/storyWorldSlice/storyWorldSlicePersistence.js");
const {
  setPromptRunnerStructuredInvokerForTests,
} = require("../dist/prompting/core/promptRunner.js");

function buildSlice() {
  return {
    storyId: "novel-1",
    worldId: "legacy-world",
    coreWorldFrame: "旧世界切片",
    appliedRules: [],
    activeForces: [],
    activeLocations: [],
    activeElements: [],
    conflictCandidates: [],
    pressureSources: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    recommendedEntryPoints: [],
    forbiddenCombinations: [],
    storyScopeBoundary: "保留旧切片内容",
    metadata: {
      schemaVersion: 1,
      builtAt: "2026-09-21T00:00:00.000Z",
      sourceWorldUpdatedAt: "2026-09-20T00:00:00.000Z",
      storyInputDigest: "legacy-story-input",
      builtFromStructuredData: false,
      builderMode: "runtime",
    },
  };
}

function buildNovel() {
  return {
    id: "novel-1",
    worldId: null,
    storyWorldSliceJson: null,
    storyWorldSliceOverridesJson: null,
    description: "一本旧作品",
    storyMacroPlan: null,
    world: null,
  };
}

function buildLegacyWorld(id = "legacy-world", updatedAt = "2026-09-20T00:00:00.000Z") {
  return {
    id,
    name: "旧世界",
    worldType: "现实都市",
    description: "现实都市中的资源与关系压力。",
    overviewSummary: "现实都市中的资源与关系压力。",
    axioms: JSON.stringify(["所有冲突都必须落回现实规则"]),
    geography: "核心城区",
    politics: "资源决定话语权",
    conflicts: "现实压力持续碰撞",
    factions: "资源控制方与普通人",
    structureJson: null,
    bindingSupportJson: null,
    updatedAt,
  };
}

function buildModelOutput(label = "模型重建切片") {
  return {
    coreWorldFrame: label,
    appliedRules: [],
    activeForces: [],
    activeLocations: [],
    activeElements: [],
    conflictCandidates: [],
    pressureSources: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    recommendedEntryPoints: [],
    forbiddenCombinations: [],
    storyScopeBoundary: "仅使用当前实例世界。",
  };
}

function storyInputDigest(storyInput) {
  return crypto.createHash("sha256").update(storyInput.trim()).digest("hex");
}

function setCurrentDigest(row, novel, storyInput = novel.description) {
  row.storySliceDigest = buildStoryWorldSliceCacheDigest({
    novelWorldId: row.id,
    contentRevision: row.contentRevision,
    sourceWorldId: row.sourceWorldId,
    syncBaseVersion: row.syncBaseVersion,
    storyInputDigest: storyInputDigest(storyInput),
    sliceSchemaVersion: 1,
  });
  row.storySliceSchemaVersion = 1;
  if (row.storySliceJson) {
    const slice = JSON.parse(row.storySliceJson);
    slice.metadata.storyInputDigest = storyInputDigest(storyInput);
    row.storySliceJson = JSON.stringify(slice);
  }
}

function buildInstanceRow(slice) {
  return {
    id: "novel_world_novel-1",
    sourceWorldId: null,
    sourceType: "manual",
    contentRevision: 3,
    title: "旧世界实例",
    coverSummary: null,
    structuredDataJson: null,
    bindingContractJson: null,
    storySliceJson: JSON.stringify(slice),
    storySliceOverridesJson: JSON.stringify({ scopeNote: "旧约束" }),
    storySliceSchemaVersion: 1,
    storySliceBuiltAt: slice.metadata.builtAt,
    storySliceDigest: null,
    syncBaseVersion: null,
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

function capturePrisma() {
  return {
    queryRaw: prisma.$queryRaw,
    executeRaw: prisma.$executeRaw,
    novelFindUnique: prisma.novel.findUnique,
  };
}

function restorePrisma(original) {
  prisma.$queryRaw = original.queryRaw;
  prisma.$executeRaw = original.executeRaw;
  prisma.novel.findUnique = original.novelFindUnique;
  setPromptRunnerStructuredInvokerForTests();
}

function createSliceCacheDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE "NovelWorld" (
      "id" TEXT PRIMARY KEY,
      "novelId" TEXT NOT NULL,
      "sourceWorldId" TEXT,
      "sourceType" TEXT NOT NULL,
      "contentRevision" INTEGER NOT NULL,
      "title" TEXT,
      "coverSummary" TEXT,
      "structuredDataJson" TEXT,
      "bindingContractJson" TEXT,
      "storySliceJson" TEXT,
      "storySliceOverridesJson" TEXT,
      "storySliceSchemaVersion" INTEGER NOT NULL,
      "storySliceBuiltAt" TEXT,
      "storySliceDigest" TEXT,
      "syncBaseVersion" INTEGER,
      "updatedAt" TEXT
    )
  `);
  return database;
}

function installSliceCachePrisma(database, novel) {
  prisma.novel.findUnique = async () => novel;
  prisma.$queryRaw = async () => {
    const row = database.prepare(`
      SELECT "id", "sourceWorldId", "sourceType", "contentRevision", "title", "coverSummary",
        "structuredDataJson", "bindingContractJson", "storySliceJson", "storySliceOverridesJson",
        "storySliceSchemaVersion", "storySliceBuiltAt", "storySliceDigest", "syncBaseVersion", "updatedAt"
      FROM "NovelWorld" WHERE "novelId" = ? LIMIT 1
    `).get("novel-1");
    return row ? [row] : [];
  };
  prisma.$executeRaw = async (strings, ...values) => {
    const sql = strings.reduce(
      (result, part, index) => `${result}${part}${index < values.length ? "?" : ""}`,
      "",
    );
    return database.prepare(sql).run(...values).changes;
  };
}

function insertSliceCacheRow(database, row) {
  database.prepare(`
    INSERT INTO "NovelWorld" (
      "id", "novelId", "sourceWorldId", "sourceType", "contentRevision", "title", "coverSummary",
      "structuredDataJson", "bindingContractJson", "storySliceJson", "storySliceOverridesJson",
      "storySliceSchemaVersion", "storySliceBuiltAt", "storySliceDigest", "syncBaseVersion", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    "novel-1",
    row.sourceWorldId,
    row.sourceType,
    row.contentRevision,
    row.title,
    row.coverSummary,
    row.structuredDataJson,
    row.bindingContractJson,
    row.storySliceJson,
    row.storySliceOverridesJson,
    row.storySliceSchemaVersion,
    row.storySliceBuiltAt,
    row.storySliceDigest,
    row.syncBaseVersion,
    row.updatedAt,
  );
}

test("cache fingerprint has fixed field order and binds instance freshness inputs", () => {
  const input = {
    novelWorldId: "nw-1",
    contentRevision: 2,
    sourceWorldId: null,
    syncBaseVersion: null,
    storyInputDigest: "story-input",
    sliceSchemaVersion: 1,
  };
  const expectedPayload = JSON.stringify({
    novelWorldId: "nw-1",
    contentRevision: 2,
    sourceWorldId: null,
    syncBaseVersion: null,
    storyInputDigest: "story-input",
    sliceSchemaVersion: 1,
  });
  assert.equal(
    buildStoryWorldSliceCacheDigest(input),
    crypto.createHash("sha256").update(expectedPayload).digest("hex"),
  );
  assert.notEqual(
    buildStoryWorldSliceCacheDigest(input),
    buildStoryWorldSliceCacheDigest({ ...input, contentRevision: 3 }),
  );
  assert.notEqual(
    buildStoryWorldSliceCacheDigest(input),
    buildStoryWorldSliceCacheDigest({ ...input, syncBaseVersion: 1 }),
  );
});

test("only-slice legacy instance is adopted once without model or content revision write", async () => {
  const original = capturePrisma();
  const slice = buildSlice();
  const row = buildInstanceRow(slice);
  const novel = buildNovel();
  let writes = 0;
  let modelCalls = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [row];
    prisma.$executeRaw = async (_strings, ...values) => {
      writes += 1;
      row.storySliceJson = values[0];
      row.storySliceOverridesJson = values[1];
      row.storySliceSchemaVersion = values[2];
      row.storySliceBuiltAt = values[3];
      row.storySliceDigest = values[4];
      return 1;
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      throw new Error("only-slice compatibility must not call the model");
    });

    const service = new NovelWorldSliceService();
    const first = await service.ensureStoryWorldSlice("novel-1");
    const second = await service.ensureStoryWorldSlice("novel-1");

    assert.deepEqual(first, slice);
    assert.deepEqual(second, slice);
    assert.equal(writes, 1);
    assert.equal(modelCalls, 0);
    assert.equal(row.contentRevision, 3);
    assert.match(row.storySliceDigest, /^[0-9a-f]{64}$/);
  } finally {
    restorePrisma(original);
  }
});

test("current cache reuses the instance snapshot without model or cache writes", async () => {
  const original = capturePrisma();
  const novel = { ...buildNovel(), world: buildLegacyWorld() };
  const slice = buildSlice();
  const row = {
    ...buildInstanceRow(slice),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 4,
  };
  setCurrentDigest(row, novel);
  let writes = 0;
  let modelCalls = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [row];
    prisma.$executeRaw = async () => {
      writes += 1;
      return 1;
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      throw new Error("current cache must not call the model");
    });

    const service = new NovelWorldSliceService();
    assert.deepEqual(await service.ensureStoryWorldSlice("novel-1"), JSON.parse(row.storySliceJson));
    assert.deepEqual(await service.ensureStoryWorldSlice("novel-1"), JSON.parse(row.storySliceJson));
    assert.equal(modelCalls, 0);
    assert.equal(writes, 0);
    assert.equal(row.contentRevision, 3);
  } finally {
    restorePrisma(original);
  }
});

test("each freshness input invalidates the old cache and rebuilds exactly once", async () => {
  const cases = [
    { name: "content revision", mutate: (row) => { row.contentRevision = 4; } },
    { name: "source world", mutate: (row, novel) => {
      row.sourceWorldId = "legacy-world-2";
      novel.world = buildLegacyWorld("legacy-world-2");
    } },
    { name: "sync base", mutate: (row) => { row.syncBaseVersion = 5; } },
    { name: "story input", storyInput: "另一条故事输入" },
  ];

  for (const item of cases) {
    const original = capturePrisma();
    const novel = { ...buildNovel(), world: buildLegacyWorld() };
    const row = {
      ...buildInstanceRow(buildSlice()),
      sourceWorldId: "legacy-world",
      sourceType: "imported",
      syncBaseVersion: 4,
    };
    setCurrentDigest(row, novel);
    let writes = 0;
    let modelCalls = 0;
    try {
      prisma.novel.findUnique = async () => novel;
      prisma.$queryRaw = async () => [row];
      prisma.$executeRaw = async (_strings, ...values) => {
        writes += 1;
        row.storySliceJson = values[0];
        row.storySliceOverridesJson = values[1];
        row.storySliceSchemaVersion = values[2];
        row.storySliceBuiltAt = values[3];
        row.storySliceDigest = values[4];
        return 1;
      };
      setPromptRunnerStructuredInvokerForTests(async () => {
        modelCalls += 1;
        return {
          data: buildModelOutput(`重建：${item.name}`),
          repairUsed: false,
          repairAttempts: 0,
          diagnostics: {},
          tokenUsage: null,
        };
      });
      item.mutate?.(row, novel);

      const service = new NovelWorldSliceService();
      const result = await service.ensureStoryWorldSlice("novel-1", {
        storyInput: item.storyInput,
      });
      assert.equal(modelCalls, 1, item.name);
      assert.equal(writes, 1, item.name);
      assert.equal(result.coreWorldFrame, `重建：${item.name}`, item.name);
    } finally {
      restorePrisma(original);
    }
  }
});

test("source World edits do not change a current instance snapshot", async () => {
  const original = capturePrisma();
  const novel = { ...buildNovel(), world: buildLegacyWorld("legacy-world", "2026-09-30T00:00:00.000Z") };
  const slice = buildSlice();
  const row = {
    ...buildInstanceRow(slice),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 4,
  };
  setCurrentDigest(row, { ...novel, description: "一本旧作品" });
  let modelCalls = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [row];
    prisma.$executeRaw = async () => {
      throw new Error("current source edit must not write cache");
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      throw new Error("current source edit must not call model");
    });

    const result = await new NovelWorldSliceService().ensureStoryWorldSlice("novel-1");
    assert.equal(result.coreWorldFrame, slice.coreWorldFrame);
    assert.equal(result.metadata.sourceWorldUpdatedAt, slice.metadata.sourceWorldUpdatedAt);
    assert.equal(modelCalls, 0);
  } finally {
    restorePrisma(original);
  }
});

test("isolated SQLite conditional cache update keeps content revision unchanged", async () => {
  const original = capturePrisma();
  const slice = buildSlice();
  const seed = buildInstanceRow(slice);
  const novel = buildNovel();
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE "NovelWorld" (
      "id" TEXT PRIMARY KEY,
      "novelId" TEXT NOT NULL,
      "sourceWorldId" TEXT,
      "sourceType" TEXT NOT NULL,
      "contentRevision" INTEGER NOT NULL,
      "title" TEXT,
      "coverSummary" TEXT,
      "structuredDataJson" TEXT,
      "bindingContractJson" TEXT,
      "storySliceJson" TEXT,
      "storySliceOverridesJson" TEXT,
      "storySliceSchemaVersion" INTEGER NOT NULL,
      "storySliceBuiltAt" TEXT,
      "storySliceDigest" TEXT,
      "syncBaseVersion" INTEGER,
      "updatedAt" TEXT
    )
  `);
  database.prepare(`
    INSERT INTO "NovelWorld" (
      "id", "novelId", "sourceWorldId", "sourceType", "contentRevision",
      "title", "coverSummary", "structuredDataJson", "bindingContractJson",
      "storySliceJson", "storySliceOverridesJson", "storySliceSchemaVersion",
      "storySliceBuiltAt", "storySliceDigest", "syncBaseVersion", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seed.id,
    "novel-1",
    seed.sourceWorldId,
    seed.sourceType,
    seed.contentRevision,
    seed.title,
    seed.coverSummary,
    seed.structuredDataJson,
    seed.bindingContractJson,
    seed.storySliceJson,
    seed.storySliceOverridesJson,
    seed.storySliceSchemaVersion,
    seed.storySliceBuiltAt,
    seed.storySliceDigest,
    seed.syncBaseVersion,
    seed.updatedAt,
  );
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => {
      const row = database.prepare(`SELECT
        "id", "sourceWorldId", "sourceType", "contentRevision", "title", "coverSummary",
        "structuredDataJson", "bindingContractJson", "storySliceJson", "storySliceOverridesJson",
        "storySliceSchemaVersion", "storySliceBuiltAt", "storySliceDigest", "syncBaseVersion", "updatedAt"
        FROM "NovelWorld" WHERE "novelId" = ? LIMIT 1`).get("novel-1");
      return row ? [row] : [];
    };
    prisma.$executeRaw = async (strings, ...values) => {
      const sql = strings.reduce(
        (result, part, index) => `${result}${part}${index < values.length ? "?" : ""}`,
        "",
      );
      return database.prepare(sql).run(...values).changes;
    };
    const service = new NovelWorldSliceService();
    await service.ensureStoryWorldSlice("novel-1");
    const persisted = database.prepare(
      `SELECT "contentRevision", "storySliceJson", "storySliceDigest" FROM "NovelWorld" WHERE "id" = ?`,
    ).get(seed.id);
    assert.equal(persisted.contentRevision, 3);
    assert.equal(persisted.storySliceJson, seed.storySliceJson);
    assert.match(persisted.storySliceDigest, /^[0-9a-f]{64}$/);
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("SQLite CAS rejects a late revision-1 result without a second write", async () => {
  const original = capturePrisma();
  const database = createSliceCacheDatabase();
  const novel = { ...buildNovel(), world: buildLegacyWorld() };
  const oldSlice = buildSlice();
  const row = {
    ...buildInstanceRow(oldSlice),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 1,
  };
  insertSliceCacheRow(database, row);
  let modelCalls = 0;
  let cacheWrites = 0;
  try {
    installSliceCachePrisma(database, novel);
    const originalExecute = prisma.$executeRaw;
    prisma.$executeRaw = async (strings, ...values) => {
      cacheWrites += 1;
      return originalExecute(strings, ...values);
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      database.prepare(`UPDATE "NovelWorld" SET "contentRevision" = 2 WHERE "id" = ?`).run(row.id);
      return {
        data: buildModelOutput("晚到 revision 1"),
        repairUsed: false,
        repairAttempts: 0,
        diagnostics: {},
        tokenUsage: null,
      };
    });

    const result = await new NovelWorldSliceService().ensureStoryWorldSlice("novel-1");
    const persisted = database.prepare(`
      SELECT "contentRevision", "storySliceJson", "storySliceDigest", "storySliceOverridesJson"
      FROM "NovelWorld" WHERE "id" = ?
    `).get(row.id);
    assert.equal(modelCalls, 1);
    assert.equal(cacheWrites, 1);
    assert.equal(result, null);
    assert.equal(persisted.contentRevision, 2);
    assert.equal(persisted.storySliceJson, row.storySliceJson);
    assert.equal(persisted.storySliceDigest, row.storySliceDigest);
    assert.equal(persisted.storySliceOverridesJson, row.storySliceOverridesJson);
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("SQLite CAS ensure returns a concurrently committed current slice after one read", async () => {
  const original = capturePrisma();
  const database = createSliceCacheDatabase();
  const novel = { ...buildNovel(), world: buildLegacyWorld() };
  const oldSlice = buildSlice();
  const row = {
    ...buildInstanceRow(oldSlice),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 1,
  };
  insertSliceCacheRow(database, row);
  const latestSlice = { ...buildSlice(), coreWorldFrame: "并发提交的 current" };
  let reads = 0;
  let writes = 0;
  try {
    installSliceCachePrisma(database, novel);
    const query = prisma.$queryRaw;
    prisma.$queryRaw = async (...args) => {
      reads += 1;
      return query(...args);
    };
    const execute = prisma.$executeRaw;
    prisma.$executeRaw = async (...args) => {
      writes += 1;
      return execute(...args);
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      const committed = {
        ...row,
        contentRevision: 2,
        storySliceJson: JSON.stringify(latestSlice),
      };
      setCurrentDigest(committed, novel);
      database.prepare(`
        UPDATE "NovelWorld"
        SET "contentRevision" = ?, "storySliceJson" = ?, "storySliceDigest" = ?
        WHERE "id" = ?
      `).run(committed.contentRevision, committed.storySliceJson, committed.storySliceDigest, committed.id);
      return {
        data: buildModelOutput("晚到 candidate"),
        repairUsed: false,
        repairAttempts: 0,
        diagnostics: {},
        tokenUsage: null,
      };
    });

    const result = await new NovelWorldSliceService().ensureStoryWorldSlice("novel-1");
    assert.equal(result.coreWorldFrame, "并发提交的 current");
    assert.equal(writes, 1);
    // Initial read + one permitted read after the CAS miss; no compensating write.
    assert.equal(reads, 2);
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("SQLite CAS refresh returns a newer stale view and never adopts the late candidate", async () => {
  const original = capturePrisma();
  const database = createSliceCacheDatabase();
  const novel = { ...buildNovel(), world: buildLegacyWorld() };
  const oldSlice = buildSlice();
  const row = {
    ...buildInstanceRow(oldSlice),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 1,
  };
  insertSliceCacheRow(database, row);
  let writes = 0;
  try {
    installSliceCachePrisma(database, novel);
    const execute = prisma.$executeRaw;
    prisma.$executeRaw = async (...args) => {
      writes += 1;
      return execute(...args);
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      database.prepare(`UPDATE "NovelWorld" SET "contentRevision" = 2 WHERE "id" = ?`).run(row.id);
      return {
        data: buildModelOutput("晚到 refresh candidate"),
        repairUsed: false,
        repairAttempts: 0,
        diagnostics: {},
        tokenUsage: null,
      };
    });

    const view = await new NovelWorldSliceService().refreshWorldSlice("novel-1");
    assert.equal(view.isStale, true);
    assert.equal(view.slice.coreWorldFrame, oldSlice.coreWorldFrame);
    assert.equal(writes, 1);
    assert.equal(database.prepare(`SELECT "contentRevision" FROM "NovelWorld" WHERE "id" = ?`).get(row.id).contentRevision, 2);
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("SQLite CAS refresh returns a concurrently committed current view", async () => {
  const original = capturePrisma();
  const database = createSliceCacheDatabase();
  const novel = { ...buildNovel(), world: buildLegacyWorld() };
  const row = {
    ...buildInstanceRow(buildSlice()),
    sourceWorldId: "legacy-world",
    sourceType: "imported",
    syncBaseVersion: 1,
  };
  insertSliceCacheRow(database, row);
  const latestSlice = { ...buildSlice(), coreWorldFrame: "并发 refresh current" };
  let writes = 0;
  try {
    installSliceCachePrisma(database, novel);
    const execute = prisma.$executeRaw;
    prisma.$executeRaw = async (...args) => {
      writes += 1;
      return execute(...args);
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      const committed = {
        ...row,
        contentRevision: 2,
        storySliceJson: JSON.stringify(latestSlice),
      };
      setCurrentDigest(committed, novel);
      database.prepare(`
        UPDATE "NovelWorld"
        SET "contentRevision" = ?, "storySliceJson" = ?, "storySliceDigest" = ?
        WHERE "id" = ?
      `).run(committed.contentRevision, committed.storySliceJson, committed.storySliceDigest, committed.id);
      return {
        data: buildModelOutput("晚到 refresh candidate"),
        repairUsed: false,
        repairAttempts: 0,
        diagnostics: {},
        tokenUsage: null,
      };
    });

    const view = await new NovelWorldSliceService().refreshWorldSlice("novel-1");
    assert.equal(view.isStale, false);
    assert.equal(view.slice.coreWorldFrame, "并发 refresh current");
    assert.equal(writes, 1);
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("model and SQL failures preserve the old cache and requested overrides", async () => {
  for (const failure of ["model", "sql"]) {
    const original = capturePrisma();
    const novel = { ...buildNovel(), world: buildLegacyWorld() };
    const oldSlice = buildSlice();
    const row = {
      ...buildInstanceRow(oldSlice),
      sourceWorldId: "legacy-world",
      sourceType: "imported",
      syncBaseVersion: 4,
    };
    const before = JSON.stringify(row);
    let writes = 0;
    try {
      prisma.novel.findUnique = async () => novel;
      prisma.$queryRaw = async () => [row];
      prisma.$executeRaw = async () => {
        writes += 1;
        throw new Error("simulated SQL failure");
      };
      setPromptRunnerStructuredInvokerForTests(async () => {
        if (failure === "model") {
          throw new Error("simulated model failure");
        }
        return {
          data: buildModelOutput("不应提交"),
          repairUsed: false,
          repairAttempts: 0,
          diagnostics: {},
          tokenUsage: null,
        };
      });

      await assert.rejects(
        () => new NovelWorldSliceService().refreshWorldSlice("novel-1", {
          overrides: { scopeNote: "本次请求不可提前保存" },
        }),
        failure === "model" ? /simulated model failure/ : /simulated SQL failure/,
      );
      assert.equal(JSON.stringify(row), before, failure);
      assert.equal(writes, failure === "model" ? 0 : 1, failure);
    } finally {
      restorePrisma(original);
    }
  }
});

test("invalid only-slice JSON is unavailable without model calls or cache writes", async () => {
  const original = capturePrisma();
  const novel = buildNovel();
  const row = {
    ...buildInstanceRow(buildSlice()),
    storySliceJson: "{broken",
    storySliceDigest: null,
    storySliceOverridesJson: JSON.stringify({ scopeNote: "旧约束" }),
  };
  let modelCalls = 0;
  let writes = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [row];
    prisma.$executeRaw = async () => {
      writes += 1;
      return 1;
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      throw new Error("invalid legacy slice must not call model");
    });

    const service = new NovelWorldSliceService();
    assert.equal(await service.ensureStoryWorldSlice("novel-1"), null);
    const view = await service.refreshWorldSlice("novel-1");
    assert.equal(view.hasWorld, false);
    assert.equal(view.slice, null);
    assert.equal(modelCalls, 0);
    assert.equal(writes, 0);
    assert.equal(row.storySliceDigest, null);
  } finally {
    restorePrisma(original);
  }
});

test("overrides-only legacy input remains unavailable without instance, model, or cache writes", async () => {
  const original = capturePrisma();
  const novel = {
    ...buildNovel(),
    storyWorldSliceOverridesJson: JSON.stringify({ scopeNote: "仅有历史覆盖" }),
  };
  const originalEnsureFromLegacyNovel = NovelWorldInstanceService.prototype.ensureFromLegacyNovel;
  let instanceCalls = 0;
  let writes = 0;
  let modelCalls = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [];
    prisma.$executeRaw = async () => {
      writes += 1;
      return 1;
    };
    NovelWorldInstanceService.prototype.ensureFromLegacyNovel = async () => {
      instanceCalls += 1;
      throw new Error("overrides-only legacy input must not create an instance");
    };
    setPromptRunnerStructuredInvokerForTests(async () => {
      modelCalls += 1;
      throw new Error("overrides-only instance must not call model");
    });

    const service = new NovelWorldSliceService();
    const expected = {
      hasWorld: false,
      worldId: null,
      worldName: null,
      slice: null,
      overrides: {},
      availableRules: [],
      availableForces: [],
      availableLocations: [],
      storyInputSource: null,
      isStale: false,
    };
    assert.deepEqual(await service.getWorldSliceView("novel-1"), expected);
    assert.equal(await service.ensureStoryWorldSlice("novel-1"), null);
    assert.deepEqual(await service.refreshWorldSlice("novel-1"), expected);
    const updated = await service.updateWorldSliceOverrides("novel-1", {
      scopeNote: "本次覆盖也不可保存",
    });
    assert.deepEqual(updated, expected);
    assert.equal(instanceCalls, 0);
    assert.equal(writes, 0);
    assert.equal(modelCalls, 0);
  } finally {
    NovelWorldInstanceService.prototype.ensureFromLegacyNovel = originalEnsureFromLegacyNovel;
    restorePrisma(original);
  }
});

test("world-only and world-plus-slice legacy rows rebuild against the instance source id", async () => {
  for (const hasOldSlice of [false, true]) {
    const original = capturePrisma();
    const novel = { ...buildNovel(), world: buildLegacyWorld() };
    const row = {
      ...buildInstanceRow(buildSlice()),
      sourceWorldId: "legacy-world",
      sourceType: "imported",
      storySliceJson: hasOldSlice ? JSON.stringify(buildSlice()) : null,
      storySliceBuiltAt: hasOldSlice ? buildSlice().metadata.builtAt : null,
      storySliceDigest: null,
      syncBaseVersion: 4,
    };
    let modelCalls = 0;
    let writes = 0;
    try {
      prisma.novel.findUnique = async () => novel;
      prisma.$queryRaw = async () => [row];
      prisma.$executeRaw = async (_strings, ...values) => {
        writes += 1;
        row.storySliceJson = values[0];
        row.storySliceDigest = values[4];
        return 1;
      };
      setPromptRunnerStructuredInvokerForTests(async () => {
        modelCalls += 1;
        return {
          data: buildModelOutput(hasOldSlice ? "world+slice 重建" : "world-only 重建"),
          repairUsed: false,
          repairAttempts: 0,
          diagnostics: {},
          tokenUsage: null,
        };
      });

      const result = await new NovelWorldSliceService().ensureStoryWorldSlice("novel-1");
      assert.equal(modelCalls, 1, hasOldSlice ? "world+slice" : "world-only");
      assert.equal(writes, 1, hasOldSlice ? "world+slice" : "world-only");
      assert.equal(result.worldId, "legacy-world");
      assert.equal(result.coreWorldFrame, hasOldSlice ? "world+slice 重建" : "world-only 重建");
      assert.equal(JSON.parse(row.storySliceJson).worldId, "legacy-world");
    } finally {
      restorePrisma(original);
    }
  }
});

test("no-world read, refresh, and override paths return the frozen empty view without writes", async () => {
  const original = capturePrisma();
  const novel = buildNovel();
  let writes = 0;
  try {
    prisma.novel.findUnique = async () => novel;
    prisma.$queryRaw = async () => [];
    prisma.$executeRaw = async () => {
      writes += 1;
      return 1;
    };
    const service = new NovelWorldSliceService();
    const expected = {
      hasWorld: false,
      worldId: null,
      worldName: null,
      slice: null,
      overrides: {},
      availableRules: [],
      availableForces: [],
      availableLocations: [],
      storyInputSource: null,
      isStale: false,
    };

    assert.deepEqual(await service.getWorldSliceView("novel-1"), expected);
    assert.deepEqual((await service.refreshWorldSlice("novel-1", {
      overrides: { scopeNote: "不得保存" },
    })), expected);
    assert.deepEqual((await service.updateWorldSliceOverrides("novel-1", {
      scopeNote: "不得保存",
    })), expected);
    assert.equal(writes, 0);
  } finally {
    restorePrisma(original);
  }
});
