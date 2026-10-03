const assert = require("node:assert/strict");
const test = require("node:test");
const { prepareBuilderArgs, isPublishRequested } = require("./local-build-publish-policy.cjs");

test("local candidate builds always disable electron-builder publishing", () => {
  const original = ["--win", "nsis", "--x64"];
  const args = prepareBuilderArgs(original, true);
  assert.deepEqual(args, [...original, "--publish", "never"]);
  assert.deepEqual(original, ["--win", "nsis", "--x64"]);
  assert.equal(isPublishRequested(args), false);
});

test("explicit never stays nonpublishing without duplicate flags", () => {
  const args = prepareBuilderArgs(["--win", "nsis", "--publish", "never"], true);
  assert.deepEqual(args, ["--win", "nsis", "--publish", "never"]);
  assert.equal(isPublishRequested(args), false);
});

test("local candidate builds reject publishing overrides", () => {
  for (const args of [
    ["--publish", "always"],
    ["--publish", "onTag"],
    ["--publish"],
    ["--publish=always"],
    ["-p", "always"],
    ["-p=always"],
    ["--publish", "never", "--publish", "always"],
    ["-p", "never", "--publish", "never"],
  ]) {
    assert.throws(() => prepareBuilderArgs(args, true), /cannot publish/);
  }
});

test("local build accepts a single explicit never in each supported form", () => {
  for (const args of [
    ["--publish=never"],
    ["-p", "never"],
    ["-p=never"],
  ]) {
    assert.deepEqual(prepareBuilderArgs(args, true), args);
    assert.equal(isPublishRequested(args), false);
  }
});

test("release build arguments retain their publishing behavior", () => {
  const args = ["--win", "nsis", "--publish", "always"];
  assert.deepEqual(prepareBuilderArgs(args, false), args);
  assert.equal(isPublishRequested(args), true);
});
