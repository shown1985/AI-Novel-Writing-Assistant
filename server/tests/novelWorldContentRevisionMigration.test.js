const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const migrationName = "20260921120000_novel_world_content_revision";

function read(relativePath) {
  return fs.readFileSync(path.join(prismaRoot, relativePath), "utf8");
}

function novelWorldModel(schemaSource) {
  return schemaSource.match(/^model NovelWorld\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";
}

test("NovelWorld content revision is present in both Prisma schemas with a compatibility default", () => {
  for (const schemaName of ["schema.prisma", "schema.sqlite.prisma"]) {
    const model = novelWorldModel(read(schemaName));
    assert.match(model, /contentRevision\s+Int\s+@default\(1\)/);
    assert.match(model, /syncBaseVersion\s+Int\?/);
    assert.match(model, /World\?\s+@relation\(fields: \[sourceWorldId\]/);
  }
});

test("NovelWorld content revision migration is packaged for PostgreSQL and SQLite", () => {
  const postgresMigration = read(path.join("migrations", migrationName, "migration.sql"));
  const sqliteMigration = read(path.join("migrations.sqlite", migrationName, "migration.sql"));

  for (const migration of [postgresMigration, sqliteMigration]) {
    assert.match(migration, /ALTER TABLE\s+"NovelWorld"/);
    assert.match(migration, /ADD COLUMN\s+"contentRevision"\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/);
  }
});

test("SQLite migration preserves legacy NovelWorld rows and starts every revision at one", () => {
  const database = new Database(":memory:");

  try {
    database.exec(`
      CREATE TABLE "Novel" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "worldId" TEXT,
        "storyWorldSliceJson" TEXT,
        "storyWorldSliceOverridesJson" TEXT,
        "storyWorldSliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "World" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT,
        "overviewSummary" TEXT,
        "description" TEXT,
        "structureJson" TEXT,
        "bindingSupportJson" TEXT,
        "version" INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO "World" (id, name, description, version)
      VALUES ('world-flat', '扁平旧世界', '只有旧描述字段', 7);
      INSERT INTO "World" (id, name, structureJson, bindingSupportJson, version)
      VALUES ('world-structured', '结构旧世界', '{"setting":"旧结构"}', '{"binding":"旧绑定"}', 9);
      INSERT INTO "Novel" (id, worldId) VALUES ('novel-world-only', 'world-flat');
      INSERT INTO "Novel" (id, storyWorldSliceJson, storyWorldSliceOverridesJson)
      VALUES ('novel-slice-only', '{"slice":"旧切片"}', '{"override":true}');
      INSERT INTO "Novel" (id, worldId, storyWorldSliceJson)
      VALUES ('novel-world-and-slice', 'world-structured', '{"slice":"并存切片"}');
      INSERT INTO "Novel" (id) VALUES ('novel-without-world');
      INSERT INTO "Novel" (id) VALUES ('novel-new');
    `);

    database.exec(read(path.join("migrations.sqlite", "20260529120000_novel_world_instance", "migration.sql")));
    database.exec(read(path.join("migrations.sqlite", migrationName, "migration.sql")));

    assert.deepEqual(
      database.prepare(
        `SELECT novelId, sourceWorldId, structuredDataJson, bindingContractJson,
                storySliceJson, storySliceOverridesJson, syncBaseVersion, contentRevision
         FROM "NovelWorld" ORDER BY novelId`,
      ).all(),
      [
        {
          novelId: "novel-slice-only",
          sourceWorldId: null,
          structuredDataJson: null,
          bindingContractJson: null,
          storySliceJson: '{"slice":"旧切片"}',
          storySliceOverridesJson: '{"override":true}',
          syncBaseVersion: null,
          contentRevision: 1,
        },
        {
          novelId: "novel-world-and-slice",
          sourceWorldId: "world-structured",
          structuredDataJson: '{"setting":"旧结构"}',
          bindingContractJson: '{"binding":"旧绑定"}',
          storySliceJson: '{"slice":"并存切片"}',
          storySliceOverridesJson: null,
          syncBaseVersion: 9,
          contentRevision: 1,
        },
        {
          novelId: "novel-world-only",
          sourceWorldId: "world-flat",
          structuredDataJson: null,
          bindingContractJson: null,
          storySliceJson: null,
          storySliceOverridesJson: null,
          syncBaseVersion: 7,
          contentRevision: 1,
        },
      ],
    );

    database.prepare(
      `INSERT INTO "NovelWorld" (id, novelId, syncBaseVersion)
       VALUES (?, ?, ?)`,
    ).run("new-world", "novel-new", 11);
    assert.equal(
      database.prepare(
        `SELECT contentRevision FROM "NovelWorld" WHERE id = ?`,
      ).get("new-world").contentRevision,
      1,
    );
    assert.equal(
      database.prepare(
        `SELECT COUNT(*) AS count FROM "NovelWorld" WHERE novelId = ?`,
      ).get("novel-without-world").count,
      0,
    );
  } finally {
    database.close();
  }
});
