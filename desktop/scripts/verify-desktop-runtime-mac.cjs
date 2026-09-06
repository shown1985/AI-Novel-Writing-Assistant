const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.join(repoRoot, "desktop");
const distDir = path.join(desktopDir, "build", "dist");
const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-desktop-mac-runtime-"));
const copiedAppDir = path.join(testRoot, "installed");
const dataDir = path.join(testRoot, "data");
const worldName = "Mac runtime smoke world";
const waitTimeoutMs = 45_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listAppBundles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => path.join(rootDir, entry.name));
}

function findPackagedApp() {
  const candidates = [
    ...listAppBundles(path.join(distDir, "mac-arm64")),
    ...listAppBundles(path.join(distDir, "mac")),
  ];
  assert(candidates.length === 1, `Expected one packaged macOS app, found ${candidates.length}.`);
  return candidates[0];
}

function findDmg() {
  const expectedSuffix = `-${desktopPackage.version}-arm64.dmg`;
  const matches = fs.readdirSync(distDir)
    .filter((entry) => entry.endsWith(expectedSuffix))
    .map((entry) => path.join(distDir, entry));
  assert(matches.length === 1, `Expected one macOS arm64 DMG for version ${desktopPackage.version}, found ${matches.length}.`);
  return matches[0];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code=${code ?? "null"} signal=${signal ?? "none"}: ${stderr.trim()}`));
    });
  });
}

async function attachDmg(dmgPath) {
  const result = await runCommand("hdiutil", ["attach", "-nobrowse", "-readonly", dmgPath]);
  const volumePath = result.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/(\/Volumes\/[^\r\n]+)$/)?.[1]?.trim())
    .filter(Boolean)
    .at(-1);
  assert(volumePath, `Unable to resolve mounted volume from hdiutil output: ${result.stdout}`);
  return volumePath;
}

async function detachDmg(volumePath) {
  await runCommand("hdiutil", ["detach", volumePath, "-force"], { stdio: "ignore" }).catch(() => undefined);
}

async function copyDmgApp(dmgPath) {
  fs.mkdirSync(copiedAppDir, { recursive: true });
  const volumePath = await attachDmg(dmgPath);
  let copiedAppPath = null;
  try {
    const sourceApps = listAppBundles(volumePath);
    assert(sourceApps.length === 1, `Expected one app in mounted DMG, found ${sourceApps.length}.`);
    copiedAppPath = path.join(copiedAppDir, path.basename(sourceApps[0]));
    await runCommand("ditto", [sourceApps[0], copiedAppPath], { stdio: "ignore" });
  } finally {
    await detachDmg(volumePath);
  }
  assert(copiedAppPath, "DMG app copy did not produce an application bundle.");
  return copiedAppPath;
}

function resolveAppExecutable(appBundlePath) {
  const macOsDir = path.join(appBundlePath, "Contents", "MacOS");
  const entries = fs.readdirSync(macOsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(macOsDir, entry.name));
  assert(entries.length === 1, `Expected one macOS app executable, found ${entries.length}.`);
  return entries[0];
}

function readLog(logPath) {
  try {
    return fs.readFileSync(logPath, "utf8");
  } catch {
    return "";
  }
}

async function waitForLog(logPath, predicate, child, startOffset = 0, getSpawnError = () => null) {
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const spawnError = getSpawnError();
    if (spawnError) {
      throw new Error(`Unable to launch the packaged app: ${spawnError.message}`);
    }
    const contents = readLog(logPath);
    const freshContents = contents.slice(startOffset);
    if (predicate(freshContents)) {
      return freshContents;
    }
    if (child.exitCode !== null) {
      throw new Error(`Desktop app exited before becoming ready (code=${child.exitCode}).\n${contents.slice(-4_000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for desktop readiness.\n${readLog(logPath).slice(-4_000)}`);
}

function resolvePort(logContents) {
  const match = logContents.match(/Desktop server is healthy at http:\/\/127\.0\.0\.1:(\d+)\/api\/health/);
  assert(match, "Desktop log did not contain a healthy server port.");
  return Number(match[1]);
}

async function fetchJson(baseUrl, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  assert(response.ok, `${options.method ?? "GET"} ${endpoint} returned HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  return payload;
}

async function stopApp(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function launchAndProbe(appBundlePath, label, createWorld) {
  const executablePath = resolveAppExecutable(appBundlePath);
  const logPath = path.join(dataDir, "logs", "desktop-main.log");
  const initialLogOffset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const child = spawn(executablePath, [], {
    cwd: testRoot,
    env: {
      ...process.env,
      AI_NOVEL_APP_DATA_DIR: dataDir,
      AI_NOVEL_UPDATE_CHANNEL: "beta",
    },
    stdio: "ignore",
  });
  let spawnError = null;
  child.once("error", (error) => {
    spawnError = error;
  });
  try {
    const logContents = await waitForLog(
      logPath,
      (contents) => contents.includes("main-window-shown") && contents.includes("Desktop server is healthy"),
      child,
      initialLogOffset,
      () => spawnError,
    );
    const port = resolvePort(logContents);
    const baseUrl = `http://127.0.0.1:${port}/api`;
    const health = await fetchJson(baseUrl, "/health");
    assert(health?.success !== false, `${label} health response was not successful.`);
    const worldsBefore = await fetchJson(baseUrl, "/worlds");
    assert(Array.isArray(worldsBefore?.data), `${label} world list response was malformed.`);

    if (createWorld) {
      const created = await fetchJson(baseUrl, "/worlds", {
        method: "POST",
        body: JSON.stringify({
          name: worldName,
          description: "Temporary macOS package runtime smoke test world.",
          worldType: "science-fiction",
        }),
      });
      assert(created?.data?.name === worldName, `${label} did not return the created world.`);
    } else {
      assert(worldsBefore.data.some((world) => world?.name === worldName), `${label} did not recover the world after restart.`);
    }
    console.log(`[verify:desktop:runtime:mac] ${label} passed on port ${port}.`);
  } finally {
    await stopApp(child);
  }
}

async function main() {
  assert(process.platform === "darwin", `This verifier must run on macOS, received ${process.platform}.`);
  assert(process.arch === "arm64", `This verifier currently supports Apple Silicon arm64, received ${process.arch}.`);
  const packagedApp = findPackagedApp();
  const dmgPath = findDmg();
  const appBundlePath = await copyDmgApp(dmgPath);
  await launchAndProbe(appBundlePath, "first launch", true);
  await launchAndProbe(appBundlePath, "restart launch", false);
  console.log(`[verify:desktop:runtime:mac] DMG install and isolated persistence verification passed.`);
  console.log(`[verify:desktop:runtime:mac] package=${packagedApp}`);
  console.log(`[verify:desktop:runtime:mac] test data retained at ${testRoot}`);
}

main().catch((error) => {
  console.error("[verify:desktop:runtime:mac] failed.", error);
  console.error(`[verify:desktop:runtime:mac] test data retained at ${testRoot}`);
  process.exit(1);
});
