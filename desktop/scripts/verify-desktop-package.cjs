const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);
const asar = electronBuilderRequire("@electron/asar");
const buildDir = path.join(desktopDir, "build");
const distDir = path.join(buildDir, "dist");
const appDir = path.join(buildDir, "app");
const appPackageJsonPath = path.join(appDir, "package.json");
const desktopPackageJsonPath = path.join(desktopDir, "package.json");
const stagedAppUpdateConfig = path.join(buildDir, "resources", "app-update.yml");
const stagedClientIndex = path.join(buildDir, "resources", "client", "dist", "index.html");
const stagedRuntimeFile = path.join(appDir, "dist", "runtime", "server.js");

function parseArgs(args) {
  const readValue = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };

  return {
    platform: readValue("--platform", process.platform === "darwin" ? "darwin" : "win32"),
    arch: readValue("--arch", process.arch),
    requireArtifacts: args.includes("--require-artifacts"),
  };
}

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function assertNotExists(targetPath, description) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Unexpected ${description}: ${targetPath}`);
  }
}

function assertResolvesWithinDirectory(targetPath, expectedParentDir, description) {
  const resolvedPath = fs.realpathSync(targetPath);
  const normalizedParentDir = fs.realpathSync(expectedParentDir);
  const relativePath = path.relative(normalizedParentDir, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`${description} must resolve inside ${normalizedParentDir}, but resolved to ${resolvedPath}.`);
  }
}

function assertSomeMatch(entries, pattern, description) {
  if (!entries.some((entry) => pattern.test(entry))) {
    throw new Error(`Packaged app archive is missing ${description}.`);
  }
}

function listFilesRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function findMacAppBundle(arch) {
  const candidateRoots = [path.join(distDir, `mac-${arch}`), path.join(distDir, "mac")];
  for (const candidateRoot of candidateRoots) {
    if (!fs.existsSync(candidateRoot)) {
      continue;
    }
    const appBundles = fs.readdirSync(candidateRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
      .map((entry) => path.join(candidateRoot, entry.name));
    if (appBundles.length === 1) {
      return appBundles[0];
    }
    if (appBundles.length > 1) {
      throw new Error(`Expected one macOS app bundle in ${candidateRoot}, found ${appBundles.length}.`);
    }
  }
  throw new Error(`Missing macOS ${arch} app bundle under ${distDir}.`);
}

function resolvePackagedLayout(platform, arch) {
  if (platform === "darwin") {
    const appBundle = findMacAppBundle(arch);
    const resourcesDir = path.join(appBundle, "Contents", "Resources");
    return {
      packagedRoot: appBundle,
      resourcesDir,
      executableDir: path.join(appBundle, "Contents", "MacOS"),
      windowIcon: path.join(resourcesDir, "icons", "app-icon.png"),
    };
  }

  if (platform === "win32") {
    const unpackedDir = path.join(distDir, "win-unpacked");
    const resourcesDir = path.join(unpackedDir, "resources");
    return {
      packagedRoot: unpackedDir,
      resourcesDir,
      executableDir: unpackedDir,
      windowIcon: path.join(resourcesDir, "icons", "app-icon.ico"),
    };
  }

  throw new Error(`Unsupported desktop package verification platform: ${platform}`);
}

function inspectMachOArm64(targetPath, description) {
  const output = execFileSync("file", ["-b", targetPath], { encoding: "utf8" }).trim();
  if (!output.includes("Mach-O") || !output.includes("arm64") || output.includes("x86_64")) {
    throw new Error(`${description} must be a Mach-O arm64 binary, got: ${output} (${targetPath})`);
  }
}

function verifyMacNativeFiles(layout, packagedEntries, arch) {
  if (arch !== "arm64") {
    throw new Error(`The macOS package contract currently supports arm64 only, received ${arch}.`);
  }

  const executables = listFilesRecursively(layout.executableDir);
  if (executables.length === 0) {
    throw new Error(`Missing macOS application executable under ${layout.executableDir}.`);
  }
  for (const executable of executables) {
    inspectMachOArm64(executable, "macOS application executable");
  }

  const unpackedNativeRoot = path.join(layout.resourcesDir, "app.asar.unpacked");
  const nativeModules = listFilesRecursively(unpackedNativeRoot).filter((entry) => entry.endsWith(".node"));
  if (nativeModules.length === 0) {
    throw new Error(`Missing unpacked native Node modules under ${unpackedNativeRoot}.`);
  }
  for (const nativeModule of nativeModules) {
    inspectMachOArm64(nativeModule, "native Node module");
  }

  const normalizedNativePaths = nativeModules.map((entry) => entry.replace(/\\/g, "/"));
  if (!normalizedNativePaths.some((entry) => entry.includes("better_sqlite3.node"))) {
    throw new Error("Packaged macOS app is missing the better-sqlite3 native module.");
  }
  if (!normalizedNativePaths.some((entry) => /sharp[^/]*\.node$/.test(entry))) {
    throw new Error("Packaged macOS app is missing the sharp native module.");
  }

  const forbiddenPlatformPackage = packagedEntries.find((entry) =>
    /node_modules\/(?:@img\/)?[^/]*(?:linux|win32)[^/]*/i.test(entry),
  );
  if (forbiddenPlatformPackage) {
    throw new Error(`Packaged macOS app contains a foreign-platform native package: ${forbiddenPlatformPackage}`);
  }

  const bundleIcons = listFilesRecursively(layout.resourcesDir).filter((entry) => entry.endsWith(".icns"));
  if (bundleIcons.length === 0) {
    throw new Error(`Packaged macOS app is missing its generated ICNS icon under ${layout.resourcesDir}.`);
  }
}

function verifyMacArtifacts(arch) {
  const desktopPackage = JSON.parse(fs.readFileSync(desktopPackageJsonPath, "utf8"));
  for (const extension of ["dmg", "zip"]) {
    const artifacts = fs.readdirSync(distDir)
      .filter((entry) => entry.endsWith(`-${desktopPackage.version}-${arch}.${extension}`));
    if (artifacts.length !== 1) {
      throw new Error(
        `Expected one macOS ${arch} ${extension.toUpperCase()} artifact for version ${desktopPackage.version}, found ${artifacts.length}.`,
      );
    }
  }
  assertExists(path.join(distDir, "latest-mac.yml"), "macOS updater metadata");
}

function verifyHostNodeNativeBinding() {
  if (process.platform !== "darwin") {
    return;
  }
  const serverDir = path.join(repoRoot, "server");
  const betterSqlite3Path = require.resolve("better-sqlite3", { paths: [serverDir] });
  const Database = require(betterSqlite3Path);
  const database = new Database(":memory:");
  try {
    const result = database.prepare("select 1 as value").get();
    if (result?.value !== 1) {
      throw new Error("host better-sqlite3 binding returned an unexpected probe result");
    }
  } finally {
    database.close();
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const layout = resolvePackagedLayout(options.platform, options.arch);
  const appArchive = path.join(layout.resourcesDir, "app.asar");
  const packagedClientIndex = path.join(layout.resourcesDir, "client", "dist", "index.html");

  assertExists(appPackageJsonPath, "staged desktop package.json");
  assertExists(
    path.join(desktopDir, "builder", options.platform === "darwin" ? "app-icon.png" : "app-icon.ico"),
    "builder desktop icon source",
  );
  assertExists(stagedAppUpdateConfig, "staged updater feed configuration");
  assertExists(stagedClientIndex, "staged renderer index");
  assertExists(packagedClientIndex, "packaged renderer index");
  assertExists(appArchive, "packaged app archive");
  assertExists(layout.windowIcon, "packaged desktop window icon");
  assertExists(stagedRuntimeFile, "desktop runtime server bundle");
  assertNotExists(path.join(appDir, "src"), "desktop source directory inside staged app");
  assertNotExists(path.join(appDir, "node_modules", "electron"), "Electron runtime inside staged app node_modules");
  assertResolvesWithinDirectory(
    path.join(appDir, "node_modules", "@ai-novel", "server"),
    appDir,
    "Staged server package",
  );

  const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, "utf8"));
  if (appPackageJson.dependencies?.electron) {
    throw new Error("Electron must not be bundled as an application dependency in the staged app.");
  }

  const runtimeSource = fs.readFileSync(stagedRuntimeFile, "utf8");
  if (runtimeSource.includes("pnpm --filter @ai-novel/server start")) {
    throw new Error("Packaged desktop runtime still references pnpm-based server startup.");
  }
  const stagedClientIndexSource = fs.readFileSync(stagedClientIndex, "utf8");
  if (stagedClientIndexSource.includes('src="/assets/') || stagedClientIndexSource.includes('href="/assets/')) {
    throw new Error("Packaged desktop renderer still references absolute /assets paths.");
  }
  const updaterConfigSource = fs.readFileSync(stagedAppUpdateConfig, "utf8");
  if (!updaterConfigSource.includes("provider: github")) {
    throw new Error("Desktop updater feed configuration is missing the GitHub provider.");
  }

  const packagedEntries = asar.listPackage(appArchive)
    .map((entry) => entry.replace(/^[\\/]+/, "").replace(/\\/g, "/"));
  assertSomeMatch(packagedEntries, /^dist\/runtime\/server\.js$/, "desktop runtime server bundle inside app.asar");
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/dist\/app\.js$/,
    "bundled server entry inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/src\/prisma\/migrations\/[^/]+\/migration\.sql$/,
    "bundled Prisma migration files inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/generated-client\/default\.js$/,
    "embedded generated Prisma client inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/default\.js$/,
    "packaged Prisma client entrypoint inside app.asar",
  );

  if (options.platform === "darwin") {
    verifyMacNativeFiles(layout, packagedEntries, options.arch);
    verifyHostNodeNativeBinding();
    if (options.requireArtifacts) {
      verifyMacArtifacts(options.arch);
    }
  }

  console.log(`[verify:desktop-package] ${options.platform}/${options.arch} package layout looks valid.`);
  console.log(`[verify:desktop-package] packaged app inspected at ${layout.packagedRoot}`);
}

try {
  main();
} catch (error) {
  console.error("[verify:desktop-package] failed.", error);
  process.exit(1);
}
