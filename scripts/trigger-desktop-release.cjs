const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");

// The only place this script names the upstream repository. A remote whose fetch or push URL
// ends with this owner/repo path (SSH or HTTPS, optional .git or trailing slash) is upstream.
const UPSTREAM_REPOSITORY_SLUG = "explosivecoderflome/ai-novel-writing-assistant";

function parseArgs(argv) {
  const options = {
    remote: "fork",
    branch: "main",
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--remote" && argv[index + 1]) {
      options.remote = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (arg === "--branch" && argv[index + 1]) {
      options.branch = argv[index + 1].trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: node scripts/trigger-desktop-release.cjs [--dry-run] [--remote fork] [--branch main]",
    "",
    "Reads desktop/package.json version (major 1 or higher), checks that tag vX.Y.Z does not exist",
    "locally, on the push remote, or on the upstream remote, then creates the tag and pushes the",
    "branch and that single tag to trigger the GitHub Desktop Release workflow.",
    "Pushing to a remote whose URL points to the upstream repository is refused.",
    "This script does not build locally.",
  ].join("\n"));
}

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function gitOk(args) {
  try {
    git(args);
    return true;
  } catch (_error) {
    return false;
  }
}

function readDesktopVersion() {
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `desktop/package.json version must be stable semver like 1.0.0, got ${version || "(empty)"}.`,
    );
  }
  if (Number(version.split(".")[0]) < 1) {
    throw new Error(
      `desktop/package.json version ${version} is on the inherited 0.x upstream line; this distribution publishes only major 1 or higher.`,
    );
  }
  return version;
}

function isUpstreamRemoteUrl(url) {
  const normalized = String(url).trim().toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  return normalized.endsWith(`/${UPSTREAM_REPOSITORY_SLUG}`) || normalized.endsWith(`:${UPSTREAM_REPOSITORY_SLUG}`);
}

function readRemoteUrls(remote) {
  const urls = [];
  for (const args of [["remote", "get-url", "--all", remote], ["remote", "get-url", "--push", "--all", remote]]) {
    let output;
    try {
      output = git(args);
    } catch (_error) {
      throw new Error(
        `Cannot read the URL of remote "${remote}". Add it with "git remote add ${remote} <url>" or pass --remote <name>.`,
      );
    }
    urls.push(...output.split("\n").map((line) => line.trim()).filter(Boolean));
  }
  return urls;
}

// URL-only classification: runs before any network call.
function classifyRemotes() {
  const names = git(["remote"]).split("\n").map((line) => line.trim()).filter(Boolean);
  return names.map((name) => {
    const urls = readRemoteUrls(name);
    return { name, urls, upstream: urls.some(isUpstreamRemoteUrl) };
  });
}

function assertTargetRemoteIsNotUpstream(remote, remotes) {
  const target = remotes.find((entry) => entry.name === remote);
  if (!target) {
    throw new Error(
      `Push remote "${remote}" is not configured. Add this distribution's repository with "git remote add ${remote} <url>".`,
    );
  }
  if (target.upstream) {
    throw new Error(
      `Push remote "${remote}" points to the upstream repository (${target.urls.join(", ")}). Release tags are only pushed to this distribution's repository.`,
    );
  }
}

function findUpstreamRemotes(remotes) {
  const upstreamRemotes = remotes.filter((entry) => entry.upstream).map((entry) => entry.name);
  if (upstreamRemotes.length === 0) {
    throw new Error(
      `No upstream remote found, so upstream tag collisions cannot be checked. Add one, for example "git remote add origin https://github.com/${UPSTREAM_REPOSITORY_SLUG}.git", then retry.`,
    );
  }
  return upstreamRemotes;
}

function assertTagAbsentLocally(tagName) {
  if (gitOk(["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`])) {
    throw new Error(`Local tag ${tagName} already exists. Choose the next version instead of reusing a tag.`);
  }
}

function assertTagAbsentOnRemote(remote, tagName, role) {
  let output;
  try {
    output = git(["ls-remote", "--tags", remote, `refs/tags/${tagName}`]);
  } catch (error) {
    const detail = String(error.stderr || error.message || "").trim().split("\n")[0];
    throw new Error(
      `Cannot query tags on ${role} remote "${remote}" (git ls-remote failed: ${detail}). Fix the remote URL or network access and retry; the release is not triggered without this check.`,
    );
  }
  if (output) {
    throw new Error(`Tag ${tagName} already exists on ${role} remote "${remote}". Choose the next version instead of reusing a tag.`);
  }
}

function assertCleanWorkingTree() {
  const status = git(["status", "--porcelain"]);
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before triggering a desktop release.");
  }
}

function assertOnBranch(branch) {
  const currentBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (currentBranch !== branch) {
    throw new Error(`Desktop release must be triggered from ${branch}; current branch is ${currentBranch}.`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const version = readDesktopVersion();
  const tagName = `v${version}`;

  const remotes = classifyRemotes();
  assertTargetRemoteIsNotUpstream(options.remote, remotes);
  const upstreamRemotes = findUpstreamRemotes(remotes);

  assertCleanWorkingTree();
  assertOnBranch(options.branch);
  assertTagAbsentLocally(tagName);
  assertTagAbsentOnRemote(options.remote, tagName, "push");
  for (const upstreamRemote of upstreamRemotes) {
    assertTagAbsentOnRemote(upstreamRemote, tagName, "upstream");
  }

  console.log(`[desktop-release] version=${version}`);
  console.log(`[desktop-release] tag=${tagName}`);
  console.log(`[desktop-release] remote=${options.remote}`);
  console.log(`[desktop-release] upstream-checked=${upstreamRemotes.join(",")}`);
  console.log(`[desktop-release] branch=${options.branch}`);

  if (options.dryRun) {
    console.log("[desktop-release] dry run passed; no tag or push was performed.");
    return;
  }

  git(["tag", "-a", tagName, "-m", `release: ${tagName}`], { stdio: "inherit" });
  git(["push", options.remote, options.branch], { stdio: "inherit" });
  git(["push", options.remote, `refs/tags/${tagName}`], { stdio: "inherit" });
  console.log(`[desktop-release] pushed ${tagName}; GitHub Actions will build and publish the desktop release.`);
}

try {
  main();
} catch (error) {
  console.error(`[desktop-release] ${error.message}`);
  process.exit(1);
}
