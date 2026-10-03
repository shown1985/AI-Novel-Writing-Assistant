const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  collectForkPublishTargetViolations,
  collectMacCandidateViolations,
  collectReleaseWorkflowViolations,
  readForkPublishTargetSources,
} = require("./r1-03-static-gate-audit.cjs");

// Upstream owner fixture; every mutation below that reintroduces the upstream owner derives from this constant.
const UPSTREAM_FIXTURE_OWNER = "ExplosiveCoderflome";

const repoRoot = path.resolve(__dirname, "..", "..");
const RELEASE = ".github/workflows/desktop-release.yml";
const BETA = ".github/workflows/desktop-beta-release.yml";
const SITE = ".github/workflows/site-pages.yml";
const TRIGGER = "scripts/trigger-desktop-release.cjs";
const AUDIT = "scripts/release/r1-03-static-gate-audit.cjs";
const PR_TEMPLATE = ".github/pull_request_template.md";
const G02A_TEST = "scripts/release/r1-g02a-fork-version-line.test.cjs";
const G02B_TEST = "scripts/release/r1-g02b-fork-publish-target.test.cjs";

const baseSources = readForkPublishTargetSources();
const desktopPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));

function textOf(sources, filePath) {
  const workflow = sources.workflows.find((file) => file.path === filePath);
  if (workflow) return workflow.text;
  const scanned = sources.scannedFiles.find((file) => file.path === filePath);
  assert.ok(scanned, `missing source ${filePath}`);
  return scanned.text;
}

// Returns sources where filePath's text is replaced everywhere it is used (workflow list, scan list, builder, stage).
function mutate(filePath, mutator) {
  const original = filePath === "desktop/electron-builder.config.cjs"
    ? baseSources.builderConfig
    : filePath === "desktop/scripts/stage-desktop.cjs"
      ? baseSources.stageScript
      : textOf(baseSources, filePath);
  const next = mutator(original);
  assert.notEqual(next, original, `mutation of ${filePath} must change the file`);
  const swap = (file) => (file.path === filePath ? { ...file, text: next } : file);
  return {
    builderConfig: filePath === "desktop/electron-builder.config.cjs" ? next : baseSources.builderConfig,
    stageScript: filePath === "desktop/scripts/stage-desktop.cjs" ? next : baseSources.stageScript,
    workflows: baseSources.workflows.map(swap),
    scannedFiles: baseSources.scannedFiles.map(swap),
  };
}

function addScannedFile(sources, filePath, text) {
  return { ...sources, scannedFiles: [...sources.scannedFiles, { path: filePath, text }] };
}

function addWorkflow(sources, filePath, text) {
  return {
    ...sources,
    workflows: [...sources.workflows, { path: filePath, text }],
    scannedFiles: [...sources.scannedFiles, { path: filePath, text }],
  };
}

function assertBlocked(sources, pattern, label) {
  const violations = collectForkPublishTargetViolations(sources);
  assert.ok(violations.length > 0, `${label} must be BLOCKED`);
  assert.match(violations.join("; "), pattern, label);
}

function extractJobBlock(workflow, jobName) {
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.ok(start >= 0, `missing ${jobName}`);
  const nextJob = workflow.slice(start + 1).search(/^  [A-Za-z0-9_-]+:\n/m);
  return workflow.slice(start, nextJob < 0 ? workflow.length : start + 1 + nextJob);
}

// ---------- positive state ----------

test("the real repository passes FORK-PUBLISH-TARGET, including site-pages.yml", () => {
  assert.deepEqual(collectForkPublishTargetViolations(baseSources), []);
  const site = baseSources.workflows.find((file) => file.path === SITE);
  assert.ok(site, "site-pages.yml must be scanned");
  assert.deepEqual(
    collectForkPublishTargetViolations({ ...baseSources, workflows: [site] })
      .filter((message) => message.includes("site-pages.yml")),
    [],
  );
});

test("all four owner/repo defaults point at this distribution", () => {
  const expected = "shown1985/AI-Novel-Writing-Assistant";
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AI_NOVEL_GITHUB_")));
  const child = spawnSync(process.execPath, ["-e", [
    "const config = require('./desktop/electron-builder.config.cjs');",
    "const target = config.publish[0];",
    "process.stdout.write(`${target.provider} ${target.owner}/${target.repo}`);",
  ].join("\n")], { cwd: repoRoot, env: { ...env, AI_NOVEL_RELEASE_CHANNEL: "beta" }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, `github ${expected}`);

  assert.match(baseSources.stageScript, /process\.env\.AI_NOVEL_GITHUB_OWNER \|\| "shown1985"/);
  assert.match(baseSources.stageScript, /process\.env\.AI_NOVEL_GITHUB_REPO \|\| "AI-Novel-Writing-Assistant"/);
  const publishJob = extractJobBlock(textOf(baseSources, RELEASE), "publish-release");
  assert.match(publishJob, /^      AI_NOVEL_GITHUB_OWNER: shown1985$/m);
  assert.match(publishJob, /^      AI_NOVEL_GITHUB_REPO: AI-Novel-Writing-Assistant$/m);
  const beta = textOf(baseSources, BETA);
  assert.match(beta, /^      AI_NOVEL_GITHUB_OWNER: shown1985$/m);
  assert.match(beta, /^      AI_NOVEL_GITHUB_REPO: AI-Novel-Writing-Assistant$/m);
});

test("the beta workflow is check-only", () => {
  const beta = textOf(baseSources, BETA);
  assert.match(beta, /^permissions:\n  contents: read\s*$/m);
  assert.match(beta, /^    permissions:\n      contents: read\s*$/m);
  assert.doesNotMatch(beta, /publish:desktop:|update-desktop-release-notes|gh release|GH_TOKEN|--publish|contents:\s*write/);
  for (const step of ["pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm stage:desktop", "tests/prismaMigrationCompleteness.test.js", "pnpm verify:desktop-package:reuse-stage"]) {
    assert.ok(beta.includes(step), `beta workflow must keep ${step}`);
  }
});

test("existing release findings do not regress and publish-release stays the only write job", () => {
  const release = textOf(baseSources, RELEASE);
  assert.deepEqual(collectReleaseWorkflowViolations(release, desktopPackage), []);
  assert.deepEqual(collectMacCandidateViolations(release), []);
  for (const file of baseSources.workflows) {
    const text = file.path === RELEASE ? release.replace(extractJobBlock(release, "publish-release"), "") : file.text;
    assert.doesNotMatch(text, /contents:\s*write|publish:desktop:|update-desktop-release-notes|GH_TOKEN|GITHUB_TOKEN/, file.path);
  }
});

// ---------- owner / repo mutations ----------

test("each owner default reverting to upstream is BLOCKED", () => {
  const cases = [
    ["desktop/electron-builder.config.cjs", (text) => text.replace('AI_NOVEL_GITHUB_OWNER, "shown1985"', `AI_NOVEL_GITHUB_OWNER, "${UPSTREAM_FIXTURE_OWNER}"`), /electron-builder\.config\.cjs publish default publishes to/],
    ["desktop/scripts/stage-desktop.cjs", (text) => text.replace('AI_NOVEL_GITHUB_OWNER || "shown1985"', `AI_NOVEL_GITHUB_OWNER || "${UPSTREAM_FIXTURE_OWNER}"`), /stage-desktop\.cjs app-update\.yml default publishes to/],
    [RELEASE, (text) => text.replace("AI_NOVEL_GITHUB_OWNER: shown1985", `AI_NOVEL_GITHUB_OWNER: ${UPSTREAM_FIXTURE_OWNER}`), /publish-release env publishes to/],
    [BETA, (text) => text.replace("AI_NOVEL_GITHUB_OWNER: shown1985", `AI_NOVEL_GITHUB_OWNER: ${UPSTREAM_FIXTURE_OWNER}`), /desktop-beta-release\.yml env publishes to/],
  ];
  for (const [filePath, mutator, pattern] of cases) {
    assertBlocked(mutate(filePath, mutator), pattern, `${filePath} owner reverted`);
  }
});

test("inconsistent owner/repo across the four places is BLOCKED", () => {
  assertBlocked(
    mutate("desktop/scripts/stage-desktop.cjs", (text) => text.replace('AI_NOVEL_GITHUB_REPO || "AI-Novel-Writing-Assistant"', 'AI_NOVEL_GITHUB_REPO || "Other-Repo"')),
    /publish targets are inconsistent/,
    "repo mismatch",
  );
  assertBlocked(
    mutate(BETA, (text) => text.replace("AI_NOVEL_GITHUB_OWNER: shown1985", "AI_NOVEL_GITHUB_OWNER: someone-else")),
    /publish targets are inconsistent/,
    "owner mismatch",
  );
  assertBlocked(
    mutate(BETA, (text) => text.replace(/^      AI_NOVEL_GITHUB_OWNER: .*\n/m, "")),
    /desktop-beta-release\.yml env does not declare/,
    "owner removed",
  );
});

// ---------- upstream owner exact allowlist ----------

test("an upstream owner outside the allowlist is BLOCKED", () => {
  assertBlocked(
    addScannedFile(baseSources, "desktop/src/runtime/updater.ts", `const owner = "${UPSTREAM_FIXTURE_OWNER}";\n`),
    /outside the allowlist in desktop\/src\/runtime\/updater\.ts:1/,
    "new file",
  );
  assertBlocked(
    mutate("desktop/scripts/stage-desktop.cjs", (text) => `${text}\n// see ${UPSTREAM_FIXTURE_OWNER.toUpperCase()}\n`),
    /outside the allowlist in desktop\/scripts\/stage-desktop\.cjs/,
    "case-insensitive hit",
  );
});

test("a second upstream hit in the trigger script outside its constant is BLOCKED", () => {
  assertBlocked(
    mutate(TRIGGER, (text) => text.replace('    remote: "fork",', `    remote: "${UPSTREAM_FIXTURE_OWNER}",`)),
    /trigger-desktop-release\.cjs must contain exactly 1 upstream owner reference\(s\), found 2[\s\S]*outside its allowed named constant/,
    "trigger second hit",
  );
});

test("upstream hits outside the named constants in the audit or test files are BLOCKED", () => {
  assertBlocked(
    mutate(AUDIT, (text) => text.replace('const FORK_GITHUB_OWNER = "shown1985";', `const FORK_GITHUB_OWNER = "${UPSTREAM_FIXTURE_OWNER}";`)),
    /r1-03-static-gate-audit\.cjs must contain exactly 1[\s\S]*outside its allowed named constant/,
    "audit extra hit",
  );
  for (const testFile of [G02A_TEST, G02B_TEST]) {
    assertBlocked(
      mutate(testFile, (text) => `${text}\nconst notAFixture = "${UPSTREAM_FIXTURE_OWNER}";\n`),
      new RegExp(`${testFile.replace(/[.]/g, "\\.")}:\\d+ is outside its allowed named constant`),
      `${testFile} hit outside fixture constant`,
    );
  }
  assertBlocked(
    mutate(PR_TEMPLATE, (text) => `${text}\nhttps://github.com/${UPSTREAM_FIXTURE_OWNER}/CLA.md\n`),
    /pull_request_template\.md must contain exactly 1 upstream owner reference\(s\), found 2/,
    "PR template second hit",
  );
});

test("deleting allowlisted files does not produce a false positive", () => {
  const allowlisted = new Set([PR_TEMPLATE, TRIGGER, AUDIT, G02A_TEST, G02B_TEST]);
  const sources = { ...baseSources, scannedFiles: baseSources.scannedFiles.filter((file) => !allowlisted.has(file.path)) };
  assert.deepEqual(collectForkPublishTargetViolations(sources), []);
});

// ---------- beta workflow mutations ----------

test("restoring beta write permission or any forbidden publish string is BLOCKED", () => {
  assertBlocked(
    mutate(BETA, (text) => text.replace("permissions:\n  contents: read", "permissions:\n  contents: write")),
    /desktop-beta-release\.yml grants contents: write/,
    "beta workflow-level write",
  );
  assertBlocked(
    mutate(BETA, (text) => text.replace("    permissions:\n      contents: read", "    permissions:\n      contents: write")),
    /beta workflow must declare contents: read at workflow and job level[\s\S]*grants contents: write/,
    "beta job-level write",
  );
  const forbidden = [
    ["publish:desktop:", "      - run: pnpm publish:desktop:beta:reuse-stage\n", /side effects/],
    ["update-desktop-release-notes", "      - run: node scripts/update-desktop-release-notes.cjs\n", /side effects/],
    ["gh release", "      - run: gh release upload beta out.exe\n", /side effects/],
    ["--publish", "      - run: pnpm exec electron-builder --publish always\n", /side effects/],
    ["GH_TOKEN", "      - run: echo $GH_TOKEN\n", /release token[\s\S]*GH_TOKEN/],
  ];
  for (const [label, step, pattern] of forbidden) {
    assertBlocked(mutate(BETA, (text) => `${text}${step}`), pattern, `beta ${label}`);
  }
});

// ---------- cross-workflow write / token scan ----------

test("another workflow gaining write access, write-all, or losing top-level permissions is BLOCKED", () => {
  assertBlocked(
    mutate(SITE, (text) => text.replace("permissions:\n  contents: read", "permissions:\n  contents: write")),
    /site-pages\.yml grants contents: write/,
    "site contents write",
  );
  assertBlocked(
    mutate(SITE, (text) => text.replace(/^permissions:\n  contents: read\n  pages: write\n  id-token: write\n/m, "permissions: write-all\n")),
    /site-pages\.yml grants permissions: write-all/,
    "site write-all",
  );
  assertBlocked(
    mutate(SITE, (text) => text.replace(/^permissions:\n  contents: read\n  pages: write\n  id-token: write\n/m, "")),
    /site-pages\.yml has no top-level permissions block/,
    "site missing permissions",
  );
  const newWorkflow = "name: Sync\non:\n  workflow_dispatch:\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";
  assertBlocked(addWorkflow(baseSources, ".github/workflows/sync.yml", newWorkflow), /sync\.yml has no top-level permissions block/, "new workflow without permissions");
});

test("each of the four token names in another workflow is BLOCKED", () => {
  for (const token of ["GITHUB_TOKEN", "secrets.GITHUB_TOKEN", "AI_NOVEL_GITHUB_TOKEN", "GH_TOKEN"]) {
    const sources = mutate(SITE, (text) => `${text}        env:\n          TOKEN_FIXTURE: \${{ ${token} }}\n`);
    const violations = collectForkPublishTargetViolations(sources).join("; ");
    assert.match(violations, /site-pages\.yml references a release token/, token);
    assert.ok(violations.includes(`(${token})`), `${token} must be reported by name: ${violations}`);
  }
});

test("a non-publish job in desktop-release.yml gaining write, token, or publish step is BLOCKED", () => {
  const release = textOf(baseSources, RELEASE);
  const macJob = extractJobBlock(release, "macos-candidate");
  const withMac = (next) => mutate(RELEASE, (text) => text.replace(macJob, next));
  assertBlocked(
    withMac(macJob.replace("    permissions:\n      contents: read", "    permissions:\n      contents: write")),
    /desktop-release\.yml grants contents: write outside the guarded publish-release job/,
    "mac write",
  );
  assertBlocked(
    withMac(macJob.replace("      CSC_IDENTITY_AUTO_DISCOVERY: \"false\"", "      CSC_IDENTITY_AUTO_DISCOVERY: \"false\"\n      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}")),
    /desktop-release\.yml references a release token outside the guarded publish-release job/,
    "mac token",
  );
  assertBlocked(
    withMac(`${macJob}\n      - name: Rogue publish\n        run: pnpm publish:desktop:release:reuse-stage\n`),
    /desktop-release\.yml has release side effects outside the guarded publish-release job/,
    "mac publish step",
  );
  const validateJob = extractJobBlock(release, "validate-release");
  assertBlocked(
    mutate(RELEASE, (text) => text.replace(validateJob, validateJob.replace("    permissions:\n      contents: read", "    permissions: write-all"))),
    /desktop-release\.yml grants permissions: write-all/,
    "validate write-all",
  );
});

// ---------- QA hardening: token forms, quoted permissions, root package.json ----------

test("github.token and lowercase token names in a non-publish workflow are BLOCKED", () => {
  const cases = [
    ["github.token via env", "        env:\n          TOKEN_FIXTURE: ${{ github.token }}\n", "github.token"],
    ["github.token via with: token:", "      - uses: actions/checkout@v6\n        with:\n          token: ${{ github.token }}\n", "github.token"],
    ["lowercase secrets.github_token", "        env:\n          TOKEN_FIXTURE: ${{ secrets.github_token }}\n", "secrets.github_token"],
  ];
  for (const [label, addition, reported] of cases) {
    const violations = collectForkPublishTargetViolations(mutate(SITE, (text) => `${text}${addition}`)).join("; ");
    assert.match(violations, /site-pages\.yml references a release token/, label);
    assert.ok(violations.includes(`(${reported})`), `${label} must be reported by name: ${violations}`);
  }
});

test("quoted job-level write permissions in a non-publish job are BLOCKED", () => {
  const release = textOf(baseSources, RELEASE);
  const macJob = extractJobBlock(release, "macos-candidate");
  const withMac = (next) => mutate(RELEASE, (text) => text.replace(macJob, next));
  for (const quote of ['"', "'"]) {
    assertBlocked(
      withMac(macJob.replace("    permissions:\n      contents: read", `    permissions:\n      contents: ${quote}write${quote}`)),
      /desktop-release\.yml grants contents: write outside the guarded publish-release job/,
      `contents: ${quote}write${quote}`,
    );
    assertBlocked(
      withMac(macJob.replace("    permissions:\n      contents: read", `    permissions: ${quote}write-all${quote}`)),
      /desktop-release\.yml grants permissions: write-all/,
      `permissions: ${quote}write-all${quote}`,
    );
  }
});

test("an upstream publish owner override in the root package.json is BLOCKED", () => {
  assert.ok(baseSources.scannedFiles.some((file) => file.path === "package.json"), "root package.json must be scanned");
  assertBlocked(
    mutate("package.json", (text) => text.replace(
      '"scripts": {',
      `"scripts": {\n    "dist:rogue": "electron-builder -c.publish.owner=${UPSTREAM_FIXTURE_OWNER}",`,
    )),
    /outside the allowlist in package\.json:\d+/,
    "root package.json owner override",
  );
});
