const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  collectMacCandidateViolations,
  collectReleaseWorkflowViolations,
} = require("./r1-03-static-gate-audit.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "desktop-release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const desktopPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));

function extractMacCandidateBlock(source = workflow) {
  const start = source.indexOf("  macos-candidate:\n");
  assert.ok(start >= 0, "workflow must contain macos-candidate");
  const remainder = source.slice(start + 1);
  const nextJob = remainder.search(/^  [A-Za-z0-9_-]+:\n/m);
  const end = nextJob < 0 ? source.length : start + 1 + nextJob;
  return { start, end, block: source.slice(start, end) };
}

function mutateMacCandidate(mutator) {
  const { start, end, block } = extractMacCandidateBlock();
  return `${workflow.slice(0, start)}${mutator(block)}${workflow.slice(end)}`;
}

test("macOS candidate is a guarded, read-only same-SHA arm64 packaging chain", () => {
  assert.deepEqual(collectMacCandidateViolations(workflow), []);
  assert.deepEqual(collectReleaseWorkflowViolations(workflow, desktopPackage), []);

  const { block } = extractMacCandidateBlock();
  assert.match(block, /runs-on:\s+macos-15/);
  assert.match(block, /needs: validate-release/);
  assert.match(block, /if: \$\{\{ needs\.validate-release\.outputs\.allowed == 'true' && github\.event_name == 'push' && github\.ref_type == 'tag' \}\}/);
  assert.match(block, /uses: actions\/checkout@v6/);
  assert.doesNotMatch(block, /(^|\n)\s+(ref|repository):\s*/m);
  assert.match(block, /machine_arch="\$\(uname -m\)"/);
  assert.match(block, /"\$machine_arch" != "arm64"/);
  assert.match(block, /pnpm install --frozen-lockfile/);

  const orderedCommands = [
    "pnpm stage:desktop",
    "tests/prismaMigrationCompleteness.test.js",
    "pnpm dist:desktop:mac:reuse-stage",
    "pnpm verify:desktop-package:mac:reuse-stage",
  ].map((command) => block.indexOf(command));
  assert.ok(orderedCommands.every((index) => index >= 0));
  assert.ok(orderedCommands.every((index, position) => position === 0 || index > orderedCommands[position - 1]));
  assert.match(block, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(block, /publish:desktop:|update-desktop-release-notes|gh\s+release|GH_TOKEN|codesign|notarytool|notarize/i);
});

test("macOS candidate rejects runner, architecture, guard, checkout, and verification-chain mutations", () => {
  const mutations = [
    ["wrong runner", (block) => block.replace("runs-on: macos-15", "runs-on: macos-latest")],
    ["missing arm64 assertion", (block) => block.replace(/      - name: Assert arm64 runner[\s\S]*?\n      - name: Install dependencies/, "      - name: Install dependencies")],
    ["guard bypass", (block) => block.replace(
      "needs.validate-release.outputs.allowed == 'true' && github.event_name == 'push' && github.ref_type == 'tag'",
      "needs.validate-release.outputs.allowed == 'true' || github.ref_type == 'tag'",
    )],
    ["checkout ref override", (block) => block.replace("uses: actions/checkout@v6", "uses: actions/checkout@v6\n        with:\n          ref: main")],
    ["write permission", (block) => block.replace("contents: read", "contents: write")],
    ["missing install", (block) => block.replace("pnpm install --frozen-lockfile", "pnpm install")],
    ["missing stage", (block) => block.replace("pnpm stage:desktop", "pnpm stage:desktop:missing")],
    ["missing migration", (block) => block.replace("tests/prismaMigrationCompleteness.test.js", "tests/migration-missing.test.js")],
    ["partial migration check", (block) => block.replace(" tests/runtimeMigrations.test.js", " tests/runtime-migration-missing.test.js")],
    ["wrong mac build", (block) => block.replace("pnpm dist:desktop:mac:reuse-stage", "pnpm dist:desktop:reuse-stage")],
    ["wrong mac verifier", (block) => block.replace("pnpm verify:desktop-package:mac:reuse-stage", "pnpm verify:desktop-package:reuse-stage")],
  ];

  for (const [name, mutation] of mutations) {
    const mutatedWorkflow = mutateMacCandidate(mutation);
    const violations = collectMacCandidateViolations(mutatedWorkflow);
    assert.ok(violations.length > 0, `${name} must block MACOS-WORKFLOW`);
  }
});

test("macOS candidate rejects publication, release-note, token, signing, and notarization side effects", () => {
  const forbiddenCommands = [
    ["publish", "      - run: pnpm publish:desktop:release:reuse-stage\n"],
    ["release notes", "      - run: node scripts/update-desktop-release-notes.cjs\n"],
    ["GitHub release", "      - run: gh release create v0.4.25 asset.zip\n"],
    ["release token", "      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n"],
    ["signing credential", "      CSC_LINK: ${{ secrets.MACOS_CSC_LINK }}\n"],
    ["signing", "      - run: codesign --sign - app\n"],
    ["notarization", "      - run: xcrun notarytool submit app.zip\n"],
  ];

  for (const [name, addition] of forbiddenCommands) {
    const mutatedWorkflow = mutateMacCandidate((block) => `${block}${addition}`);
    const violations = collectMacCandidateViolations(mutatedWorkflow);
    assert.ok(violations.length > 0, `${name} side effect must block MACOS-WORKFLOW`);
  }
});
