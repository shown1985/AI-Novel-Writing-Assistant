const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProviderModelHeaders,
  filterHiddenModels,
  parseHiddenModels,
  parseModelList,
  resolveModelsEndpoint,
  serializeHiddenModels,
  serializeModelList,
} = require("../dist/llm/modelCatalog.js");

test("hidden model storage trims and deduplicates model ids", () => {
  const stored = serializeHiddenModels([" model-a ", "model-b", "model-a", ""]);
  assert.equal(stored, '["model-a","model-b"]');
  assert.deepEqual(parseHiddenModels(stored), ["model-a", "model-b"]);
});

test("invalid hidden model storage is treated as empty", () => {
  assert.deepEqual(parseHiddenModels("not-json"), []);
  assert.deepEqual(parseHiddenModels('{"model":"model-a"}'), []);
});

test("provider model catalogs use the same bounded JSON storage format", () => {
  const stored = serializeModelList([" model-a ", "model-b", "model-a", ""]);
  assert.equal(stored, '["model-a","model-b"]');
  assert.deepEqual(parseModelList(stored), ["model-a", "model-b"]);
});

test("hidden models are filtered while the selected model remains available", () => {
  assert.deepEqual(
    filterHiddenModels(["model-a", "model-b", "model-c"], ["model-a", "model-b"], "model-a"),
    ["model-a", "model-c"],
  );
});

test("model catalog does not append a duplicate models path", () => {
  assert.equal(
    resolveModelsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai"),
    "https://generativelanguage.googleapis.com/v1beta/openai/models",
  );
  assert.equal(
    resolveModelsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/models"),
    "https://generativelanguage.googleapis.com/v1beta/openai/models",
  );
  assert.equal(
    resolveModelsEndpoint("http://127.0.0.1:11434/v1/models/"),
    "http://127.0.0.1:11434/v1/models",
  );
});

test("custom model catalog uses the configured authentication header", () => {
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "bearer"), {
    Accept: "application/json",
    Authorization: "Bearer secret",
  });
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "x-api-key"), {
    Accept: "application/json",
    "x-api-key": "secret",
  });
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "none"), {
    Accept: "application/json",
  });
});

test("known catalog isolates endpoints and retains expired snapshots without making them fresh", async () => {
  const { getKnownProviderModels, getProviderModels, refreshProviderModels } = require("../dist/llm/modelCatalog.js");
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let calls = 0;
  let now = originalNow();
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: [{ id: `remote-${calls}` }] }));
  };
  Date.now = () => now;
  try {
    const baseURL = "https://ttl-catalog.example/v1";
    await refreshProviderModels("custom_ttl", undefined, baseURL, "none");
    now += 31 * 60 * 1000;
    assert.deepEqual(getKnownProviderModels("custom_ttl", { baseURL, fallbackModel: "selected" }), ["remote-1", "selected"]);
    assert.deepEqual(getKnownProviderModels("custom_ttl", { baseURL: "https://other.example/v1", fallbackModel: "selected" }), ["selected"]);
    assert.equal(calls, 1);
    assert.deepEqual(await getProviderModels("custom_ttl", { baseURL, allowAnonymous: true }), ["remote-2"]);
    assert.equal(calls, 2);
    assert.deepEqual(getKnownProviderModels("openai", { fallbackModel: "selected" }).includes("selected"), true);
    assert.deepEqual(getKnownProviderModels("custom_ttl", { baseURL, fallbackModels: ["explicit"] }), ["remote-2", "explicit"]);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});
