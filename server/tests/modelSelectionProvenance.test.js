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

function resolvedTuple(resolved) {
  return {
    provider: resolved.provider,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens ?? null,
    routeKey: resolved.routeKey ?? resolved.selectionProvenance?.routeKey ?? null,
    routeDegraded: resolved.routeDegraded === true,
  };
}

function provenanceSources(provenance) {
  return {
    provider: provenance.provider.source,
    model: provenance.model.source,
    temperature: provenance.temperature.source,
    maxTokens: provenance.maxTokens.source,
  };
}

test("model route resolution preserves the frozen value and source matrix", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;
  const cases = [
    {
      name: "configured non-strict route",
      taskType: "planner",
      row: routeRow(),
      expected: {
        provider: "deepseek", model: "deepseek-route-model", temperature: 0.3,
        maxTokens: 8192, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "task_route", model: "task_route", temperature: "task_route", maxTokens: "task_route" },
      reason: null,
    },
    {
      name: "missing non-strict route",
      taskType: "planner",
      row: null,
      expected: {
        provider: "deepseek", model: "deepseek-v4-flash", temperature: 0.3,
        maxTokens: null, routeKey: "planner", routeDegraded: false,
      },
      sources: {
        provider: "task_route_default", model: "task_route_default",
        temperature: "task_route_default", maxTokens: "task_route_default",
      },
      reason: null,
    },
    {
      name: "failed non-strict route lookup",
      taskType: "planner",
      error: new Error("route store unavailable"),
      expected: {
        provider: "deepseek", model: "deepseek-v4-flash", temperature: 0.3,
        maxTokens: null, routeKey: "planner", routeDegraded: false,
      },
      sources: {
        provider: "task_route_default", model: "task_route_default",
        temperature: "task_route_default", maxTokens: "task_route_default",
      },
      reason: "route_lookup_failed",
    },
    {
      name: "missing strict route",
      taskType: "critical_review",
      row: null,
      expected: {
        provider: "deepseek", model: "deepseek-v4-flash", temperature: 0.1,
        maxTokens: null, routeKey: "critical_review", routeDegraded: true,
      },
      sources: {
        provider: "task_route_default", model: "task_route_default",
        temperature: "task_route_default", maxTokens: "task_route_default",
      },
      reason: "strict_route_not_configured",
    },
    {
      name: "failed strict route lookup",
      taskType: "critical_review",
      error: new Error("route store unavailable"),
      expected: {
        provider: "deepseek", model: "deepseek-v4-flash", temperature: 0.1,
        maxTokens: null, routeKey: "critical_review", routeDegraded: true,
      },
      sources: {
        provider: "task_route_default", model: "task_route_default",
        temperature: "task_route_default", maxTokens: "task_route_default",
      },
      reason: "route_lookup_failed",
    },
    {
      name: "provider-only override",
      taskType: "planner",
      row: routeRow(),
      override: { provider: "openai" },
      expected: {
        provider: "openai", model: "deepseek-route-model", temperature: 0.3,
        maxTokens: 8192, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "explicit_request", model: "task_route", temperature: "task_route", maxTokens: "task_route" },
      reason: null,
      adjustmentProvider: "deepseek",
    },
    {
      name: "model-only override",
      taskType: "planner",
      row: routeRow(),
      override: { model: "explicit-model" },
      expected: {
        provider: "deepseek", model: "explicit-model", temperature: 0.3,
        maxTokens: 8192, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "task_route", model: "explicit_request", temperature: "task_route", maxTokens: "task_route" },
      reason: null,
    },
    {
      name: "temperature-only override",
      taskType: "planner",
      row: routeRow(),
      override: { temperature: 0.55 },
      expected: {
        provider: "deepseek", model: "deepseek-route-model", temperature: 0.55,
        maxTokens: 8192, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "task_route", model: "task_route", temperature: "explicit_request", maxTokens: "task_route" },
      reason: null,
    },
    {
      name: "maxTokens-only override",
      taskType: "planner",
      row: routeRow(),
      override: { maxTokens: 7000 },
      expected: {
        provider: "deepseek", model: "deepseek-route-model", temperature: 0.3,
        maxTokens: 7000, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "task_route", model: "task_route", temperature: "task_route", maxTokens: "explicit_request" },
      reason: null,
    },
    {
      name: "four-field override",
      taskType: "planner",
      row: routeRow(),
      override: { provider: "openai", model: "explicit-model", temperature: 0.55, maxTokens: 20000 },
      expected: {
        provider: "openai", model: "explicit-model", temperature: 0.55,
        maxTokens: 20000, routeKey: "planner", routeDegraded: false,
      },
      sources: {
        provider: "explicit_request", model: "explicit_request",
        temperature: "explicit_request", maxTokens: "explicit_request",
      },
      reason: null,
    },
    {
      name: "legacy maxTokens placeholder",
      taskType: "planner",
      row: routeRow({ maxTokens: 4096 }),
      expected: {
        provider: "deepseek", model: "deepseek-route-model", temperature: 0.3,
        maxTokens: null, routeKey: "planner", routeDegraded: false,
      },
      sources: { provider: "task_route", model: "task_route", temperature: "task_route", maxTokens: "task_route" },
      reason: null,
      adjustmentProvider: "deepseek",
    },
  ];

  try {
    for (const scenario of cases) {
      prisma.modelRouteConfig.findUnique = async () => {
        if (scenario.error) throw scenario.error;
        return scenario.row;
      };
      const resolved = await resolveModel(scenario.taskType, scenario.override);
      assert.deepEqual(resolvedTuple(resolved), scenario.expected, scenario.name);
      assert.deepEqual(provenanceSources(resolved.selectionProvenance), scenario.sources, scenario.name);
      assert.equal(resolved.routeDegradedReason, scenario.reason, scenario.name);
      if (scenario.adjustmentProvider) {
        assert.equal(
          resolved.selectionProvenance.maxTokens.adjustments[0]?.provider,
          scenario.adjustmentProvider,
          scenario.name,
        );
      }
    }
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

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
        provider: "deepseek",
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
    assert.deepEqual(provenance.maxTokens.adjustments.map((item) => item.provider), ["deepseek"]);
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

test("factory without a task preserves the frozen default-selection matrix", async () => {
  const previousOpenAiModel = process.env.OPENAI_MODEL;
  const previousDeepSeekModel = process.env.DEEPSEEK_MODEL;
  const cases = [
    {
      name: "provider configured model",
      provider: "openai",
      options: {},
      openAiSecret: { key: "test-key", model: "configured-model" },
      expected: {
        provider: "openai", model: "configured-model", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "explicit_request", model: "provider_configuration",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
    {
      name: "environment model",
      provider: "openai",
      options: {},
      openAiSecret: { key: "test-key" },
      openAiModel: "environment-model",
      expected: {
        provider: "openai", model: "environment-model", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "explicit_request", model: "environment",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
    {
      name: "built-in model",
      provider: "openai",
      options: {},
      openAiSecret: { key: "test-key" },
      expected: {
        provider: "openai", model: "gpt-5", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "explicit_request", model: "built_in_default",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
    {
      name: "explicit model",
      provider: "openai",
      options: { model: "explicit-model" },
      openAiSecret: { key: "test-key", model: "configured-model" },
      expected: {
        provider: "openai", model: "explicit-model", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "explicit_request", model: "explicit_request",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
    {
      name: "fallback provider",
      provider: undefined,
      options: { fallbackProvider: "openai" },
      openAiSecret: { key: "test-key" },
      expected: {
        provider: "openai", model: "gpt-5", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "fallback_default", model: "built_in_default",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
    {
      name: "system defaults",
      provider: undefined,
      options: {},
      deepSeekSecret: { key: "test-key" },
      expected: {
        provider: "deepseek", model: "deepseek-v4-flash", temperature: 0.7,
        maxTokens: null, routeKey: null, routeDegraded: false,
      },
      sources: {
        provider: "system_default", model: "built_in_default",
        temperature: "system_default", maxTokens: "system_default",
      },
    },
  ];

  try {
    for (const scenario of cases) {
      delete process.env.OPENAI_MODEL;
      delete process.env.DEEPSEEK_MODEL;
      if (scenario.openAiModel) process.env.OPENAI_MODEL = scenario.openAiModel;
      setProviderSecretCache("openai", scenario.openAiSecret ?? null);
      setProviderSecretCache("deepseek", scenario.deepSeekSecret ?? null);

      const resolved = await resolveLLMClientOptions(scenario.provider, scenario.options);
      assert.deepEqual(resolvedTuple(resolved), scenario.expected, scenario.name);
      assert.deepEqual(provenanceSources(resolved.selectionProvenance), scenario.sources, scenario.name);
    }
  } finally {
    if (previousOpenAiModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousOpenAiModel;
    if (previousDeepSeekModel === undefined) delete process.env.DEEPSEEK_MODEL;
    else process.env.DEEPSEEK_MODEL = previousDeepSeekModel;
    setProviderSecretCache("openai", null);
    setProviderSecretCache("deepseek", null);
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
    assert.deepEqual(fixed.selectionProvenance.temperature.adjustments.map((item) => item.provider), ["kimi"]);

    const clamped = await resolveLLMClientOptions("minimax", {
      model: "MiniMax-M2.7",
      temperature: 0,
    });
    assert.equal(clamped.temperature, 0.01);
    assert.deepEqual(clamped.selectionProvenance.temperature.adjustments.map((item) => item.kind), [
      "capability_clamped_min",
    ]);
    assert.deepEqual(clamped.selectionProvenance.temperature.adjustments.map((item) => item.provider), ["minimax"]);

    const clampedMaximum = await resolveLLMClientOptions("minimax", {
      model: "MiniMax-M2.7",
      temperature: 1.5,
    });
    assert.equal(clampedMaximum.temperature, 1);
    assert.deepEqual(clampedMaximum.selectionProvenance.temperature.adjustments.map((item) => item.kind), [
      "capability_clamped_max",
    ]);
    assert.deepEqual(clampedMaximum.selectionProvenance.temperature.adjustments.map((item) => item.provider), [
      "minimax",
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
    assert.deepEqual(omitted.selectionProvenance.maxTokens.adjustments.map((item) => item.provider), ["qwen"]);

    const capped = await resolveLLMClientOptions("custom_modelscope", {
      maxTokens: 20000,
      executionMode: "structured",
      structuredStrategy: "prompt_json",
    });
    assert.equal(capped.maxTokens, 8192);
    assert.deepEqual(capped.selectionProvenance.maxTokens.adjustments.map((item) => item.kind), [
      "structured_cap",
    ]);
    assert.deepEqual(capped.selectionProvenance.maxTokens.adjustments.map((item) => item.provider), [
      "custom_modelscope",
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
