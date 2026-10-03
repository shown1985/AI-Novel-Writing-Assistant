const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectVisualAssetSources,
} = require("../dist/modules/visualAssets/adapters/visualAssetSources.js");

test("visual asset catalog keeps healthy source domains when one domain fails", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    const imageAsset = { sourceDomain: "image_asset", sourceId: "image-1" };
    const dramaAsset = { sourceDomain: "drama", sourceId: "drama-1" };
    const result = await collectVisualAssetSources([
      { sourceDomain: "image_asset", read: async () => [imageAsset] },
      { sourceDomain: "comic", read: async () => { throw Object.assign(new Error("missing column"), { code: "P2022" }); } },
      { sourceDomain: "drama", read: async () => [dramaAsset] },
    ]);

    assert.deepEqual(result, [imageAsset, dramaAsset]);
    assert.deepEqual(warnings, ["[visual-assets] skipped source domain comic: P2022"]);
  } finally {
    console.warn = originalWarn;
  }
});
