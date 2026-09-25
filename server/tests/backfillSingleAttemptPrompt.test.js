const test = require("node:test");
const assert = require("node:assert/strict");

const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const attempts = require("../dist/platform/llm/provenance/index.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { styleRecommendationPrompt } = require("../dist/prompting/prompts/style/style.prompts.js");

const PRIMARY_PROVIDER = "openai";
const PRIMARY_MODEL = "gpt-4o-mini";
const FALLBACK_PROVIDER = "deepseek";
const FALLBACK_MODEL = "single-attempt-distinct-fallback";
const FALLBACK_SETTINGS = Object.freeze({
  enabled: true,
  provider: FALLBACK_PROVIDER,
  model: FALLBACK_MODEL,
  temperature: 0.2,
  maxTokens: null,
  retryCount: 2,
});

class RecordingAttemptRepository {
  constructor() {
    this.rows = [];
  }

  async startAttempt(input) {
    this.rows.push({ ...input, status: "started", finalAdoption: "pending" });
  }

  async finalizeAttempt(input) {
    const row = this.rows.find((candidate) => candidate.attemptId === input.attemptId);
    assert.ok(row, "attempt should have been recorded before finalization");
    Object.assign(row, input);
  }

  async findAttempt(attemptId) {
    return this.rows.find((row) => row.attemptId === attemptId) ?? null;
  }

  async reconstructRequest(requestId) {
    const rows = this.rows.filter((row) => row.requestId === requestId);
    return rows.length ? {
      requestId,
      attempts: rows,
      adoptedAttemptId: rows.find((row) => row.finalAdoption === "adopted")?.attemptId ?? null,
    } : null;
  }

  async findByNovelId() {
    return [];
  }
}

function recommendationInput(allowedProfileIds = ["allowed-profile"]) {
  return {
    targetCount: 1,
    novelSummary: "测试小说简介",
    catalogText: "allowed-profile: 稳定、易执行的写法",
    allowedProfileIds,
  };
}

function recommendationOutput(styleProfileId = "allowed-profile") {
  return JSON.stringify({
    summary: "适合这本小说的写法。",
    candidates: [{
      styleProfileId,
      fitScore: 90,
      recommendationReason: "与目标读者和题材相符。",
      caution: "注意维持稳定节奏。",
    }],
  });
}

function installTransportHarness(responseForCall) {
  const originals = {
    resolveLLMClientOptions: factory.resolveLLMClientOptions,
    createLLMFromResolvedOptions: factory.createLLMFromResolvedOptions,
    getLLM: factory.getLLM,
    getStructuredFallbackSettings: structuredFallbackSettings.getStructuredFallbackSettings,
  };
  const repository = new RecordingAttemptRepository();
  const calls = [];
  const repairs = [];
  attempts.setModelAttemptRepositoryForTests(repository);

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? PRIMARY_PROVIDER;
    const resolvedModel = options.model ?? PRIMARY_MODEL;
    const baseURL = options.baseURL ?? (resolvedProvider === FALLBACK_PROVIDER
      ? "https://api.deepseek.com/v1"
      : "https://api.openai.com/v1");
    const structuredProfile = options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        baseURL,
        executionMode: "structured",
        requestProtocol: options.requestProtocol,
      })
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-only-key",
      baseURL,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
      authMode: "bearer",
      requestProtocol: options.requestProtocol ?? "chat_completions",
      executionMode: options.executionMode ?? "plain",
      structuredProfile,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningEnabled: true,
      reasoningEffort: options.reasoningEffort,
      reasoningForcedOff: false,
      taskType: options.taskType,
      promptMeta: options.promptMeta,
      modelKwargs: undefined,
      includeRawResponse: false,
    };
  };

  factory.createLLMFromResolvedOptions = (resolved) => ({
    stream: async (_messages, streamOptions = {}) => {
      const call = {
        provider: resolved.provider,
        model: resolved.model,
        strategy: resolved.structuredStrategy,
        signal: streamOptions.signal,
      };
      calls.push(call);
      return responseForCall(call, calls.length, streamOptions);
    },
  });

  factory.getLLM = async () => ({
    stream: async () => {
      repairs.push("getLLM().stream");
      return (async function* () {
        yield { content: recommendationOutput() };
      })();
    },
  });

  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({ ...FALLBACK_SETTINGS });

  return {
    repository,
    calls,
    repairs,
    fallbackSettings: FALLBACK_SETTINGS,
    restore() {
      factory.resolveLLMClientOptions = originals.resolveLLMClientOptions;
      factory.createLLMFromResolvedOptions = originals.createLLMFromResolvedOptions;
      factory.getLLM = originals.getLLM;
      structuredFallbackSettings.getStructuredFallbackSettings = originals.getStructuredFallbackSettings;
      attempts.setModelAttemptRepositoryForTests();
      promptRunner.setPromptRunnerLLMFactoryForTests();
      promptRunner.setPromptRunnerStructuredInvokerForTests();
    },
  };
}

function jsonStream(content) {
  return (async function* () {
    yield { content };
  })();
}

function runRecommendation(options = {}, allowedProfileIds) {
  return promptRunner.runStructuredPrompt({
    asset: styleRecommendationPrompt,
    promptInput: recommendationInput(allowedProfileIds),
    options: {
      provider: PRIMARY_PROVIDER,
      model: PRIMARY_MODEL,
      ...options,
    },
  });
}

function assertOnlyPrimaryAttempt(harness) {
  assert.equal(harness.calls.length, 1, "one physical provider .stream() call expected");
  assert.equal(harness.calls[0].provider, PRIMARY_PROVIDER);
  assert.equal(harness.calls[0].model, PRIMARY_MODEL);
  assert.equal(harness.repository.rows.length, 1, "one model-attempt evidence row expected");
  assert.equal(harness.repository.rows[0].attemptIndex, 0);
  assert.equal(harness.repository.rows[0].provider, PRIMARY_PROVIDER);
  assert.equal(harness.repository.rows[0].model, PRIMARY_MODEL);
  assert.notEqual(harness.repository.rows[0].model, FALLBACK_MODEL);
}

test("single transport mode succeeds with one validated call despite retry, fallback, and strategy alternatives", async () => {
  const harness = installTransportHarness(async () => jsonStream(recommendationOutput()));
  try {
    const result = await runRecommendation({ singleProviderTransportAttempt: true });

    assert.deepEqual(result.output, {
      summary: "适合这本小说的写法。",
      candidates: [{
        styleProfileId: "allowed-profile",
        fitScore: 90,
        recommendationReason: "与目标读者和题材相符。",
        caution: "注意维持稳定节奏。",
      }],
    });
    assert.equal(harness.calls[0].strategy, "json_schema");
    assert.equal(harness.fallbackSettings.enabled, true);
    assert.equal(harness.fallbackSettings.retryCount > 0, true);
    assert.notEqual(harness.fallbackSettings.model, PRIMARY_MODEL);
    assert.notEqual(harness.fallbackSettings.provider, PRIMARY_PROVIDER);
    const profile = resolveStructuredOutputProfile({
      provider: PRIMARY_PROVIDER,
      model: PRIMARY_MODEL,
      baseURL: "https://api.openai.com/v1",
      executionMode: "structured",
    });
    assert.equal(profile.nativeJsonSchema, true);
    assert.equal(profile.nativeJsonObject, true, "a second supported structured strategy is available");
    assertOnlyPrimaryAttempt(harness);
    assert.equal(harness.repository.rows[0].status, "succeeded");
    assert.equal(harness.repository.rows[0].finalAdoption, "adopted");
    assert.equal(result.meta.attemptEvidence.evidenceStatus, "complete");
    assert.equal(harness.repairs.length, 0);
  } finally {
    harness.restore();
  }
});

test("single transport mode does not retry, switch strategy, or use a distinct configured fallback after transport failure", async () => {
  const harness = installTransportHarness(async () => {
    throw new Error("Our servers are currently overloaded. Please try again later.");
  });
  try {
    await assert.rejects(
      runRecommendation({ singleProviderTransportAttempt: true }),
      /STRUCTURED_OUTPUT:transport_error/i,
    );
    assertOnlyPrimaryAttempt(harness);
    assert.equal(harness.repository.rows[0].status, "failed");
    assert.equal(harness.calls[0].strategy, "json_schema");
  } finally {
    harness.restore();
  }
});

test("single transport mode rejects a strategy incompatibility after its first provider call", async () => {
  const harness = installTransportHarness(async () => {
    throw new Error("response_format json_schema is unsupported by this endpoint");
  });
  try {
    await assert.rejects(
      runRecommendation({ singleProviderTransportAttempt: true }),
      /STRUCTURED_OUTPUT:unsupported_native_json/i,
    );
    assertOnlyPrimaryAttempt(harness);
    assert.equal(harness.calls[0].strategy, "json_schema");
    assert.equal(harness.repository.rows[0].status, "failed");
  } finally {
    harness.restore();
  }
});

test("single transport mode does not repair empty, malformed, or schema-invalid provider output", async (t) => {
  const scenarios = [
    { name: "empty JSON", content: "" },
    { name: "malformed JSON", content: "not-json" },
    { name: "schema mismatch", content: JSON.stringify({ summary: "缺少候选", candidates: [] }) },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const harness = installTransportHarness(async () => jsonStream(scenario.content));
      try {
        await assert.rejects(runRecommendation({ singleProviderTransportAttempt: true }));
        assertOnlyPrimaryAttempt(harness);
        assert.equal(harness.repairs.length, 0, "JSON repair uses a separate getLLM().stream() route");
        assert.notEqual(harness.repository.rows[0].status, "started");
      } finally {
        harness.restore();
      }
    });
  }
});

test("single transport mode does not make a semantic retry after post-validation rejects schema-valid output", async () => {
  const harness = installTransportHarness(async () => jsonStream(recommendationOutput("not-allowed")));
  try {
    await assert.rejects(
      runRecommendation({ singleProviderTransportAttempt: true }, ["allowed-profile"]),
      /非法候选/i,
    );
    assertOnlyPrimaryAttempt(harness);
    assert.equal(harness.repository.rows[0].finalAdoption, "not_adopted");
    assert.equal(harness.repairs.length, 0);
  } finally {
    harness.restore();
  }
});

test("single transport mode does not retry when the first provider attempt is aborted", async () => {
  const controller = new AbortController();
  const harness = installTransportHarness(async (_call, _count, streamOptions) => (async function* () {
    yield { content: "partial" };
    controller.abort(new Error("request cancelled after the first provider call"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error("provider stream stopped after cancellation");
  })());
  try {
    await assert.rejects(
      runRecommendation({ singleProviderTransportAttempt: true, signal: controller.signal }),
      /cancelled|aborted/i,
    );
    assertOnlyPrimaryAttempt(harness);
    assert.equal(harness.repository.rows[0].status, "cancelled");
  } finally {
    harness.restore();
  }
});

test("streamStructuredPrompt rejects single transport opt-in before creating an LLM", async () => {
  let factoryCalls = 0;
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => {
    factoryCalls += 1;
    return { stream: async () => jsonStream(recommendationOutput()) };
  });
  try {
    await assert.rejects(
      promptRunner.streamStructuredPrompt({
        asset: styleRecommendationPrompt,
        promptInput: recommendationInput(),
        options: { singleProviderTransportAttempt: true },
      }),
      /only supported by non-stream runStructuredPrompt/i,
    );
    assert.equal(factoryCalls, 0);
  } finally {
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("ordinary streamStructuredPrompt still streams and validates its structured output", async () => {
  const harness = installTransportHarness(async () => {
    throw new Error("the non-stream structured invoke seam should not be used");
  });
  const streamCalls = [];
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async (messages, options) => {
      streamCalls.push({ messages, options });
      return jsonStream(recommendationOutput());
    },
  }));
  try {
    const started = await promptRunner.streamStructuredPrompt({
      asset: styleRecommendationPrompt,
      promptInput: recommendationInput(),
      options: { provider: PRIMARY_PROVIDER, model: PRIMARY_MODEL },
    });
    let streamedContent = "";
    for await (const chunk of started.stream) {
      streamedContent += String(chunk.content ?? "");
    }
    const result = await started.complete;

    assert.equal(streamCalls.length, 1);
    assert.equal(streamedContent, recommendationOutput());
    assert.equal(result.output.candidates[0].styleProfileId, "allowed-profile");
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.repository.rows.length, 1);
    assert.equal(harness.repository.rows[0].status, "succeeded");
    assert.equal(harness.repository.rows[0].finalAdoption, "adopted");
  } finally {
    harness.restore();
  }
});

test("ordinary structured Prompt calls retain semantic retry behavior", async () => {
  const harness = installTransportHarness(async (_call, callNumber) => jsonStream(
    recommendationOutput(callNumber === 1 ? "not-allowed" : "allowed-profile"),
  ));
  try {
    const result = await runRecommendation();

    assert.equal(result.output.candidates[0].styleProfileId, "allowed-profile");
    assert.equal(harness.calls.length, 2);
    assert.deepEqual(harness.repository.rows.map((row) => row.attemptIndex), [0, 1]);
    assert.equal(result.meta.invocation.semanticRetryUsed, true);
    assert.equal(harness.repairs.length, 0);
  } finally {
    harness.restore();
  }
});

test("concurrent single transport requests each receive an independent one-call allowance", async () => {
  const harness = installTransportHarness(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    return jsonStream(recommendationOutput());
  });
  try {
    const [first, second] = await Promise.all([
      runRecommendation({ singleProviderTransportAttempt: true }),
      runRecommendation({ singleProviderTransportAttempt: true }),
    ]);

    assert.equal(first.output.candidates.length, 1);
    assert.equal(second.output.candidates.length, 1);
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.repository.rows.length, 2);
    assert.equal(new Set(harness.repository.rows.map((row) => row.requestId)).size, 2);
    assert.ok(harness.repository.rows.every((row) => row.attemptIndex === 0));
    assert.ok(harness.repository.rows.every((row) => row.status === "succeeded"));
  } finally {
    harness.restore();
  }
});

test("single transport mode classifies zero-repair parse failures without reaching schema validation", async (t) => {
  const { StructuredOutputError } = require("../dist/llm/structuredOutput.js");
  const scenarios = [
    { name: "non-empty non-JSON is malformed_json", content: "not-json at all", category: "malformed_json" },
    { name: "whitespace-only is empty_content", content: "   \n\t ", category: "empty_content" },
    {
      name: "valid JSON violating the schema stays schema_mismatch",
      content: JSON.stringify({ summary: "缺少候选", candidates: [] }),
      category: "schema_mismatch",
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const harness = installTransportHarness(async () => jsonStream(scenario.content));
      try {
        await assert.rejects(
          runRecommendation({ singleProviderTransportAttempt: true }),
          (error) => error instanceof StructuredOutputError && error.category === scenario.category,
        );
        assertOnlyPrimaryAttempt(harness);
        assert.equal(harness.repairs.length, 0, "zero-repair mode must not open a repair call");
      } finally {
        harness.restore();
      }
    });
  }
});

test("ordinary structured mode still sends the same non-JSON output through JSON repair", async () => {
  const harness = installTransportHarness(async () => jsonStream("not-json at all"));
  try {
    const result = await runRecommendation();

    assert.equal(harness.calls.length, 1);
    assert.equal(harness.repairs.length, 1, "repair budget >= 1 keeps the repair path");
    assert.equal(result.output.candidates[0].styleProfileId, "allowed-profile");
  } finally {
    harness.restore();
  }
});

test("zero-repair calls outside single transport mode keep the legacy one-call schema_mismatch classification", async () => {
  const { StructuredOutputError } = require("../dist/llm/structuredOutput.js");
  const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
  const harness = installTransportHarness(async () => jsonStream("not-json"));
  try {
    await assert.rejects(
      invokeStructuredLlmDetailed({
        label: "zero-repair-prompt-json-regression",
        systemPrompt: "只输出 JSON。",
        userPrompt: "生成推荐。",
        schema: styleRecommendationPrompt.outputSchema,
        provider: PRIMARY_PROVIDER,
        model: PRIMARY_MODEL,
        structuredStrategy: "prompt_json",
        maxRepairAttempts: 0,
        // Isolate the primary strategy loop; the configured fallback model is a separate, unchanged stage.
        disableFallbackModel: true,
      }),
      (error) => error instanceof StructuredOutputError && error.category === "schema_mismatch",
    );
    assert.equal(harness.calls.length, 1, "prompt_json schema_mismatch still stops after one provider call");
    assert.equal(harness.calls[0].strategy, "prompt_json");
    assert.equal(harness.repairs.length, 0);
  } finally {
    harness.restore();
  }
});
