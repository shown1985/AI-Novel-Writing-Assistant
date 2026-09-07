const fs = require("node:fs");
const path = require("node:path");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

const releaseChannel = firstNonEmpty(process.env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
const isBetaRelease = releaseChannel === "beta";
const githubOwner = firstNonEmpty(process.env.AI_NOVEL_GITHUB_OWNER, "ExplosiveCoderflome");
const githubRepo = firstNonEmpty(process.env.AI_NOVEL_GITHUB_REPO, "AI-Novel-Writing-Assistant");
const windowsSigningLink = firstNonEmpty(
  process.env.CSC_LINK,
  process.env.WIN_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_FILE,
);
const allowUnsignedRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
  ).toLowerCase() === "true";
const hasWindowsSigningMaterial = Boolean(windowsSigningLink);
const isMacOnlyBuild = process.argv.includes("--mac") && !process.argv.includes("--win");
const isLocalDesktopBuild = firstNonEmpty(process.env.AI_NOVEL_LOCAL_DESKTOP_BUILD).toLowerCase() === "true";
const windowsIconPath = path.join("builder", "app-icon.ico");
const macIconPath = path.join("builder", "app-icon.png");

function copyMacElectronNativeBinding(context) {
  const appBundleDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const sourcePath = path.join(
    __dirname,
    "build",
    "app",
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  const targetPath = path.join(
    appBundleDir,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Electron arm64 better-sqlite3 binding was not staged at ${sourcePath}.`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Packaged better-sqlite3 binding was not unpacked at ${targetPath}.`);
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`[dist:desktop] copied Electron ABI better-sqlite3 binding into ${appBundleDir}`);
}

if (!isMacOnlyBuild && !isBetaRelease && !hasWindowsSigningMaterial && !allowUnsignedRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

module.exports = {
  appId: "com.ai-novel.desktop",
  productName: "AI Novel Writing Assistant v2",
  directories: {
    app: "build/app",
    output: "build/dist",
    buildResources: "builder",
  },
  files: [
    "dist/**/*",
    "package.json",
    "node_modules/.prisma/**/*",
  ],
  extraResources: [
    {
      from: "builder/app-icon.ico",
      to: "icons/app-icon.ico",
    },
    {
      from: "builder/app-icon.png",
      to: "icons/app-icon.png",
    },
    {
      from: "build/resources/app-update.yml",
      to: "app-update.yml",
    },
    {
      from: "build/resources/client",
      to: "client",
      filter: ["**/*"],
    },
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
  ],
  // Mac staging is rebuilt explicitly for the Electron ABI by the desktop wrapper.
  // Keep electron-builder's automatic rebuild for Windows, where the existing
  // NSIS/portable chain owns native dependency preparation.
  npmRebuild: !isMacOnlyBuild,
  nativeRebuilder: "sequential",
  afterPack: async (context) => {
    if (isMacOnlyBuild) {
      copyMacElectronNativeBinding(context);
    }
  },
  extraMetadata: {
    main: "dist/main.js",
    aiNovelLocalBuild: isLocalDesktopBuild,
  },
  publish: [
    {
      provider: "github",
      owner: githubOwner,
      repo: githubRepo,
      releaseType: isBetaRelease ? "prerelease" : "release",
    },
  ],
  electronUpdaterCompatibility: ">=2.16",
  generateUpdatesFilesForAllChannels: false,
  win: {
    icon: windowsIconPath,
    // Keep EXE resource editing enabled for unsigned builds so Windows uses the app icon and metadata.
    signAndEditExecutable: true,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    artifactName: "${productName}-${version}-setup-${arch}.${ext}",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerIcon: windowsIconPath,
    uninstallerIcon: windowsIconPath,
    installerHeaderIcon: windowsIconPath,
  },
  portable: {
    artifactName: "${productName}-${version}-portable-${arch}.${ext}",
  },
  mac: {
    icon: macIconPath,
    category: "public.app-category.productivity",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
      {
        target: "zip",
        arch: ["arm64"],
      },
    ],
  },
  dmg: {
    artifactName: "${productName}-${version}-${arch}.${ext}",
    title: "${productName} ${version}",
  },
};
