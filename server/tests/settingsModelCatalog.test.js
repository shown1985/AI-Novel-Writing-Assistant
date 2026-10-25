const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

// Run route mocks in a child so shared-process test runners keep their module cache intact.
if (process.env.SETTINGS_MODEL_CATALOG_CHILD !== "1") {
  test("settings model catalog HTTP regressions (isolated database guard)", () => {
    const { spawnSync } = require("node:child_process");
    const env = { ...process.env, SETTINGS_MODEL_CATALOG_CHILD: "1" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", __filename], {
      env, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests 2/);
  });
} else {
  // Install a database guard before loading the route and its service dependencies.
  const dbPath = require.resolve("../dist/db/prisma.js");
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    prisma: new Proxy({}, { get: () => { throw new Error("Unexpected database access"); } }),
  } };
  const { secretStore } = require("../dist/services/settings/secretStore/index.js");
  const imageSettings = require("../dist/services/settings/ProviderImageSettingsService.js");
  const router = require("../dist/routes/settings.js").default;

  for (const provider of ["openai", "custom_catalog"]) {
    test(`${provider}: refresh, hide, restore and failed refresh retain the known model catalog`, async () => {
      const originals = {
        list: secretStore.listProviders, get: secretStore.getProvider,
        upsert: secretStore.upsertProvider, update: secretStore.updateProvider,
        images: imageSettings.getProviderImageModelMap, fetch: global.fetch,
      };
      let record = {
        provider, displayName: "Catalog", key: "test-secret", model: "selected",
        baseURL: `https://${provider}.catalog.example/v1`, authMode: "bearer",
        isActive: true, hiddenModels: "[]",
      };
      let calls = 0;
      let failRefresh = false;
      let writes = 0;
      secretStore.listProviders = async () => [record];
      secretStore.getProvider = async () => record;
      const save = async (_provider, data) => { writes += 1; record = { ...record, ...data }; return record; };
      secretStore.upsertProvider = save;
      secretStore.updateProvider = save;
      imageSettings.getProviderImageModelMap = async () => new Map();
      global.fetch = async () => {
        calls += 1;
        if (failRefresh) throw new Error("catalog unavailable");
        return new Response(JSON.stringify({ data: ["selected", "model-a", "model-b", "model-c"].map(id => ({ id })) }));
      };
      const app = express();
      app.use(express.json());
      app.use("/api/settings", router);
      app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
      const server = http.createServer(app);
      try {
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const url = `http://127.0.0.1:${server.address().port}/api/settings/api-keys`;
        const request = async (path = "", method = "GET", body) => {
          const response = await originals.fetch(url + path, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
          return { status: response.status, ...(await response.json()) };
        };
        const getModels = async () => {
          const before = calls;
          const response = await request();
          assert.equal(response.status, 200);
          assert.equal(calls, before, "GET must not fetch remote catalogs");
          return response.data.find(item => item.provider === provider).models;
        };
        assert.equal((await request(`/${provider}/refresh-models`, "POST")).status, 200);
        assert.deepEqual(await getModels(), ["selected", "model-a", "model-b", "model-c"]);
        assert.equal((await request(`/${provider}`, "PUT", { hiddenModels: ["model-a"] })).status, 200);
        assert.deepEqual(await getModels(), ["selected", "model-b", "model-c"]);
        assert.equal((await request(`/${provider}`, "PUT", { hiddenModels: ["model-a", "model-b"] })).status, 200);
        assert.deepEqual(await getModels(), ["selected", "model-c"]);
        await request(`/${provider}`, "PUT", { hiddenModels: ["model-b"] });
        assert.deepEqual(await getModels(), ["selected", "model-a", "model-c"]);
        await request(`/${provider}`, "PUT", { hiddenModels: [] });
        assert.deepEqual(await getModels(), ["selected", "model-a", "model-b", "model-c"]);
        failRefresh = true;
        const saved = await request(`/${provider}`, "PUT", { hiddenModels: ["model-a"] });
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.data.models, ["selected", "model-b", "model-c"]);
        assert.deepEqual(await getModels(), saved.data.models);
        const beforeWrites = writes;
        const rejected = await request(`/${provider}`, "PUT", { hiddenModels: ["selected"] });
        assert.equal(rejected.status, 400);
        assert.match(rejected.message, /不能隐藏/);
        assert.equal(writes, beforeWrites);
      } finally {
        secretStore.listProviders = originals.list;
        secretStore.getProvider = originals.get;
        secretStore.upsertProvider = originals.upsert;
        secretStore.updateProvider = originals.update;
        imageSettings.getProviderImageModelMap = originals.images;
        global.fetch = originals.fetch;
        await new Promise(resolve => server.close(resolve));
      }
    });
  }

}
