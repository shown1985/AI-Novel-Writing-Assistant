const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { collectReleaseWorkflowViolations } = require("./r1-03-static-gate-audit.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "desktop-release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const staticAudit = fs.readFileSync(path.join(repoRoot, "scripts", "release", "r1-03-static-gate-audit.cjs"), "utf8");
const desktopPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));
const desktopVersion = desktopPackage.version;

function extractReleaseGuardScript() {
  const lines = workflow.split("\n");
  const guardIdIndex = lines.findIndex((line) => line.trim() === "id: release-guard");
  const runIndex = lines.findIndex((line, index) => index > guardIdIndex && line.trim() === "run: |");
  assert.ok(guardIdIndex >= 0, "the workflow must expose the release guard step");
  assert.ok(runIndex >= 0, "the release guard must be a shell run step");

  const scriptLines = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line === "") {
      scriptLines.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    assert.ok(line.startsWith("          "), "the release guard shell block must keep its workflow indentation");
    scriptLines.push(line.slice(10));
  }
  return scriptLines.join("\n");
}

function extractJob(jobName) {
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.ok(start >= 0, `workflow is missing ${jobName}`);
  const nextJob = workflow.slice(start + 1).search(/^  [A-Za-z0-9_-]+:\n/m);
  return workflow.slice(start, nextJob < 0 ? workflow.length : start + 1 + nextJob);
}

function runActualGuard({ eventName, refType, refName }) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "r1-g01a-guard-"));
  const outputPath = path.join(outputDirectory, "github-output");
  try {
    execFileSync("bash", ["-c", extractReleaseGuardScript()], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        RELEASE_EVENT_NAME: eventName,
        RELEASE_REF_TYPE: refType,
        RELEASE_REF_NAME: refName,
      },
      stdio: "pipe",
    });
    const outputs = Object.fromEntries(
      fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => line.split("=", 2)),
    );
    return outputs;
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

test("the workflow has one push v* trigger and no legacy/manual public trigger", () => {
  assert.match(workflow, /^on:\n  push:\n    tags:\n      - "v\*"\n/m);
  assert.doesNotMatch(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /desktop-v\*/);
  assert.match(workflow, /^permissions:\n  contents: read\s*$/m);
});

test("the real workflow guard allows only the exact stable package tag", () => {
  const matching = runActualGuard({
    eventName: "push",
    refType: "tag",
    refName: `v${desktopVersion}`,
  });
  assert.equal(matching.allowed, "true");
  assert.equal(matching.version, desktopVersion);

  for (const invalid of [
    { name: "version mismatch", refName: "v9.9.9" },
    { name: "legacy desktop tag", refName: `desktop-v${desktopVersion}` },
    { name: "pre-release tag", refName: `v${desktopVersion}-rc1` },
    { name: "non-strict tag", refName: "v1.2" },
  ]) {
    const result = runActualGuard({ eventName: "push", refType: "tag", refName: invalid.refName });
    assert.equal(result.allowed, "false", `${invalid.name} must not pass the actual release guard`);
  }
});

test("the actual guard rejects manual/non-tag execution before the write-enabled job", () => {
  const result = runActualGuard({
    eventName: "workflow_dispatch",
    refType: "branch",
    refName: `v${desktopVersion}`,
  });
  assert.equal(result.allowed, "false");
});

test("publish and release notes are downstream of the guarded write permission", () => {
  const validationJob = extractJob("validate-release");
  const publishJob = extractJob("publish-release");
  assert.match(validationJob, /permissions:\n\s+contents: read/);
  assert.match(validationJob, /allowed: \$\{\{ steps\.release-guard\.outputs\.allowed \}\}/);
  assert.doesNotMatch(validationJob, /publish:desktop:release|update-desktop-release-notes/);
  assert.match(publishJob, /needs: validate-release/);
  assert.match(publishJob, /needs\.validate-release\.outputs\.allowed == 'true'/);
  assert.match(publishJob, /permissions:\n\s+contents: write/);
  const publishIndex = publishJob.indexOf("publish:desktop:release:reuse-stage");
  const notesIndex = publishJob.indexOf("scripts/update-desktop-release-notes.cjs");
  assert.ok(publishIndex >= 0 && notesIndex > publishIndex, "release notes must follow publish in the guarded job");
});

test("the static audit checks effective guard wiring instead of treating v* text as sufficient", () => {
  assert.match(staticAudit, /const jobs = extractJobs\(\)/);
  assert.match(staticAudit, /RELEASE_REF_NAME#v/);
  assert.match(staticAudit, /needs\.validate-release\.outputs\.allowed == 'true'/);
  assert.match(staticAudit, /contents:\\s\+write/);
  assert.match(staticAudit, /releaseNotesIndex <= publishCommandIndex/);
});

test("the static audit rejects an if-expression that bypasses the guard with an OR", () => {
  const bypassedWorkflow = workflow.replace(
    "needs.validate-release.outputs.allowed == 'true' && github.event_name == 'push' && github.ref_type == 'tag'",
    "needs.validate-release.outputs.allowed == 'true' || github.ref_type == 'tag'",
  );
  const violations = collectReleaseWorkflowViolations(bypassedWorkflow, desktopPackage);
  assert.match(violations.join("; "), /complete publish job if-expression/);
});

test("the static audit rejects a second write-enabled job with publish side effects", () => {
  const rogueJob = `
  rogue-release:
    permissions:
      contents: write
    if: \${{ needs.validate-release.outputs.allowed == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: pnpm publish:desktop:release:reuse-stage
      - run: node scripts/update-desktop-release-notes.cjs
`;
  const violations = collectReleaseWorkflowViolations(`${workflow}\n${rogueJob}`, desktopPackage);
  assert.match(violations.join("; "), /single publish-release job/);
  assert.match(violations.join("; "), /contents: write must belong only/);
});

test("the static audit rejects any third job, including inline write permission and gh release side effects", () => {
  const rogueJob = `
  rogue-release:
    permissions: { contents: write }
    runs-on: ubuntu-latest
    steps:
      - run: gh release create rogue asset.zip
`;
  const violations = collectReleaseWorkflowViolations(`${workflow}\n${rogueJob}`, desktopPackage);
  assert.match(violations.join("; "), /only validate-release and publish-release jobs/);
});
