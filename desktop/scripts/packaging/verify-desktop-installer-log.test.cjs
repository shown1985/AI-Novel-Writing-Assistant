const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { captureLogOffset, readLogSince } = require("../verify-desktop-installer.cjs");

test("relaunch checks only newly appended UTF-8 log messages", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-installer-log-"));
  try {
    const logPath = path.join(directory, "desktop-main.log");
    fs.writeFileSync(logPath, "首次启动：main-window-shown\nDesktop server is healthy\n");
    const offset = captureLogOffset(logPath);

    assert.equal(readLogSince(logPath, offset), "");
    fs.appendFileSync(logPath, "重装后：main-window-shown\n");
    assert.equal(readLogSince(logPath, offset).includes("Desktop server is healthy"), false);
    fs.appendFileSync(logPath, "Desktop server is healthy\n");
    assert.equal(readLogSince(logPath, offset), "重装后：main-window-shown\nDesktop server is healthy\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a replaced log is read from its new beginning", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-installer-log-"));
  try {
    const logPath = path.join(directory, "desktop-main.log");
    fs.writeFileSync(logPath, "old log content longer than the next log\n");
    const offset = captureLogOffset(logPath);
    fs.writeFileSync(logPath, "new start\n");
    assert.equal(readLogSince(logPath, offset), "new start\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
