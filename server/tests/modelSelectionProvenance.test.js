const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const {
  getModelSelectionProvenance,
  resolveLLMClientOptions,
  setProviderSecretCache,
} = require("../dist/llm/factory.js");
const { resolveModel } = require("../dist/llm/modelRouter.js");
const {
  createUnknownModelSelectionProvenance,
} = require("../dist/platform/llm/provenance/index.js");

function routeRow(overrides = {}) {
  return {
    taskType: "planner",
    provider: "deepseek",
    model: "deepseek-route-model",
    temperature: 0.3,
    maxTokens: 32768,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
    ...overrides,
  };
}

test("model route provenance keeps requested values and deterministic adjustments", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => routeRow();
  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "deepseek");
    assert.equal(resolved.maxTokens, 8192);
    assert.deepEqual(resolved.selectionProvenance.maxTokens, {
      requested: 32768,
      effective: 8192,
      source: "task_route",
      adjustments: [{
        kind: "provider_limit",
        before: 32768,
        after: 8192,
        reason: "请求的 Token 上限超过厂商支持范围。",
      }],
    });
    assert.equal(resolved.selectionProvenance.provider.source, "task_route");
    assert.equal(resolved.selectionProvenance.model.source, "task_route");
    assert.equal(resolved.selectionProvenance.temperature.source, "task_route");

    prisma.modelRouteConfig.findUnique = async () => routeRow({ maxTokens: 4096 });
    const legacy = await resolveModel("planner");
    assert.equal(legacy.maxTokens, undefined);
    assert.deepEqual(legacy.selectionProvenance.maxTokens.adjustments.map((item) => item.kind), [
      "legacy_4096_unset",
    ]);
    assert.equal(legacy.selectionProvenance.maxTokens.requested, 4096);
    assert.equal(legacy.selectionProvenance.maxTokens.effective, null);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("strict route fallback explains missing configuration and lookup failure without changing defaults", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  try {
    prisma.modelRouteConfig.findUnique = async () => null;
    const missing = await resolveModel("critical_review");
    assert.equal(missing.routeDegraded, true);
    assert.equal(missing.routeDegradedReason, "strict_route_not_configured");
    assert.equal(missing.selectionProvenance.provider.source, "task_route_default");
    assert.equal(missing.selectionProvenance.routeDegradedReason, "strict_route_not_configured");

    prisma.modelRouteConfig.findUnique = async () => {
      throw new Error("route store unavailable");
    };
    const unavailable = await resolveModel("critical_review");
    assert.equal(unavailable.provider, missing.provider);
    assert.equal(unavailable.model, missing.model);
    assert.equal(unavailable.temperature, missing.temperature);
    assert.equal(unavailable.routeDegraded, true);
    assert.equal(unavailable.routeDegradedReason, "route_lookup_failed");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("non-strict route lookup failure keeps the existing degraded flag and records the cause", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => {
    throw new Error("route store unavailable");
  };
  try {
    const unavailable = await resolveModel("planner");
    assert.equal(unavailable.routeDegraded, false);
    assert.equal(unavailable.routeDegradedReason, "route_lookup_failed");
    assert.equal(unavailable.selectionProvenance.routeDegraded, false);
    assert.equal(unavailable.selectionProvenance.routeDegradedReason, "route_lookup_failed");
    assert.equal(unavailable.selectionProvenance.provider.source, "task_route_default");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("factory records mixed field sources and returns a detached sanitized projection", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  const originalUpsert = prisma.modelRouteConfig.upsert;
  const originalFetch = global.fetch;
  let writeCount = 0;
  let transportCount = 0;
  prisma.modelRouteConfig.findUnique = async () => routeRow();
  prisma.modelRouteConfig.upsert = async () => {
    writeCount += 1;
    return {};
  };
  global.fetch = async () => {
    transportCount += 1;
    throw new Error("model transport must not run while resolving options");
  };
  setProviderSecretCache("openai", {
    key: "sk-do-not-project",
    model: "gpt-configured",
    baseURL: "https://private-endpoint.invalid/v1?token=secret",
    authMode: "bearer",
  });
  try {
    const resolved = await resolveLLMClientOptions("openai", {
      taskType: "planner",
      modelKwargs: { private_transport_flag: true },
      sessionId: "private-session",
    });
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.model, "gpt-configured");
    assert.equal(resolved.temperature, 0.3);
    assert.equal(resolved.maxTokens, 8192);

    const provenance = getModelSelectionProvenance(resolved);
    assert.equal(provenance.provider.source, "explicit_request");
    assert.equal(provenance.model.source, "provider_configuration");
    assert.equal(provenance.temperature.source, "task_route");
    assert.equal(provenance.maxTokens.source, "task_route");
    assert.deepEqual(provenance.maxTokens.adjustments.map((item) => item.kind), ["provider_limit"]);
    assert.equal(writeCount, 0);
    assert.equal(transportCount, 0);

    const serialized = JSON.stringify(provenance);
    for (const forbidden of [
      "sk-do-not-project",
      "private-endpoint",
      "token=secret",
      "bearer",
      "private_transport_flag",
      "private-session",
      "apiKey",
      "baseURL",
      "authMode",
      "modelKwargs",
      "openCodeSessionId",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `projection must omit ${forbidden}`);
    }

    provenance.maxTokens.adjustments[0].reason = "mutated";
    assert.notEqual(
      resolved.selectionProvenance.maxTokens.adjustments[0].reason,
      provenance.maxTokens.adjustments[0].reason,
    );
  } finally {
    setProviderSecretCache("openai", null);
    global.fetch = originalFetch;
    prisma.modelRouteConfig.findUnique = originalFindUnique;
    prisma.modelRouteConfig.upsert = originalUpsert;
  }
});

test("factory uses configured task-route sources when no invocation override is present", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => routeRow({ maxTokens: 7000 });
  setProviderSecretCache("deepseek", { key: "test-key" });
  try {
    const resolved = await resolveLLMClientOptions(undefined, { taskType: "planner" });
    assert.equal(resolved.provider, "deepseek");
    assert.equal(resolved.model, "deepseek-route-model");
    assert.equal(resolved.temperature, 0.3);
    assert.equal(resolved.maxTokens, 7000);
    for (const field of ["provider", "model", "temperature", "maxTokens"]) {
      assert.equal(resolved.selectionProvenance[field].source, "task_route");
    }
  } finally {
    setProviderSecretCache("deepseek", null);
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("factory reports provider configuration, environment, built-in and fallback sources", async () => {
  const previousOpenAiModel = process.env.OPENAI_MODEL;
  setProviderSecretCache("openai", { key: "test-key", model: "configured-model" });
  try {
    const configured = await resolveLLMClientOptions("openai");
    assert.equal(configured.selectionProvenance.provider.source, "explicit_request");
    assert.equal(configured.selectionProvenance.model.source, "provider_configuration");

    setProviderSecretCache("openai", { key: "test-key" });
    process.env.OPENAI_MODEL = "environment-model";
    const environment = await resolveLLMClientOptions("openai");
    assert.equal(environment.model, "environment-model");
    assert.equal(environment.selectionProvenance.model.source, "environment");

    delete process.env.OPENAI_MODEL;
    const builtIn = await resolveLLMClientOptions("openai");
    assert.equal(builtIn.selectionProvenance.model.source, "built_in_default");

    const fallback = await resolveLLMClientOptions(undefined, { fallbackProvider: "openai" });
    assert.equal(fallback.provider, "openai");
    assert.equal(fallback.selectionProvenance.provider.source, "fallback_default");
  } finally {
    if (previousOpenAiModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousOpenAiModel;
    setProviderSecretCache("openai", null);
  }
});

test("capability and structured-output adjustments preserve requested and effective values", async () => {
  setProviderSecretCache("kimi", { key: "test-key" });
  setProviderSecretCache("minimax", { key: "test-key" });
  setProviderSecretCache("qwen", { key: "test-key" });
  setProviderSecretCache("custom_modelscope", {
    key: "test-key",
    model: "Qwen/Qwen3.5-397B-A17B",
    baseURL: "https://api-inference.modelscope.cn/v1",
  });
  try {
    const fixed = await resolveLLMClientOptions("kimi", {
      model: "kimi-k3",
      temperature: 0.5,
    });
    assert.equal(fixed.temperature, 1);
    assert.equal(fixed.selectionProvenance.temperature.requested, 0.5);
    assert.equal(fixed.selectionProvenance.temperature.effective, 1);
    assert.deepEqual(fixed.selectionProvenance.temperature.adjustments.map((item) => item.kind), [
      "capability_fixed",
    ]);

    const clamped = await resolveLLMClientOptions("minimax", {
      model: "MiniMax-M2.7",
      temperature: 0,
    });
    assert.equal(clamped.temperature, 0.01);
    assert.deepEqual(clamped.selectionProvenance.temperature.adjustments.map((item) => item.kind), [
      "capability_clamped_min",
    ]);

    const clampedMaximum = await resolveLLMClientOptions("minimax", {
      model: "MiniMax-M2.7",
      temperature: 1.5,
    });
    assert.equal(clampedMaximum.temperature, 1);
    assert.deepEqual(clampedMaximum.selectionProvenance.temperature.adjustments.map((item) => item.kind), [
      "capability_clamped_max",
    ]);

    const omitted = await resolveLLMClientOptions("qwen", {
      model: "qwen3.5-397b-a17b",
      maxTokens: 20000,
      executionMode: "structured",
      structuredStrategy: "json_object",
    });
    assert.equal(omitted.maxTokens, undefined);
    assert.equal(omitted.selectionProvenance.maxTokens.requested, 20000);
    assert.equal(omitted.selectionProvenance.maxTokens.effective, null);
    assert.deepEqual(omitted.selectionProvenance.maxTokens.adjustments.map((item) => item.kind), [
      "structured_omit",
    ]);

    const capped = await resolveLLMClientOptions("custom_modelscope", {
      maxTokens: 20000,
      executionMode: "structured",
      structuredStrategy: "prompt_json",
    });
    assert.equal(capped.maxTokens, 8192);
    assert.deepEqual(capped.selectionProvenance.maxTokens.adjustments.map((item) => item.kind), [
      "structured_cap",
    ]);
  } finally {
    setProviderSecretCache("kimi", null);
    setProviderSecretCache("minimax", null);
    setProviderSecretCache("qwen", null);
    setProviderSecretCache("custom_modelscope", null);
  }
});

test("legacy records can be projected as unknown without fabricating sources", () => {
  const unknown = createUnknownModelSelectionProvenance({
    provider: "deepseek",
    model: "legacy-model",
    routeKey: "writer",
  });
  assert.equal(unknown.provider.requested, null);
  assert.equal(unknown.provider.effective, "deepseek");
  assert.equal(unknown.provider.source, "unknown");
  assert.equal(unknown.model.source, "unknown");
  assert.equal(unknown.temperature.source, "unknown");
  assert.equal(unknown.maxTokens.source, "unknown");
  assert.equal(unknown.routeKey, "writer");
});
