const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const strict = process.argv.slice(2).includes("--strict");
const findings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function record(status, id, message) {
  findings.push({ status, id, message });
}

function requireFiles(relativePaths, id) {
  const missing = relativePaths.filter((relativePath) => !exists(relativePath));
  if (missing.length > 0) {
    record("BLOCKED", id, `missing required files: ${missing.join(", ")}`);
    return;
  }
  record("PASS", id, `${relativePaths.length} required files are present`);
}

function auditCommandInventory() {
  const rootPackage = JSON.parse(read("package.json"));
  const requiredScripts = [
    "typecheck",
    "stage:desktop",
    "verify:desktop-package",
    "verify:desktop-package:mac",
    "verify:desktop:runtime:mac",
    "verify:desktop:installer",
  ];
  const missing = requiredScripts.filter((name) => !rootPackage.scripts?.[name]);
  if (missing.length > 0) {
    record("BLOCKED", "COMMANDS", `package scripts are missing: ${missing.join(", ")}`);
    return;
  }
  record("PASS", "COMMANDS", "platform, package, installer, and typecheck commands are registered");
}

function auditMigrationOverlap() {
  const compatibilityMigration =
    "server/src/prisma/migrations.sqlite/20260910140000_visual_asset_source_compatibility/migration.sql";
  const repairMigrations = [
    "20260916090000_comic_character_gender",
    "20260916090100_comic_panel_scene_ref",
    "20260916090200_drama_character_portrait_data",
    "20260916090300_drama_character_three_view_data",
    "20260916090400_comic_character_assets",
    "20260916090500_comic_scenes",
  ].map((name) => `server/src/prisma/migrations.sqlite/${name}/migration.sql`);

  if (exists(compatibilityMigration) && repairMigrations.every(exists)) {
    record(
      "BLOCKED",
      "SQLITE-MIGRATIONS",
      "the broad visual-asset compatibility migration and all six later repair migrations coexist; run the isolated migration tests before any release claim",
    );
    return;
  }
  record("PASS", "SQLITE-MIGRATIONS", "the known overlapping visual-asset migration layout is absent");
}

function auditDesktopReleaseWorkflow() {
  const workflow = read(".github/workflows/desktop-release.yml");
  const publishesRelease = workflow.includes("publish:desktop:release:reuse-stage");
  const acceptsLegacyDesktopTag = workflow.includes('"desktop-v*"');
  const acceptsManualDispatch = /^\s{2}workflow_dispatch:/m.test(workflow);

  if (publishesRelease && (acceptsLegacyDesktopTag || acceptsManualDispatch)) {
    const unsafeTriggers = [
      acceptsLegacyDesktopTag ? "desktop-v*" : null,
      acceptsManualDispatch ? "workflow_dispatch" : null,
    ].filter(Boolean);
    record(
      "BLOCKED",
      "PUBLIC-RELEASE-TRIGGER",
      `the public release workflow can publish from non-vX.Y.Z triggers: ${unsafeTriggers.join(", ")}`,
    );
  } else {
    record("PASS", "PUBLIC-RELEASE-TRIGGER", "the public workflow does not expose a known non-vX.Y.Z publish trigger");
  }

  if (/runs-on:\s*macos-/m.test(workflow)) {
    record("PASS", "MACOS-WORKFLOW", "the public workflow contains a macOS packaging job");
  } else {
    record("BLOCKED", "MACOS-WORKFLOW", "the public workflow has no macOS packaging job");
  }
}

function auditDesktopTargets() {
  const config = read("desktop/electron-builder.config.cjs");
  const hasWindowsX64 = config.includes('target: "nsis"') && config.includes('arch: ["x64"]');
  const hasMacArm64 = config.includes('target: "dmg"') && config.includes('arch: ["arm64"]');
  if (hasWindowsX64 && hasMacArm64) {
    record("PASS", "DESKTOP-TARGETS", "Windows x64 and macOS arm64 package targets are declared");
  } else {
    record("BLOCKED", "DESKTOP-TARGETS", "the declared package targets do not cover Windows x64 and macOS arm64");
  }

  if (config.includes('arch: ["x64"]') && !/mac:[\s\S]*arch:\s*\[[^\]]*"x64"/.test(config)) {
    record(
      "REVIEW",
      "MACOS-X64-SCOPE",
      "macOS packaging is arm64-only; release scope must say so or add a separately verified x64 target",
    );
  }
}

requireFiles([
  "server/tests/serverRuntimeBoundary.test.js",
  "client/tests/runtimeBoundary.test.js",
  "client/src/lib/constants.test.mjs",
], "LOOPBACK-TESTS");
requireFiles([
  "server/tests/prismaMigrationCompleteness.test.js",
  "server/tests/runtimeMigrations.test.js",
], "MIGRATION-TESTS");
requireFiles([
  "server/tests/novelProduction/reliabilityBaseline.test.js",
  "server/tests/novelProduction/pipelineExecutorRecovery.test.js",
  "server/tests/novelDirectorRecovery.test.js",
  "server/tests/novelWorkflowRecoveryNormalization.test.js",
], "RECOVERY-TESTS");
requireFiles([
  "server/tests/novelExportService.test.js",
  "server/src/modules/export/novelExport.service.ts",
], "EXPORT-TESTS");
requireFiles([
  "server/tests/fixtures/r1-first-book-ten-chapter-baseline.json",
  "server/tests/r1FirstBookTenChapterBaseline.scenario.cjs",
  "server/tests/r1FirstBookTenChapterBaseline.test.js",
], "TEN-CHAPTER-BASELINE");
requireFiles([
  "desktop/scripts/verify-desktop-package.cjs",
  "desktop/scripts/verify-desktop-installer.cjs",
  "desktop/scripts/verify-desktop-runtime-mac.cjs",
], "DESKTOP-VERIFIERS");

auditCommandInventory();
auditMigrationOverlap();
auditDesktopReleaseWorkflow();
auditDesktopTargets();

for (const finding of findings) {
  console.log(`[${finding.status}] ${finding.id}: ${finding.message}`);
}

const counts = findings.reduce((summary, finding) => {
  summary[finding.status] = (summary[finding.status] ?? 0) + 1;
  return summary;
}, {});
console.log(`[SUMMARY] ${Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(" ")}`);

if (strict && findings.some((finding) => finding.status === "BLOCKED")) {
  process.exitCode = 2;
}
