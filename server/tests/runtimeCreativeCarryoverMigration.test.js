const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { applyRuntimeMigrationsToDatabase } = require("../dist/db/runtimeMigrations.js");

const migrationsDir = path.join(__dirname, "..", "src", "prisma", "migrations.sqlite");
const targetMigration = "20260923120000_novel_creative_carryover_contract";
const carryoverColumns = ["creativeCarryoverContractJson", "creativeCarryoverContractSchemaVersion"];
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const sorted = (rows) => rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

function tableNames(database) {
  return database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((row) => row.name);
}

function schemaSnapshot(database) {
  return tableNames(database).map((table) => ({
    table,
    // ALTER TABLE appends columns; physical column positions are not a schema difference.
    columns: sorted(database.prepare(`PRAGMA table_info(${quote(table)})`).all()
      .map(({ cid, ...column }) => column)),
    indexes: sorted(database.prepare(`PRAGMA index_list(${quote(table)})`).all()
      .map(({ seq, name, ...index }) => ({
        name,
        ...index,
        columns: database.prepare(`PRAGMA index_xinfo(${quote(name)})`).all()
          .map(({ cid, ...column }) => column),
      }))),
    foreignKeys: sorted(database.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all()
      .map(({ id, ...foreignKey }) => foreignKey)),
  }));
}

function dataSnapshot(database, columnsByTable) {
  return [...columnsByTable].map(([table, columns]) => ({
    table,
    rows: sorted(database.prepare(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`).all()),
  }));
}

test("creative carryover migration preserves beta data and converges with a fresh schema", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "creative-carryover-migration-"));
  const baselineDir = path.join(temporaryRoot, "baseline-migrations");
  let fresh;
  let upgraded;
  try {
    fs.mkdirSync(baselineDir);
    for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== targetMigration) {
        fs.cpSync(path.join(migrationsDir, entry.name), path.join(baselineDir, entry.name), { recursive: true });
      }
    }
    fresh = new Database(path.join(temporaryRoot, "fresh.sqlite"));
    upgraded = new Database(path.join(temporaryRoot, "upgraded.sqlite"));
    applyRuntimeMigrationsToDatabase(fresh, migrationsDir);
    applyRuntimeMigrationsToDatabase(upgraded, baselineDir);

    const baselineColumns = upgraded.prepare('PRAGMA table_info("Novel")').all().map((column) => column.name);
    for (const column of carryoverColumns) assert.equal(baselineColumns.includes(column), false);
    assert.equal(upgraded.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE migration_name = ?')
      .get(targetMigration).count, 0);
    upgraded.prepare('INSERT INTO "Novel" (id, title, description, updatedAt) VALUES (?, ?, ?, ?)')
      .run("novel-sentinel", "迁移保留样本", "旧版正文与创作设置应保留", "2026-09-22T00:00:00.000Z");
    upgraded.prepare('INSERT INTO "Chapter" (id, title, content, "order", novelId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run("chapter-sentinel", "第一章", "迁移前保存的章节正文", 1, "novel-sentinel", "2026-09-22T00:00:00.000Z");
    upgraded.prepare('INSERT INTO "CreativeDecision" (id, novelId, category, content, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run("decision-sentinel", "novel-sentinel", "character", "保留人物决定", "2026-09-22T00:00:00.000Z");
    const columnsByTable = new Map(tableNames(upgraded).filter((table) => table !== "_prisma_migrations")
      .map((table) => [table, upgraded.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name)]));
    const baselineData = dataSnapshot(upgraded, columnsByTable);
    const previousRecords = upgraded.prepare('SELECT * FROM "_prisma_migrations" ORDER BY migration_name').all();

    applyRuntimeMigrationsToDatabase(upgraded, migrationsDir);
    assert.deepEqual(schemaSnapshot(upgraded), schemaSnapshot(fresh));
    assert.deepEqual(dataSnapshot(upgraded, columnsByTable), baselineData);
    assert.deepEqual(upgraded.prepare('SELECT * FROM "_prisma_migrations" WHERE migration_name != ? ORDER BY migration_name')
      .all(targetMigration), previousRecords);
    assert.deepEqual(upgraded.prepare('SELECT creativeCarryoverContractJson, creativeCarryoverContractSchemaVersion FROM "Novel" WHERE id = ?')
      .get("novel-sentinel"), { creativeCarryoverContractJson: null, creativeCarryoverContractSchemaVersion: null });
    const newColumns = upgraded.prepare('PRAGMA table_info("Novel")').all()
      .filter((column) => carryoverColumns.includes(column.name));
    assert.deepEqual(newColumns.map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value })), [
      { name: carryoverColumns[0], type: "TEXT", notnull: 0, dflt_value: null },
      { name: carryoverColumns[1], type: "INTEGER", notnull: 0, dflt_value: null },
    ]);
    const migrationRecord = upgraded.prepare('SELECT * FROM "_prisma_migrations" WHERE migration_name = ?').all(targetMigration);
    assert.equal(migrationRecord.length, 1);
    assert.ok(migrationRecord[0].finished_at);
    assert.equal(migrationRecord[0].rolled_back_at, null);
    assert.equal(migrationRecord[0].applied_steps_count, 1);
    assert.equal(migrationRecord[0].checksum, crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(migrationsDir, targetMigration, "migration.sql"))).digest("hex"));

    upgraded.prepare('UPDATE "Novel" SET creativeCarryoverContractJson = ?, creativeCarryoverContractSchemaVersion = ? WHERE id = ?')
      .run('{"premise":"保留创作约定"}', 1, "novel-sentinel");
    const finalColumns = new Map(tableNames(upgraded).map((table) => [table,
      upgraded.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name)]));
    const upgradedData = dataSnapshot(upgraded, finalColumns);
    const finalSchema = schemaSnapshot(upgraded);
    applyRuntimeMigrationsToDatabase(upgraded, migrationsDir);
    assert.deepEqual(dataSnapshot(upgraded, finalColumns), upgradedData);
    assert.deepEqual(schemaSnapshot(upgraded), finalSchema);
    assert.deepEqual(upgraded.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(upgraded.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    fresh?.close();
    upgraded?.close();
    // This directory and both databases were created exclusively by this test.
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
