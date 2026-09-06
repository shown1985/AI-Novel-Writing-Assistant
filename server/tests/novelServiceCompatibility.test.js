const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelService } = require("../dist/services/novel/NovelService.js");

test("NovelService compatibility facade preserves the application service receiver", async () => {
  const service = new NovelService({
    marker: "bound application service",
    async migrateLegacyVolumes() {
      return this.marker;
    },
  });

  assert.equal(await service.migrateLegacyVolumes("novel-1"), "bound application service");
});
