const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  collectReleaseWorkflowViolations,
  evaluateForkVersionLine,
} = require("./r1-03-static-gate-audit.cjs");

// Upstream repository fixture; every upstream URL variant below is derived from this one constant.
const UPSTREAM_FIXTURE_REPOSITORY_PATH = "ExplosiveCoderflome/AI-Novel-Writing-Assistant";

const repoRoot = path.resolve(__dirname, "..", "..");
const triggerScriptPath = path.join(repoRoot, "scripts", "trigger-desktop-release.cjs");
const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "desktop-release.yml"), "utf8");
const triggerScript = fs.readFileSync(triggerScriptPath, "utf8");
const realDesktopPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));

const upstreamHttpsUrl = `https://github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}.git`;
const upstreamUrlVariants = [
  `https://github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}`,
  `https://github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}.git`,
  `https://github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}/`,
  `https://github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}.git/`,
  `git@github.com:${UPSTREAM_FIXTURE_REPOSITORY_PATH}.git`,
  `git@github.com:${UPSTREAM_FIXTURE_REPOSITORY_PATH}`,
  `ssh://git@github.com/${UPSTREAM_FIXTURE_REPOSITORY_PATH}.git`,
  `HTTPS://GITHUB.COM/${UPSTREAM_FIXTURE_REPOSITORY_PATH.toUpperCase()}.GIT`,
  `git@github.com:${UPSTREAM_FIXTURE_REPOSITORY_PATH.toLowerCase()}.git`,
];

// ---------- workflow guard ----------

function extractReleaseGuardScript() {
  const lines = workflow.split("\n");
  const guardIdIndex = lines.findIndex((line) => line.trim() === "id: release-guard");
  const runIndex = lines.findIndex((line, index) => index > guardIdIndex && line.trim() === "run: |");
  assert.ok(guardIdIndex >= 0 && runIndex >= 0, "the workflow must expose the release guard run step");
  const scriptLines = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line === "") {
      scriptLines.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    scriptLines.push(line.slice(10));
  }
  return scriptLines.join("\n");
}

function runGuardWithFixtureVersion(packageVersion, refName) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r1-g02a-guard-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "desktop"));
    fs.writeFileSync(path.join(fixtureRoot, "desktop", "package.json"), JSON.stringify({ version: packageVersion }));
    const outputPath = path.join(fixtureRoot, "github-output");
    execFileSync("bash", ["-c", extractReleaseGuardScript()], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        RELEASE_EVENT_NAME: "push",
        RELEASE_REF_TYPE: "tag",
        RELEASE_REF_NAME: refName,
      },
      stdio: "pipe",
    });
    return Object.fromEntries(
      fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => line.split("=", 2)),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("the real guard refuses every exact-match 0.x tag, including the inherited 0.4.28", () => {
  for (const version of ["0.4.28", "0.0.1", "0.99.99", "00.1.2"]) {
    const result = runGuardWithFixtureVersion(version, `v${version}`);
    assert.equal(result.allowed, "false", `v${version} must not be publishable`);
  }
});

test("the real guard allows an exact-match major>=1 tag", () => {
  for (const version of ["1.0.0", "1.2.3", "10.0.0"]) {
    const result = runGuardWithFixtureVersion(version, `v${version}`);
    assert.equal(result.allowed, "true", `v${version} must be publishable`);
    assert.equal(result.version, version);
  }
  assert.equal(runGuardWithFixtureVersion("1.2.3", "v1.2.4").allowed, "false");
  assert.equal(runGuardWithFixtureVersion("1.2.3", "desktop-v1.2.3").allowed, "false");
  assert.equal(runGuardWithFixtureVersion("1.2.3", "v1.2.3-rc1").allowed, "false");
});

// ---------- FORK-VERSION-LINE audit ----------

test("FORK-VERSION-LINE is REVIEW on the inherited 0.x line and PASS on major>=1", () => {
  const realMajor = Number(String(realDesktopPackage.version).split(".")[0]);
  const real = evaluateForkVersionLine(workflow, triggerScript, realDesktopPackage);
  assert.equal(real.status, realMajor >= 1 ? "PASS" : "REVIEW", real.message);
  assert.equal(evaluateForkVersionLine(workflow, triggerScript, { version: "0.4.28" }).status, "REVIEW");
  assert.equal(evaluateForkVersionLine(workflow, triggerScript, { version: "1.2.3" }).status, "PASS");
  assert.deepEqual(collectReleaseWorkflowViolations(workflow, realDesktopPackage), []);
  assert.deepEqual(collectReleaseWorkflowViolations(workflow, { version: "1.2.3" }), []);
});

test("FORK-VERSION-LINE is BLOCKED when the guard major gate is removed", () => {
  const mutated = workflow.replace(/\(\( 10#\$\{version%%\.\*\} >= 1 \)\)/, "true");
  assert.notEqual(mutated, workflow);
  const result = evaluateForkVersionLine(mutated, triggerScript, { version: "1.2.3" });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.message, /major version 1 or higher/);
});

test("FORK-VERSION-LINE is BLOCKED when the default push remote is not fork", () => {
  const mutated = triggerScript.replace('    remote: "fork",', '    remote: "origin",');
  assert.notEqual(mutated, triggerScript);
  const result = evaluateForkVersionLine(workflow, mutated, { version: "1.2.3" });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.message, /default push remote is not fork/);
});

test("FORK-VERSION-LINE is BLOCKED when the upstream collision check is removed", () => {
  for (const mutated of [
    triggerScript.replace('    assertTagAbsentOnRemote(upstreamRemote, tagName, "upstream");\n', ""),
    triggerScript.replace("  assertTargetRemoteIsNotUpstream(options.remote, remotes);\n", ""),
    triggerScript.replace(/^const UPSTREAM_REPOSITORY_SLUG = .*\n/m, ""),
  ]) {
    assert.notEqual(mutated, triggerScript);
    const result = evaluateForkVersionLine(workflow, mutated, { version: "1.2.3" });
    assert.equal(result.status, "BLOCKED");
    assert.match(result.message, /upstream remote URL check|collision/);
  }
});

test("FORK-VERSION-LINE is BLOCKED when the script pushes all tags or accepts major 0", () => {
  const pushAll = triggerScript.replace(
    'git(["push", options.remote, `refs/tags/${tagName}`]',
    'git(["push", options.remote, "--tags"]',
  );
  assert.notEqual(pushAll, triggerScript);
  assert.equal(evaluateForkVersionLine(workflow, pushAll, { version: "1.2.3" }).status, "BLOCKED");
  const noMajorGate = triggerScript.replace('Number(version.split(".")[0]) < 1', "false");
  assert.notEqual(noMajorGate, triggerScript);
  assert.equal(evaluateForkVersionLine(workflow, noMajorGate, { version: "1.2.3" }).status, "BLOCKED");
});

// ---------- trigger script in temp git repositories ----------

function isolatedGitEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return {
    ...env,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    // Only local file remotes can be reached; any https/ssh access fails immediately instead of using the network.
    GIT_ALLOW_PROTOCOL: "file",
    GIT_AUTHOR_NAME: "Release Test",
    GIT_AUTHOR_EMAIL: "release-test@example.invalid",
    GIT_COMMITTER_NAME: "Release Test",
    GIT_COMMITTER_EMAIL: "release-test@example.invalid",
  };
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, env: isolatedGitEnv(), encoding: "utf8", stdio: "pipe" }).trim();
}

function createFixture({ version = "1.2.3" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "r1-g02a-trigger-"));
  const repo = path.join(root, "work");
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(repo, "desktop"), { recursive: true });
  fs.copyFileSync(triggerScriptPath, path.join(repo, "scripts", "trigger-desktop-release.cjs"));
  fs.writeFileSync(path.join(repo, "desktop", "package.json"), `${JSON.stringify({ version }, null, 2)}\n`);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "fixture"]);
  const bare = (name) => {
    const bareRepo = path.join(root, `${name}.git`);
    git(root, ["init", "-q", "--bare", bareRepo]);
    return bareRepo;
  };
  const addRemote = (name, fetchUrl, pushUrl) => {
    git(repo, ["remote", "add", name, fetchUrl]);
    if (pushUrl) git(repo, ["remote", "set-url", "--push", name, pushUrl]);
  };
  const seedRemoteTag = (remoteUrl, tagName) => {
    git(repo, ["tag", tagName]);
    git(repo, ["push", "-q", remoteUrl, `refs/tags/${tagName}`]);
    git(repo, ["tag", "-d", tagName]);
  };
  return { root, repo, bare, addRemote, seedRemoteTag, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// Standard layout: fork = local bare; origin = upstream by push URL, fetch URL = local bare so ls-remote stays offline.
function createStandardFixture(options) {
  const fixture = createFixture(options);
  fixture.forkBare = fixture.bare("fork");
  fixture.upstreamBare = fixture.bare("upstream");
  fixture.addRemote("fork", fixture.forkBare);
  fixture.addRemote("origin", fixture.upstreamBare, upstreamHttpsUrl);
  return fixture;
}

function allRefs(cwd) {
  return git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)"]);
}

function runTrigger(fixture, args = []) {
  const result = spawnSync(process.execPath, ["scripts/trigger-desktop-release.cjs", ...args], {
    cwd: fixture.repo,
    env: isolatedGitEnv(),
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertRefusedWithoutTag(fixture, args, messagePattern) {
  const refsBefore = allRefs(fixture.repo);
  const result = runTrigger(fixture, args);
  assert.equal(result.status, 1, `expected refusal, got stdout=${result.stdout} stderr=${result.stderr}`);
  assert.match(result.stderr, messagePattern);
  assert.equal(allRefs(fixture.repo), refsBefore, "a refused release must not write any local ref");
  assert.equal(git(fixture.repo, ["tag", "-l", "v1.2.3"]), "");
  return result;
}

test("dry run defaults to the fork remote, checks upstream, and writes no ref anywhere", () => {
  const fixture = createStandardFixture();
  try {
    const before = [allRefs(fixture.repo), allRefs(fixture.forkBare), allRefs(fixture.upstreamBare)];
    const result = runTrigger(fixture, ["--dry-run"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /remote=fork\n/);
    assert.match(result.stdout, /upstream-checked=origin\n/);
    assert.match(result.stdout, /dry run passed/);
    assert.deepEqual([allRefs(fixture.repo), allRefs(fixture.forkBare), allRefs(fixture.upstreamBare)], before);
  } finally {
    fixture.cleanup();
  }
});

test("a real run pushes only the single release tag to fork, never locally fetched upstream tags", () => {
  const fixture = createStandardFixture();
  try {
    git(fixture.repo, ["tag", "v0.4.28"]);
    const result = runTrigger(fixture);
    assert.equal(result.status, 0, result.stderr);
    const forkTags = git(fixture.repo, ["ls-remote", "--tags", fixture.forkBare]).split("\n")
      .map((line) => line.split("\t")[1]).filter((ref) => !ref.endsWith("^{}"));
    assert.deepEqual(forkTags, ["refs/tags/v1.2.3"]);
    assert.equal(git(fixture.repo, ["ls-remote", "--tags", fixture.upstreamBare]), "");
    assert.doesNotMatch(triggerScript, /\[\s*"push"[^\]]*"--tags"/);
  } finally {
    fixture.cleanup();
  }
});

test("a major 0 package version is refused before any tag is created", () => {
  const fixture = createStandardFixture({ version: "0.4.28" });
  try {
    const result = runTrigger(fixture, ["--dry-run"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /major 1 or higher/);
    assert.equal(git(fixture.repo, ["tag", "-l"]), "");
  } finally {
    fixture.cleanup();
  }
});

test("pushing to a remote whose fetch URL is upstream is refused before any network call", () => {
  const fixture = createStandardFixture();
  try {
    const result = assertRefusedWithoutTag(fixture, ["--remote", "origin"], /points to the upstream repository/);
    assert.doesNotMatch(result.stderr, /ls-remote failed/);
  } finally {
    fixture.cleanup();
  }
});

test("push URL differs from fetch URL: an upstream push URL on the target remote is refused", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", fixture.bare("fork"), upstreamHttpsUrl);
    fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
    const result = assertRefusedWithoutTag(fixture, ["--dry-run"], /Push remote "fork" points to the upstream repository/);
    assert.doesNotMatch(result.stderr, /ls-remote failed/);
  } finally {
    fixture.cleanup();
  }
});

test("push URL differs from fetch URL: an upstream fetch URL on the target remote is refused", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", upstreamHttpsUrl, fixture.bare("fork"));
    fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
    const result = assertRefusedWithoutTag(fixture, ["--dry-run"], /Push remote "fork" points to the upstream repository/);
    assert.doesNotMatch(result.stderr, /ls-remote failed/);
  } finally {
    fixture.cleanup();
  }
});

test("upstream URL detection covers case, SSH, HTTPS, .git and trailing slash variants", () => {
  for (const variant of upstreamUrlVariants) {
    const fixture = createFixture();
    try {
      fixture.addRemote("fork", variant);
      fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
      const result = assertRefusedWithoutTag(fixture, ["--dry-run"], /points to the upstream repository/);
      assert.doesNotMatch(result.stderr, /ls-remote failed/, variant);
    } finally {
      fixture.cleanup();
    }
  }
});

test("a non-upstream GitHub URL is not classified as upstream", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", "git@github.com:shown1985/AI-Novel-Writing-Assistant.git");
    fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
    // Offline test env blocks ssh, so reaching ls-remote proves the URL was not treated as upstream.
    assertRefusedWithoutTag(fixture, ["--dry-run"], /Cannot query tags on push remote "fork"/);
  } finally {
    fixture.cleanup();
  }
});

test("no upstream remote is refused with guidance instead of skipping the upstream collision check", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", fixture.bare("fork"));
    assertRefusedWithoutTag(fixture, ["--dry-run"], /No upstream remote found[\s\S]*git remote add origin/);
  } finally {
    fixture.cleanup();
  }
});

test("a missing push remote is refused with guidance", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
    assertRefusedWithoutTag(fixture, ["--dry-run"], /Push remote "fork" is not configured/);
  } finally {
    fixture.cleanup();
  }
});

test("an existing local tag is refused", () => {
  const fixture = createStandardFixture();
  try {
    git(fixture.repo, ["tag", "v1.2.3"]);
    const refsBefore = allRefs(fixture.repo);
    const result = runTrigger(fixture, ["--dry-run"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Local tag v1\.2\.3 already exists/);
    assert.equal(allRefs(fixture.repo), refsBefore);
  } finally {
    fixture.cleanup();
  }
});

test("an existing tag on the push remote is refused", () => {
  const fixture = createStandardFixture();
  try {
    fixture.seedRemoteTag(fixture.forkBare, "v1.2.3");
    assertRefusedWithoutTag(fixture, [], /already exists on push remote "fork"/);
  } finally {
    fixture.cleanup();
  }
});

test("an existing tag on the upstream remote is refused", () => {
  const fixture = createStandardFixture();
  try {
    fixture.seedRemoteTag(fixture.upstreamBare, "v1.2.3");
    assertRefusedWithoutTag(fixture, [], /already exists on upstream remote "origin"/);
  } finally {
    fixture.cleanup();
  }
});

test("a failing ls-remote on the push remote is refused, not treated as tag absent", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", path.join(fixture.root, "missing-fork.git"));
    fixture.addRemote("origin", fixture.bare("upstream"), upstreamHttpsUrl);
    assertRefusedWithoutTag(fixture, [], /Cannot query tags on push remote "fork" \(git ls-remote failed/);
  } finally {
    fixture.cleanup();
  }
});

test("a failing ls-remote on the upstream remote is refused, not treated as tag absent", () => {
  const fixture = createFixture();
  try {
    fixture.addRemote("fork", fixture.bare("fork"));
    fixture.addRemote("origin", path.join(fixture.root, "missing-upstream.git"), upstreamHttpsUrl);
    assertRefusedWithoutTag(fixture, [], /Cannot query tags on upstream remote "origin" \(git ls-remote failed/);
  } finally {
    fixture.cleanup();
  }
});
