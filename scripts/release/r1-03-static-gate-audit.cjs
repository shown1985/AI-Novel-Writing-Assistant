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
  if (jobNames.length !== 3
    || jobNames[0] !== "macos-candidate"
    || jobNames[1] !== "publish-release"
    || jobNames[2] !== "validate-release") {
    violations.push("the public release workflow must contain only validate-release, publish-release, and macos-candidate jobs");
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

function collectMacCandidateViolations(workflow) {
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

  const candidateJob = extractJobs().find((job) => job.name === "macos-candidate")?.text ?? "";
  const expectedIf = "needs.validate-release.outputs.allowed == 'true' && github.event_name == 'push' && github.ref_type == 'tag'";
  const candidateIf = candidateJob.match(/^\s+if:\s+\$\{\{\s*([\s\S]*?)\s*\}\}\s*$/m)?.[1]?.trim() ?? "";
  const installIndex = candidateJob.indexOf("pnpm install --frozen-lockfile");
  const migrationIndex = candidateJob.indexOf("tests/prismaMigrationCompleteness.test.js");
  const stageIndex = candidateJob.indexOf("run: pnpm stage:desktop\n");
  const buildIndex = candidateJob.indexOf("pnpm dist:desktop:mac:reuse-stage");
  const verifyIndex = candidateJob.indexOf("pnpm verify:desktop-package:mac:reuse-stage");
  const violations = [];

  if (!candidateJob) {
    return ["the macos-candidate job is missing"];
  }
  if (!/^    permissions:\n\s+contents:\s+read\s*$/m.test(candidateJob)) {
    violations.push("the macos-candidate job must use contents: read");
  }
  if (!/^    runs-on:\s+macos-15\s*$/m.test(candidateJob)) {
    violations.push("the macos-candidate job must use the macos-15 runner");
  }
  if (!candidateJob.includes("needs: validate-release") || candidateIf !== expectedIf) {
    violations.push("the macos-candidate job must use the complete validate-release push-tag guard");
  }
  if (!candidateJob.includes("uses: actions/checkout@v6")
    || /(^|\n)\s+ref:\s*|(^|\n)\s+repository:\s*/m.test(candidateJob)) {
    violations.push("the macos-candidate checkout must use the default event SHA without ref or repository overrides");
  }
  if (!candidateJob.includes('machine_arch="$(uname -m)"') || !candidateJob.includes('"$machine_arch" != "arm64"')) {
    violations.push("the macos-candidate job must assert uname -m is arm64");
  }
  if (installIndex < 0 || stageIndex < 0 || installIndex > stageIndex) {
    violations.push("the macos-candidate job must install dependencies before staging the desktop app");
  }
  if (migrationIndex < 0 || !candidateJob.includes("tests/runtimeMigrations.test.js")
    || stageIndex < 0 || buildIndex < 0 || verifyIndex < 0
    || !(stageIndex < migrationIndex && migrationIndex < buildIndex && buildIndex < verifyIndex)) {
    violations.push("the macos-candidate job must run stage, migrations, arm64 dist, and verification in order");
  }
  if (/publish:desktop:|scripts\/update-desktop-release-notes\.cjs|gh\s+release|GH_TOKEN|CSC_LINK|CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|codesign|notarytool|notarize/i.test(candidateJob)) {
    violations.push("the macos-candidate job must not publish, update release notes, sign, notarize, or receive a release token");
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
    const macViolations = collectMacCandidateViolations(workflow);
    if (macViolations.length === 0) {
      record("PASS", "MACOS-WORKFLOW", "the macos-15 arm64 candidate job has a read-only guarded packaging and verification chain");
    } else {
      record("BLOCKED", "MACOS-WORKFLOW", macViolations.join("; "));
    }
  } else {
    record("BLOCKED", "MACOS-WORKFLOW", "the public workflow has no macOS packaging job");
  }
}

function extractWorkflowJobs(workflow) {
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

const FORK_MAJOR_GATE = "(( 10#${version%%.*} >= 1 ))";

function collectForkVersionLineBlockers(workflow, triggerScript) {
  const validationJob = extractWorkflowJobs(workflow).find((job) => job.name === "validate-release")?.text ?? "";
  const guardStep = validationJob.match(/\n\s+run: \|\n([\s\S]*?)(?=\n\s{6}- name:|$)/)?.[1] ?? "";
  const blockers = [];

  const gateIndex = guardStep.indexOf(FORK_MAJOR_GATE);
  const allowIndex = guardStep.indexOf("allowed=true");
  if (gateIndex < 0 || allowIndex < 0 || gateIndex > allowIndex) {
    blockers.push("the release guard does not require desktop major version 1 or higher before allowed=true");
  }
  if (!/^    remote: "fork",$/m.test(triggerScript)) {
    blockers.push("the trigger script default push remote is not fork");
  }
  if (/\[\s*"push"[^\]]*"--tags"/.test(triggerScript) || /"--mirror"|"--follow-tags"/.test(triggerScript)) {
    blockers.push("the trigger script pushes more than the single release tag");
  }
  if (!/Number\(version\.split\("\."\)\[0\]\) < 1/.test(triggerScript)) {
    blockers.push("the trigger script does not refuse a major 0 package version");
  }
  const hasUpstreamCollisionCheck = /^const UPSTREAM_REPOSITORY_SLUG = "[^"]+";$/m.test(triggerScript)
    && triggerScript.includes('["remote", "get-url", "--all", remote]')
    && triggerScript.includes('["remote", "get-url", "--push", "--all", remote]')
    && triggerScript.includes("assertTargetRemoteIsNotUpstream(options.remote, remotes);")
    && triggerScript.includes("const upstreamRemotes = findUpstreamRemotes(remotes);")
    && triggerScript.includes("assertTagAbsentLocally(tagName);")
    && triggerScript.includes('assertTagAbsentOnRemote(options.remote, tagName, "push");')
    && triggerScript.includes('assertTagAbsentOnRemote(upstreamRemote, tagName, "upstream");')
    && triggerScript.includes('["ls-remote", "--tags", remote, `refs/tags/${tagName}`]');
  if (!hasUpstreamCollisionCheck) {
    blockers.push("the trigger script is missing the upstream remote URL check or the local/push/upstream tag collision checks");
  } else {
    const upstreamCheckIndex = triggerScript.indexOf('assertTagAbsentOnRemote(upstreamRemote, tagName, "upstream");');
    const tagCreateIndex = triggerScript.indexOf('git(["tag", "-a"');
    const dryRunIndex = triggerScript.indexOf("if (options.dryRun)");
    if (tagCreateIndex >= 0 && (upstreamCheckIndex > tagCreateIndex || dryRunIndex < 0 || dryRunIndex > tagCreateIndex)) {
      blockers.push("the trigger script creates the tag before every collision check and the dry-run exit");
    }
  }
  return blockers;
}

function evaluateForkVersionLine(workflow, triggerScript, desktopPackage) {
  const blockers = collectForkVersionLineBlockers(workflow, triggerScript);
  if (blockers.length > 0) {
    return { status: "BLOCKED", message: blockers.join("; ") };
  }
  const version = typeof desktopPackage.version === "string" ? desktopPackage.version : "";
  const major = /^\d+\.\d+\.\d+$/.test(version) ? Number(version.split(".")[0]) : Number.NaN;
  if (major >= 1) {
    return {
      status: "PASS",
      message: `desktop version ${version} is on this distribution's major>=1 line; guard, fork push remote, and tag collision checks are in place`,
    };
  }
  return {
    status: "REVIEW",
    message: `desktop version ${version || "(empty)"} is still the inherited upstream 0.x line; the guard refuses to publish it until the Release 1 version bump`,
  };
}

function auditForkVersionLine() {
  const result = evaluateForkVersionLine(
    read(".github/workflows/desktop-release.yml"),
    read("scripts/trigger-desktop-release.cjs"),
    JSON.parse(read("desktop/package.json")),
  );
  record(result.status, "FORK-VERSION-LINE", result.message);
}

const FORK_GITHUB_OWNER = "shown1985";
const FORK_GITHUB_REPO = "AI-Novel-Writing-Assistant";
// The only place this audit names the upstream owner; every scanned line is tested against it.
const UPSTREAM_OWNER_SCAN_PATTERN = /explosivecoderflome/i;
const UPSTREAM_OWNER_SCAN_ROOTS = [".github", "desktop", "scripts", "package.json"];
const UPSTREAM_OWNER_SCAN_EXCLUDED_DESKTOP_DIRS = new Set(["node_modules", "build", "dist"]);
// Exact path + exact hit count + required line shape. A listed file that is absent is not reported.
const UPSTREAM_OWNER_ALLOWLIST = [
  {
    path: ".github/pull_request_template.md",
    hits: 1,
    linePattern: /CLA\.md/,
    reason: "the contributor license agreement link points to the upstream CLA, which remains the governing agreement",
  },
  {
    path: "scripts/trigger-desktop-release.cjs",
    hits: 1,
    linePattern: /^const UPSTREAM_REPOSITORY_SLUG = "[^"]*";$/,
    reason: "the release trigger needs the upstream repository path to refuse pushes to upstream and check upstream tag collisions",
  },
  {
    path: "scripts/release/r1-03-static-gate-audit.cjs",
    hits: 1,
    linePattern: /^const UPSTREAM_OWNER_SCAN_PATTERN = \/[^/]+\/i;$/,
    reason: "this audit's own scan pattern",
  },
  {
    path: "scripts/release/r1-g02a-fork-version-line.test.cjs",
    hits: null,
    linePattern: /^const UPSTREAM_FIXTURE_[A-Z0-9_]+ = "[^"]*";$/,
    reason: "upstream URL fixtures for the release trigger tests, declared only as named UPSTREAM_FIXTURE_* string constants",
  },
  {
    path: "scripts/release/r1-g02b-fork-publish-target.test.cjs",
    hits: null,
    linePattern: /^const UPSTREAM_FIXTURE_[A-Z0-9_]+ = "[^"]*";$/,
    reason: "upstream owner fixtures for the publish-target audit mutations, declared only as named UPSTREAM_FIXTURE_* string constants",
  },
];
const WORKFLOW_RELEASE_EFFECT_PATTERNS = [
  /publish:desktop:/,
  /update-desktop-release-notes/,
  /gh\s+release/,
  /--publish/,
  /softprops\/action-gh-release/,
];
const WORKFLOW_TOKEN_PATTERN = /secrets\.GITHUB_TOKEN|AI_NOVEL_GITHUB_TOKEN|GH_TOKEN|GITHUB_TOKEN|github\.token/gi;

function collectOwnerDefaults({ builderConfig, stageScript, releaseWorkflow, betaWorkflow }) {
  const valuesOf = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1]);
  const envPattern = (name) => new RegExp(`^\\s+${name}:\\s*["']?([^"'\\s]+)["']?\\s*$`, "gm");
  const publishJob = extractWorkflowJobs(releaseWorkflow ?? "").find((job) => job.name === "publish-release")?.text ?? "";
  return [
    {
      place: "desktop/electron-builder.config.cjs publish default",
      owners: valuesOf(builderConfig ?? "", /process\.env\.AI_NOVEL_GITHUB_OWNER,\s*"([^"]*)"/g),
      repos: valuesOf(builderConfig ?? "", /process\.env\.AI_NOVEL_GITHUB_REPO,\s*"([^"]*)"/g),
    },
    {
      place: "desktop/scripts/stage-desktop.cjs app-update.yml default",
      owners: valuesOf(stageScript ?? "", /process\.env\.AI_NOVEL_GITHUB_OWNER\s*\|\|\s*"([^"]*)"/g),
      repos: valuesOf(stageScript ?? "", /process\.env\.AI_NOVEL_GITHUB_REPO\s*\|\|\s*"([^"]*)"/g),
    },
    {
      place: "desktop-release.yml publish-release env",
      owners: valuesOf(publishJob, envPattern("AI_NOVEL_GITHUB_OWNER")),
      repos: valuesOf(publishJob, envPattern("AI_NOVEL_GITHUB_REPO")),
    },
    {
      place: "desktop-beta-release.yml env",
      owners: valuesOf(betaWorkflow ?? "", envPattern("AI_NOVEL_GITHUB_OWNER")),
      repos: valuesOf(betaWorkflow ?? "", envPattern("AI_NOVEL_GITHUB_REPO")),
    },
  ];
}

function collectUpstreamOwnerScanViolations(scannedFiles) {
  const violations = [];
  for (const file of scannedFiles) {
    const hitLines = file.text.split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => UPSTREAM_OWNER_SCAN_PATTERN.test(line));
    if (hitLines.length === 0) continue;
    const entry = UPSTREAM_OWNER_ALLOWLIST.find((candidate) => candidate.path === file.path);
    if (!entry) {
      violations.push(`upstream owner appears outside the allowlist in ${file.path}:${hitLines.map((hit) => hit.number).join(",")}`);
      continue;
    }
    if (entry.hits !== null && hitLines.length !== entry.hits) {
      violations.push(`${file.path} must contain exactly ${entry.hits} upstream owner reference(s), found ${hitLines.length}`);
    }
    const misplaced = hitLines.filter(({ line }) => !entry.linePattern.test(line));
    if (misplaced.length > 0) {
      violations.push(`upstream owner in ${file.path}:${misplaced.map((hit) => hit.number).join(",")} is outside its allowed named constant or line`);
    }
  }
  return violations;
}

function collectWorkflowWriteViolations(workflows) {
  const violations = [];
  for (const workflowFile of workflows) {
    const fileName = path.posix.basename(workflowFile.path);
    let scanned = workflowFile.text;
    if (fileName === "desktop-release.yml") {
      const publishJob = extractWorkflowJobs(scanned).find((job) => job.name === "publish-release");
      if (publishJob) scanned = scanned.replace(publishJob.text, "");
    }
    if (!/^permissions\s*:/m.test(workflowFile.text)) {
      violations.push(`${fileName} has no top-level permissions block and inherits the repository default token permissions`);
    }
    if (/contents\s*:\s*["']?write\b/.test(scanned)) {
      violations.push(`${fileName} grants contents: write outside the guarded publish-release job`);
    }
    if (/permissions\s*:\s*["']?write-all/.test(scanned)) {
      violations.push(`${fileName} grants permissions: write-all`);
    }
    const effects = WORKFLOW_RELEASE_EFFECT_PATTERNS.filter((pattern) => pattern.test(scanned));
    if (effects.length > 0) {
      violations.push(`${fileName} has release side effects outside the guarded publish-release job (${effects.map(String).join(", ")})`);
    }
    const tokens = [...new Set([...scanned.matchAll(WORKFLOW_TOKEN_PATTERN)].map((match) => match[0]))];
    if (tokens.length > 0) {
      violations.push(`${fileName} references a release token outside the guarded publish-release job (${tokens.join(", ")})`);
    }
  }
  return violations;
}

function collectForkPublishTargetViolations({ builderConfig, stageScript, workflows, scannedFiles }) {
  const releaseWorkflow = workflows.find((file) => file.path === ".github/workflows/desktop-release.yml")?.text;
  const betaWorkflow = workflows.find((file) => file.path === ".github/workflows/desktop-beta-release.yml")?.text;
  const violations = [];

  const places = collectOwnerDefaults({ builderConfig, stageScript, releaseWorkflow, betaWorkflow });
  for (const place of places) {
    if (place.owners.length === 0 || place.repos.length === 0) {
      violations.push(`${place.place} does not declare a GitHub owner/repo`);
      continue;
    }
    const wrong = [
      ...place.owners.filter((owner) => owner !== FORK_GITHUB_OWNER),
      ...place.repos.filter((repo) => repo !== FORK_GITHUB_REPO),
    ];
    if (wrong.length > 0) {
      violations.push(`${place.place} publishes to ${place.owners.join("|")}/${place.repos.join("|")} instead of ${FORK_GITHUB_OWNER}/${FORK_GITHUB_REPO}`);
    }
  }
  const targets = new Set(places.flatMap((place) => place.owners.flatMap((owner) => place.repos.map((repo) => `${owner}/${repo}`))));
  if (targets.size > 1) {
    violations.push(`publish targets are inconsistent: ${[...targets].join(", ")}`);
  }

  if (betaWorkflow === undefined) {
    violations.push("desktop-beta-release.yml is missing");
  } else {
    const betaJobs = extractWorkflowJobs(betaWorkflow);
    if (!/^permissions:\n  contents: read\s*$/m.test(betaWorkflow)
      || betaJobs.length === 0
      || betaJobs.some((job) => !/^    permissions:\n      contents: read\s*$/m.test(job.text))) {
      violations.push("the beta workflow must declare contents: read at workflow and job level");
    }
  }

  violations.push(...collectUpstreamOwnerScanViolations(scannedFiles));
  violations.push(...collectWorkflowWriteViolations(workflows));
  return violations;
}

function listScanFiles(rootRelativePath) {
  const results = [];
  const rootStat = fs.existsSync(path.join(repoRoot, rootRelativePath)) ? fs.statSync(path.join(repoRoot, rootRelativePath)) : null;
  if (rootStat?.isFile()) return [rootRelativePath];
  const walk = (relativeDir) => {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.posix.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (rootRelativePath === "desktop" && UPSTREAM_OWNER_SCAN_EXCLUDED_DESKTOP_DIRS.has(entry.name)) continue;
        walk(relativePath);
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  };
  walk(rootRelativePath);
  return results;
}

function readForkPublishTargetSources() {
  const workflowDir = ".github/workflows";
  const workflows = fs.existsSync(path.join(repoRoot, workflowDir))
    ? fs.readdirSync(path.join(repoRoot, workflowDir))
      .filter((name) => /\.ya?ml$/.test(name))
      .sort()
      .map((name) => ({ path: `${workflowDir}/${name}`, text: read(`${workflowDir}/${name}`) }))
    : [];
  const scannedFiles = UPSTREAM_OWNER_SCAN_ROOTS
    .flatMap(listScanFiles)
    .map((relativePath) => ({ path: relativePath, text: read(relativePath) }));
  return {
    builderConfig: exists("desktop/electron-builder.config.cjs") ? read("desktop/electron-builder.config.cjs") : "",
    stageScript: exists("desktop/scripts/stage-desktop.cjs") ? read("desktop/scripts/stage-desktop.cjs") : "",
    workflows,
    scannedFiles,
  };
}

function auditForkPublishTarget() {
  const violations = collectForkPublishTargetViolations(readForkPublishTargetSources());
  if (violations.length > 0) {
    record("BLOCKED", "FORK-PUBLISH-TARGET", violations.join("; "));
  } else {
    record(
      "PASS",
      "FORK-PUBLISH-TARGET",
      `builder, stage, public release, and beta targets are ${FORK_GITHUB_OWNER}/${FORK_GITHUB_REPO}; upstream owner references match the exact allowlist; only publish-release can write, publish, or hold a release token`,
    );
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
  auditForkVersionLine();
  auditForkPublishTarget();
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

module.exports = {
  collectForkPublishTargetViolations,
  collectForkVersionLineBlockers,
  collectMacCandidateViolations,
  collectReleaseWorkflowViolations,
  evaluateForkVersionLine,
  readForkPublishTargetSources,
};
