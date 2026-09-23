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
    const runtimeSource = read("server/src/db/runtimeMigrations.ts");
    const completenessTest = read("server/tests/prismaMigrationCompleteness.test.js");
    const historyTest = read("server/tests/runtimeMigrations.test.js");
    const hasRuntimeCompatibility = runtimeSource.includes("MIGRATIONS_SUPERSEDED_BY_GRANULAR_REPAIRS")
      && runtimeSource.includes("applyRuntimeMigrationsToDatabase");
    const hasSharedCompletenessPath = completenessTest.includes("applyRuntimeMigrationsToDatabase");
    const hasBothHistoryFixtures = historyTest.includes("preserves the broad visual migration history")
      && historyTest.includes("accepts granular visual repair history");

    if (hasRuntimeCompatibility && hasSharedCompletenessPath && hasBothHistoryFixtures) {
      record(
        "PASS",
        "SQLITE-MIGRATIONS",
        "the intentional broad and granular visual-asset histories share the runtime migration path and have both-history fixtures; behavior tests still remain mandatory",
      );
    } else {
      record(
        "BLOCKED",
        "SQLITE-MIGRATIONS",
        "overlapping visual-asset migration histories are present without the runtime compatibility guard and both-history fixtures",
      );
    }
    return;
  }
  record("PASS", "SQLITE-MIGRATIONS", "the known overlapping visual-asset migration layout is absent");
}

function collectReleaseWorkflowViolations(workflow, desktopPackage) {
  function extractJobs() {
    const jobsStart = workflow.indexOf("jobs:\n");
    if (jobsStart < 0) return [];
    const bodyOffset = jobsStart + "jobs:\n".length;
    const body = workflow.slice(bodyOffset);
    const matches = [...body.matchAll(/^  ([A-Za-z0-9_-]+):\n/gm)];
    return matches.map((match, index) => ({
      name: match[1],
      text: workflow.slice(
        bodyOffset + match.index,
        index + 1 < matches.length ? bodyOffset + matches[index + 1].index : workflow.length,
      ),
    }));
  }

  const jobs = extractJobs();
  const validationJob = jobs.find((job) => job.name === "validate-release")?.text ?? "";
  const publishJob = jobs.find((job) => job.name === "publish-release")?.text ?? "";
  const writePermissionPattern = /^    permissions:\n\s+contents:\s+write\s*$/m;
  const releaseEffectPattern = /publish:desktop:release(?:\S*)|scripts\/update-desktop-release-notes\.cjs/;
  const releaseEffectJobs = jobs.filter((job) => releaseEffectPattern.test(job.text));
  const writeJobs = jobs.filter((job) => writePermissionPattern.test(job.text));
  const triggerSection = workflow.match(/^on:\n([\s\S]*?)^permissions:\n/m)?.[1] ?? "";
  const tagPatterns = [...triggerSection.matchAll(/^\s+-\s+["']([^"']+)["']\s*$/gm)].map((match) => match[1]);
  const topLevelPermissions = workflow.match(/^permissions:\n\s+contents:\s+(\w+)\s*$/m)?.[1];
  const guardStep = validationJob.match(/\n\s+run: \|\n([\s\S]*?)(?=\n\s{6}- name:|$)/)?.[1] ?? "";
  const publishCommandIndex = publishJob.indexOf("publish:desktop:release:reuse-stage");
  const releaseNotesIndex = publishJob.indexOf("scripts/update-desktop-release-notes.cjs");
  const publishIfExpression = publishJob.match(/^\s+if:\s+\$\{\{\s*([\s\S]*?)\s*\}\}\s*$/m)?.[1]?.trim() ?? "";
  const expectedPublishIf = "needs.validate-release.outputs.allowed == 'true' && github.event_name == 'push' && github.ref_type == 'tag'";
  const violations = [];

  if (!triggerSection.includes("push:") || tagPatterns.length !== 1 || tagPatterns[0] !== "v*") {
    violations.push("the workflow trigger must be push tags: v* only");
  }
  if (triggerSection.includes("workflow_dispatch:") || workflow.includes('"desktop-v*"') || workflow.includes("'desktop-v*'")) {
    violations.push("manual and legacy desktop-v* triggers are exposed");
  }
  if (topLevelPermissions !== "read") {
    violations.push("the workflow defaults to more than contents: read");
  }
  if (typeof desktopPackage.version !== "string" || !/^\d+\.\d+\.\d+$/.test(desktopPackage.version)) {
    violations.push("desktop/package.json does not declare a stable X.Y.Z version");
  }
  const jobNames = jobs.map((job) => job.name).sort();
  if (jobNames.length !== 2 || jobNames[0] !== "publish-release" || jobNames[1] !== "validate-release") {
    violations.push("the public release workflow must contain only validate-release and publish-release jobs");
  }
  if (!/^    permissions:\n\s+contents:\s+read\s*$/m.test(validationJob)) {
    violations.push("the validation job does not have read-only contents permission");
  }
  if (!validationJob.includes("allowed: ${{ steps.release-guard.outputs.allowed }}")) {
    violations.push("the validation job does not expose the release guard output");
  }
  if (!guardStep.includes('RELEASE_EVENT_NAME" != "push"')
    || !guardStep.includes('RELEASE_REF_TYPE" != "tag"')
    || !guardStep.includes("=~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$")
    || !guardStep.includes('"${RELEASE_REF_NAME#v}" == "$version"')
    || !guardStep.includes("desktop/package.json")
    || !guardStep.includes("allowed=false")
    || !guardStep.includes("allowed=true")
    || !guardStep.includes('echo "allowed=$allowed"')) {
    violations.push("the validation job does not enforce event, strict tag, and package-version guards");
  }
  if (releaseEffectJobs.length !== 1 || releaseEffectJobs[0]?.name !== "publish-release") {
    violations.push("every publish or release-notes command must belong to the single publish-release job");
  }
  if (writeJobs.length !== 1 || writeJobs[0]?.name !== "publish-release") {
    violations.push("contents: write must belong only to the guarded publish-release job");
  }
  if (!publishJob.includes("needs: validate-release")
    || publishIfExpression !== expectedPublishIf
    || !writePermissionPattern.test(publishJob)) {
    violations.push("the complete publish job if-expression must require the validation output, push event, and tag ref before contents: write");
  }
  if (publishCommandIndex < 0 || releaseNotesIndex < 0 || releaseNotesIndex <= publishCommandIndex) {
    violations.push("publish and release-notes steps are missing or out of order in the guarded publish job");
  }
  return violations;
}

function auditDesktopReleaseWorkflow() {
  const workflow = read(".github/workflows/desktop-release.yml");
  const desktopPackage = JSON.parse(read("desktop/package.json"));
  const violations = collectReleaseWorkflowViolations(workflow, desktopPackage);

  if (violations.length > 0) {
    record("BLOCKED", "PUBLIC-RELEASE-TRIGGER", violations.join("; "));
  } else {
    record(
      "PASS",
      "PUBLIC-RELEASE-TRIGGER",
      "only a push vX.Y.Z tag with an exact desktop/package.json version match can reach the write-enabled publish and release-notes steps",
    );
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

function runAudit() {
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
}

if (require.main === module) {
  runAudit();
}

module.exports = { collectReleaseWorkflowViolations };
