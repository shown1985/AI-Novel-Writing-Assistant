const test = require("node:test");
const assert = require("node:assert/strict");

const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");

// A registry key that lags behind the asset's version makes lookups by the current version miss the
// asset. Bumping PromptAsset.version must update the matching loader key in the same change.
test("prompt loader keys match the id and version of the asset they load", () => {
  const mismatches = [];
  const seen = new Set();
  for (const entry of promptAssetLoaderEntries) {
    const asset = entry.load();
    assert.ok(asset, `loader ${entry.key} returned no prompt asset`);
    const actualKey = `${asset.id}@${asset.version}`;
    if (entry.key !== actualKey) {
      mismatches.push(`${entry.key} -> ${actualKey}`);
    }
    assert.equal(seen.has(entry.key), false, `duplicate prompt loader key ${entry.key}`);
    seen.add(entry.key);
  }
  assert.deepEqual(mismatches, []);
});
