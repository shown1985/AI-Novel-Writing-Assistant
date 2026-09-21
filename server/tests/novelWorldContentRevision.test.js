const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { prisma } = require("../dist/db/prisma.js");
const {
  NovelWorldInstanceService,
} = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const {
  NovelWorldManualService,
} = require("../dist/services/novel/worldContext/NovelWorldManualService.js");
const {
  setPromptRunnerStructuredInvokerForTests,
} = require("../dist/prompting/core/promptRunner.js");
const { NovelWorldLibrarySaveService } = require("../dist/services/novel/worldContext/NovelWorldLibrarySaveService.js");

function renderSql(strings, values) {
  return strings.reduce(
    (sql, part, index) => `${sql}${part}${index < values.length ? `$${index + 1}` : ""}`,
    "",
  );
}

function restorePrisma(original) {
  prisma.$queryRaw = original.$queryRaw;
  prisma.$executeRaw = original.$executeRaw;
  prisma.$transaction = original.$transaction;
  prisma.world = original.world;
  prisma.novel = original.novel;
  prisma.worldSnapshot = original.worldSnapshot;
}

function capturePrisma() {
  return {
    $queryRaw: prisma.$queryRaw,
    $executeRaw: prisma.$executeRaw,
    $transaction: prisma.$transaction,
    world: prisma.world,
    novel: prisma.novel,
    worldSnapshot: prisma.worldSnapshot,
  };
}

function renderSqlWithPlaceholders(strings, values) {
  return strings.reduce(
    (sql, part, index) => `${sql}${part}${index < values.length ? "?" : ""}`,
    "",
  );
}

function createRevisionFixture() {
  const database = new Database(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "Novel" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL DEFAULT '小说',
      "description" TEXT,
      "worldId" TEXT,
      "storyWorldSliceJson" TEXT,
      "storyWorldSliceOverridesJson" TEXT
    );
    CREATE TABLE "World" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "worldType" TEXT,
      "templateKey" TEXT,
      "axioms" TEXT,
      "geography" TEXT,
      "politics" TEXT,
      "conflicts" TEXT,
      "factions" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "layerStates" TEXT,
      "overviewSummary" TEXT,
      "structureJson" TEXT,
      "bindingSupportJson" TEXT,
      "structureSchemaVersion" INTEGER NOT NULL DEFAULT 1,
      "version" INTEGER NOT NULL DEFAULT 1,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "WorldSnapshot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "worldId" TEXT NOT NULL,
      "label" TEXT,
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "NovelWorld" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "novelId" TEXT NOT NULL UNIQUE,
      "sourceWorldId" TEXT,
      "sourceType" TEXT NOT NULL DEFAULT 'manual',
      "contentRevision" INTEGER NOT NULL DEFAULT 1,
      "title" TEXT,
      "coverSummary" TEXT,
      "structuredDataJson" TEXT,
      "bindingContractJson" TEXT,
      "storySliceJson" TEXT,
      "storySliceOverridesJson" TEXT,
      "storySliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
      "storySliceBuiltAt" DATETIME,
      "storySliceDigest" TEXT,
      "syncEnabled" INTEGER NOT NULL DEFAULT 0,
      "syncDirection" TEXT NOT NULL DEFAULT 'none',
      "syncBaseVersion" INTEGER,
      "syncPendingChangesJson" TEXT,
      "lastSyncedAt" DATETIME,
      "generationPolicyJson" TEXT,
      "generatedFromThemeJson" TEXT,
      "savedToLibraryAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "WorldAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "worldId" TEXT,
      "novelWorldId" TEXT,
      "assetType" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'placeholder',
      "thumbnailUrl" TEXT,
      "version" INTEGER NOT NULL DEFAULT 1,
      "renderDataJson" TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "WorldSyncRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "novelWorldId" TEXT NOT NULL,
      "direction" TEXT NOT NULL,
      "syncedFieldsJson" TEXT,
      "diffSummary" TEXT,
      "triggeredBy" TEXT NOT NULL DEFAULT 'user',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return database;
}

function createSqliteTransaction(database, { failAfterRaw = false } = {}) {
  const bindValue = (value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value;
  };
  let lastSql = "";
  return async (callback) => {
    database.exec("BEGIN");
    const tx = {
      novel: {
        update: async ({ where, data }) => {
          const fields = Object.keys(data);
          lastSql = `UPDATE "Novel" SET ${fields.map((field) => `"${field}" = ?`).join(", ")} WHERE "id" = ?`;
          database.prepare(lastSql).run(...fields.map((field) => bindValue(data[field])), where.id);
          return database.prepare(`SELECT * FROM "Novel" WHERE "id" = ?`).get(where.id);
        },
      },
      world: {
        create: async ({ data }) => {
          const row = {
            id: `world-${database.prepare(`SELECT COUNT(*) AS count FROM "World"`).get().count + 1}`,
            updatedAt: new Date(),
            ...data,
          };
          const fields = Object.keys(row);
          lastSql = `INSERT INTO "World" (${fields.map((field) => `"${field}"`).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
          database.prepare(lastSql).run(...fields.map((field) => bindValue(row[field])));
          return row;
        },
      },
      worldSnapshot: {
        create: async ({ data }) => {
          const row = { id: `snapshot-${Date.now()}-${Math.random()}`, ...data };
          const fields = Object.keys(row);
          lastSql = `INSERT INTO "WorldSnapshot" (${fields.map((field) => `"${field}"`).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
          database.prepare(lastSql).run(...fields.map((field) => bindValue(row[field])));
          return row;
        },
      },
      $executeRaw: async (strings, ...values) => {
        lastSql = renderSqlWithPlaceholders(strings, values);
        const result = database.prepare(lastSql).run(...values.map(bindValue));
        if (failAfterRaw) {
          throw new Error("simulated persistence failure");
        }
        return result.changes;
      },
    };

    try {
      const result = await callback(tx);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

function revisionOf(database, novelId = "novel-1") {
  return database.prepare(`SELECT "contentRevision" FROM "NovelWorld" WHERE "novelId" = ?`).get(novelId)?.contentRevision ?? null;
}

function makeNovelWorldRow(contentRevision = 1) {
  return {
    id: "novel_world_novel-1",
    novelId: "novel-1",
    sourceWorldId: "world-1",
    sourceType: "imported",
    contentRevision,
    title: "世界",
    coverSummary: "摘要",
    structuredDataJson: null,
    bindingContractJson: null,
    storySliceJson: null,
    storySliceOverridesJson: null,
    storySliceSchemaVersion: 1,
    storySliceBuiltAt: null,
    storySliceDigest: null,
    syncEnabled: false,
    syncDirection: "none",
    syncBaseVersion: 1,
    lastSyncedAt: null,
    syncPendingChangesJson: null,
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    updatedAt: new Date("2026-09-21T00:00:00.000Z"),
  };
}

test("legacy lazy initialization stores revision 1 and remains idempotent", async () => {
  const original = capturePrisma();
  const queries = [];
  const writes = [];
  const queryResults = [
    [],
    [{
      novelId: "novel-1",
      worldId: "world-1",
      storyWorldSliceJson: null,
      storyWorldSliceOverridesJson: null,
      storyWorldSliceSchemaVersion: 1,
      novelCreatedAt: new Date("2026-09-20T00:00:00.000Z"),
      novelUpdatedAt: new Date("2026-09-21T00:00:00.000Z"),
      worldName: "旧世界",
      worldSummary: "旧摘要",
      structureJson: null,
      bindingSupportJson: null,
      worldVersion: 4,
    }],
    [makeNovelWorldRow(1)],
  ];
  prisma.$queryRaw = async (strings, ...values) => {
    queries.push(renderSql(strings, values));
    return queryResults.shift() ?? [];
  };
  prisma.$executeRaw = async (strings, ...values) => {
    writes.push({ sql: renderSql(strings, values), values });
    return 1;
  };

  try {
    const service = new NovelWorldInstanceService();
    const created = await service.ensureFromLegacyNovel("novel-1");
    assert.equal(created.contentRevision, 1);
    assert.equal(writes.length, 1);
    assert.match(writes[0].sql, /"contentRevision"/);
    assert.match(writes[0].sql, /ON CONFLICT \("novelId"\) DO NOTHING/);
    assert.ok(writes[0].values.includes(1));

    const existing = makeNovelWorldRow(2);
    prisma.$queryRaw = async () => [existing];
    prisma.$executeRaw = async () => {
      throw new Error("lazy initialization must not overwrite an existing instance");
    };
    assert.equal(await service.ensureFromLegacyNovel("novel-1"), existing);
    assert.equal(writes.length, 1);
  } finally {
    restorePrisma(original);
  }
});

test("legacy lazy initialization preserves all four compatibility shapes", async () => {
  const cases = [
    {
      name: "world only",
      source: { worldId: "world-1", storyWorldSliceJson: null, storyWorldSliceOverridesJson: null },
      expectedSourceType: "imported",
    },
    {
      name: "slice only",
      source: { worldId: null, storyWorldSliceJson: '{"slice":"旧切片"}', storyWorldSliceOverridesJson: null },
      expectedSourceType: "manual",
    },
    {
      name: "world and slice",
      source: { worldId: "world-1", storyWorldSliceJson: '{"slice":"并存切片"}', storyWorldSliceOverridesJson: '{"override":true}' },
      expectedSourceType: "imported",
    },
  ];

  for (const item of cases) {
    const original = capturePrisma();
    const writes = [];
    const source = {
      novelId: "novel-1",
      worldName: "旧世界",
      worldSummary: "旧摘要",
      structureJson: null,
      bindingSupportJson: null,
      worldVersion: 4,
      storyWorldSliceSchemaVersion: 1,
      novelCreatedAt: new Date("2026-09-20T00:00:00.000Z"),
      novelUpdatedAt: new Date("2026-09-21T00:00:00.000Z"),
      ...item.source,
    };
    const row = makeNovelWorldRow(1);
    row.sourceWorldId = source.worldId;
    row.sourceType = item.expectedSourceType;
    row.storySliceJson = source.storyWorldSliceJson;
    row.storySliceOverridesJson = source.storyWorldSliceOverridesJson;
    const queryResults = [[], [source], [row]];
    prisma.$queryRaw = async () => queryResults.shift() ?? [];
    prisma.$executeRaw = async (strings, ...values) => {
      writes.push({ sql: renderSql(strings, values), values });
      return 1;
    };
    prisma.$transaction = async () => {
      throw new Error("legacy initialization should be one direct statement");
    };
    try {
      const result = await new NovelWorldInstanceService().ensureFromLegacyNovel("novel-1");
      assert.equal(result.contentRevision, 1, item.name);
      assert.equal(result.sourceType, item.expectedSourceType, item.name);
      assert.equal(writes.length, 1, item.name);
      assert.match(writes[0].sql, /ON CONFLICT \("novelId"\) DO NOTHING/, item.name);
      assert.ok(writes[0].values.includes(1), item.name);
      if (item.source.worldId === null) {
        assert.equal(writes[0].values.includes(null), true, item.name);
      }
      if (item.source.storyWorldSliceJson) {
        assert.ok(writes[0].values.includes(item.source.storyWorldSliceJson), item.name);
      }
    } finally {
      restorePrisma(original);
    }
  }

  const original = capturePrisma();
  let writes = 0;
  const queryResults = [[], [{
    novelId: "novel-1",
    worldId: null,
    storyWorldSliceJson: null,
    storyWorldSliceOverridesJson: null,
  }]];
  prisma.$queryRaw = async () => queryResults.shift() ?? [];
  prisma.$executeRaw = async () => { writes += 1; };
  try {
    assert.equal(await new NovelWorldInstanceService().ensureFromLegacyNovel("novel-1"), null);
    assert.equal(writes, 0, "a novel without world or legacy slice must not create an instance");
  } finally {
    restorePrisma(original);
  }
});

async function assertExplicitReplacementSql({
  service,
  execute,
}) {
  const original = capturePrisma();
  let captured;
  prisma.$transaction = async (callback) => callback(execute({
    $executeRaw: async (strings, ...values) => {
      captured = { sql: renderSql(strings, values), values };
      return 1;
    },
  }));
  try {
    await service;
    assert.match(captured.sql, /"contentRevision" = COALESCE\("contentRevision", 1\) \+ 1/);
    assert.match(captured.sql, /ON CONFLICT \("novelId"\) DO UPDATE SET/);
  } finally {
    restorePrisma(original);
  }
}

test("import increments the existing instance revision once per replacement", async () => {
  const original = capturePrisma();
  prisma.world = {
    findUnique: async () => ({
      id: "world-1",
      name: "世界",
      description: "摘要",
      overviewSummary: "摘要",
      structureJson: null,
      bindingSupportJson: null,
      version: 5,
    }),
  };
  prisma.novel = { findUnique: async () => ({ id: "novel-1" }) };
  const updates = [];
  const sqls = [];
  prisma.$transaction = async (callback) => callback({
    novel: { update: async (input) => updates.push(input) },
    $executeRaw: async (strings, ...values) => {
      sqls.push({ sql: renderSql(strings, values), values });
      return 1;
    },
  });
  try {
    const service = new NovelWorldInstanceService();
    service.getNovelWorldView = async () => ({ hasNovelWorld: true });
    await service.importFromWorldLibrary({ novelId: "novel-1", worldId: "world-1" });
    assert.equal(updates.length, 1);
    assert.equal(sqls.length, 1);
    assert.match(sqls[0].sql, /"contentRevision" = COALESCE\("contentRevision", 1\) \+ 1/);
  } finally {
    restorePrisma(original);
  }
});

test("import upsert reaches revision 1, 2, 3 on an isolated SQLite fixture", async () => {
  const original = capturePrisma();
  const database = createRevisionFixture();
  database.prepare(`INSERT INTO "Novel" ("id", "title") VALUES (?, ?)`).run("novel-1", "小说");
  prisma.world = {
    findUnique: async () => ({
      id: "world-1",
      name: "世界",
      description: "摘要",
      overviewSummary: "摘要",
      structureJson: '{"setting":"结构"}',
      bindingSupportJson: '{"binding":"绑定"}',
      version: 5,
    }),
  };
  prisma.novel = { findUnique: async () => ({ id: "novel-1" }) };
  prisma.$transaction = createSqliteTransaction(database);
  try {
    const service = new NovelWorldInstanceService();
    service.getNovelWorldView = async () => ({ hasNovelWorld: true });
    await service.importFromWorldLibrary({ novelId: "novel-1", worldId: "world-1" });
    assert.equal(revisionOf(database), 1);
    await service.importFromWorldLibrary({ novelId: "novel-1", worldId: "world-1" });
    assert.equal(revisionOf(database), 2);
    await service.importFromWorldLibrary({ novelId: "novel-1", worldId: "world-1" });
    assert.equal(revisionOf(database), 3);
    assert.equal(database.prepare(`SELECT "worldId" FROM "Novel" WHERE "id" = ?`).get("novel-1").worldId, "world-1");
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("failed import transaction rolls back both the novel binding and instance revision", async () => {
  const original = capturePrisma();
  const database = createRevisionFixture();
  database.prepare(`INSERT INTO "Novel" ("id", "title", "worldId") VALUES (?, ?, ?)`).run("novel-1", "小说", "world-old");
  database.prepare(`INSERT INTO "NovelWorld" ("id", "novelId", "sourceWorldId", "sourceType", "contentRevision", "title") VALUES (?, ?, ?, ?, ?, ?)`)
    .run("novel_world_novel-1", "novel-1", "world-old", "imported", 2, "旧世界");
  prisma.world = {
    findUnique: async () => ({
      id: "world-new",
      name: "新世界",
      description: "新摘要",
      overviewSummary: "新摘要",
      structureJson: null,
      bindingSupportJson: null,
      version: 8,
    }),
  };
  prisma.novel = { findUnique: async () => ({ id: "novel-1" }) };
  prisma.$transaction = createSqliteTransaction(database, { failAfterRaw: true });
  try {
    const service = new NovelWorldInstanceService();
    service.getNovelWorldView = async () => ({ hasNovelWorld: true });
    await assert.rejects(
      service.importFromWorldLibrary({ novelId: "novel-1", worldId: "world-new" }),
      /simulated persistence failure/,
    );
    assert.equal(revisionOf(database), 2);
    assert.deepEqual(
      database.prepare(`SELECT "sourceWorldId", "title" FROM "NovelWorld" WHERE "novelId" = ?`).get("novel-1"),
      { sourceWorldId: "world-old", title: "旧世界" },
    );
    assert.equal(database.prepare(`SELECT "worldId" FROM "Novel" WHERE "id" = ?`).get("novel-1").worldId, "world-old");
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("manual creation increments the existing instance revision once per replacement", async () => {
  const original = capturePrisma();
  prisma.novel = {
    findUnique: async () => ({ id: "novel-1", title: "小说", description: "摘要" }),
  };
  const sqls = [];
  prisma.$transaction = async (callback) => callback({
    world: {
      create: async () => ({ id: "world-2", updatedAt: new Date(), name: "世界" }),
    },
    worldSnapshot: { create: async () => ({}) },
    novel: { update: async () => ({}) },
    $executeRaw: async (strings, ...values) => {
      sqls.push({ sql: renderSql(strings, values), values });
      return 1;
    },
  });
  try {
    const viewService = { getNovelWorldView: async () => ({ hasNovelWorld: true }) };
    const service = new NovelWorldManualService(viewService);
    await service.createManualNovelWorld({ novelId: "novel-1", title: "新世界" });
    assert.equal(sqls.length, 1);
    assert.match(sqls[0].sql, /"contentRevision" = COALESCE\("contentRevision", 1\) \+ 1/);
  } finally {
    restorePrisma(original);
  }
});

test("manual creation keeps the same local instance and advances revision 1, 2, 3", async () => {
  const original = capturePrisma();
  const database = createRevisionFixture();
  database.prepare(`INSERT INTO "Novel" ("id", "title", "description") VALUES (?, ?, ?)`).run("novel-1", "小说", "摘要");
  prisma.novel = {
    findUnique: async () => ({ id: "novel-1", title: "小说", description: "摘要" }),
  };
  prisma.$transaction = createSqliteTransaction(database);
  try {
    const service = new NovelWorldManualService({ getNovelWorldView: async () => ({ hasNovelWorld: true }) });
    await service.createManualNovelWorld({ novelId: "novel-1", title: "第一版" });
    assert.equal(revisionOf(database), 1);
    await service.createManualNovelWorld({ novelId: "novel-1", title: "第二版" });
    assert.equal(revisionOf(database), 2);
    await service.createManualNovelWorld({ novelId: "novel-1", title: "第三版" });
    assert.equal(revisionOf(database), 3);
    assert.equal(database.prepare(`SELECT "title" FROM "NovelWorld" WHERE "novelId" = ?`).get("novel-1").title, "第三版");
  } finally {
    restorePrisma(original);
    database.close();
  }
});

test("theme generation increments the existing instance revision once per replacement", async () => {
  const original = capturePrisma();
  prisma.novel = {
    findUnique: async () => ({
      id: "novel-1",
      title: "小说",
      description: "摘要",
      targetAudience: null,
      bookSellingPoint: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
    }),
  };
  const sqls = [];
  prisma.$transaction = async (callback) => callback({
    world: {
      create: async () => ({
        id: "world-3",
        updatedAt: new Date(),
        name: "生成世界",
      }),
    },
    worldSnapshot: { create: async () => ({}) },
    novel: { update: async () => ({}) },
    $executeRaw: async (strings, ...values) => {
      sqls.push({ sql: renderSql(strings, values), values });
      return 1;
    },
  });
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: {
      title: "生成世界",
      coverSummary: "生成摘要",
      worldType: "custom",
      structuredData: {},
    },
    tokenUsage: null,
    repairUsed: false,
    repairAttempts: 0,
  }));
  try {
    const service = new NovelWorldInstanceService();
    service.getNovelWorldView = async () => ({ hasNovelWorld: true });
    await service.generateFromNovelTheme({ novelId: "novel-1" });
    assert.equal(sqls.length, 1);
    assert.match(sqls[0].sql, /"contentRevision" = COALESCE\("contentRevision", 1\) \+ 1/);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
    restorePrisma(original);
  }
});

test("theme generation upsert keeps revision semantics across three successful replacements", async () => {
  const original = capturePrisma();
  const database = createRevisionFixture();
  database.prepare(`INSERT INTO "Novel" ("id", "title", "description") VALUES (?, ?, ?)`).run("novel-1", "小说", "摘要");
  prisma.novel = {
    findUnique: async () => ({
      id: "novel-1",
      title: "小说",
      description: "摘要",
      targetAudience: null,
      bookSellingPoint: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
    }),
  };
  prisma.$transaction = createSqliteTransaction(database);
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: {
      title: "生成世界",
      coverSummary: "生成摘要",
      worldType: "custom",
      structuredData: {},
    },
    tokenUsage: null,
    repairUsed: false,
    repairAttempts: 0,
  }));
  try {
    const service = new NovelWorldInstanceService();
    service.getNovelWorldView = async () => ({ hasNovelWorld: true });
    await service.generateFromNovelTheme({ novelId: "novel-1" });
    assert.equal(revisionOf(database), 1);
    await service.generateFromNovelTheme({ novelId: "novel-1" });
    assert.equal(revisionOf(database), 2);
    await service.generateFromNovelTheme({ novelId: "novel-1" });
    assert.equal(revisionOf(database), 3);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
    restorePrisma(original);
    database.close();
  }
});

test("slice cache persistence does not change contentRevision", async () => {
  const original = capturePrisma();
  const sqls = [];
  prisma.$executeRaw = async (strings, ...values) => {
    sqls.push(renderSql(strings, values));
    return 1;
  };
  try {
    const service = new NovelWorldInstanceService();
    service.ensureFromLegacyNovel = async () => ({
      ...makeNovelWorldRow(7),
      storySliceSchemaVersion: 1,
    });
    await service.persistStorySlice("novel-1", null);
    assert.equal(sqls.length, 1);
    assert.doesNotMatch(sqls[0], /contentRevision/);
  } finally {
    restorePrisma(original);
  }
});

test("contentRevision remains an internal row field and read projection does not write", async () => {
  const original = capturePrisma();
  const row = makeNovelWorldRow(9);
  const queryResults = [[row], [], [], [row]];
  let writes = 0;
  prisma.$queryRaw = async () => queryResults.shift() ?? [];
  prisma.$executeRaw = async () => { writes += 1; };
  try {
    const service = new NovelWorldInstanceService();
    const view = await service.getNovelWorldView("novel-1");
    assert.equal(view.novelWorld.contentRevision, undefined);
    assert.equal(writes, 0);
    const internalRow = await service.getByNovelId("novel-1");
    assert.equal(internalRow.contentRevision, 9);
  } finally {
    restorePrisma(original);
  }
});

test("saving an instance to the library only updates sync metadata and does not bump local revision", async () => {
  const original = capturePrisma();
  const sqls = [];
  prisma.$transaction = async (callback) => callback({
    world: {
      create: async () => ({ id: "world-library", version: 3 }),
    },
    novel: {
      update: async () => ({}),
    },
    worldSnapshot: {
      create: async () => ({}),
    },
    $executeRaw: async (strings, ...values) => {
      sqls.push(renderSql(strings, values));
      return 1;
    },
  });
  try {
    const row = makeNovelWorldRow(9);
    row.sourceWorldId = null;
    const service = new NovelWorldLibrarySaveService({
      getByNovelId: async () => row,
      getNovelWorldView: async () => ({ hasNovelWorld: true, novelWorld: {} }),
    });
    const result = await service.saveNovelWorldToLibrary({ novelId: "novel-1", syncEnabled: true });
    assert.equal(sqls.length, 1);
    assert.doesNotMatch(sqls[0], /contentRevision/);
    assert.equal(result.novelWorld.contentRevision, undefined);
  } finally {
    restorePrisma(original);
  }
});
