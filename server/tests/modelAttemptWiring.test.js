const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");

const factory = require("../dist/llm/factory.js");
const structuredOutput = require("../dist/llm/structuredOutput.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const attempts = require("../dist/platform/llm/provenance/index.js");
const execution = require("../dist/prompting/core/promptRunner.js");
const structuredExecution = require("../dist/prompting/core/execution/structuredPromptExecution.js");
const { styleGenerationPrompt, styleDetectionPrompt } = require("../dist/prompting/prompts/style/style.prompts.js");

class RecordingRepository {
  constructor({ failStart = false, failFinalize = false } = {}) {
    this.rows = [];
    this.failStart = failStart;
    this.failFinalize = failFinalize;
  }

  async startAttempt(input) {
    if (this.failStart) throw new Error("start unavailable");
    this.rows.push({ ...input, status: "started", finalAdoption: "pending", usage: null });
  }

  async finalizeAttempt(input) {
    if (this.failFinalize) throw new Error("finalize unavailable");
    const row = this.rows.find((candidate) => candidate.attemptId === input.attemptId);
    if (!row) throw new Error("attempt not started");
    row.status = input.status;
    row.finalAdoption = input.finalAdoption;
    row.usage = input.usage;
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

function textAsset() {
  return styleGenerationPrompt;
}

function textInput() {
  return {
    styleBlock: "保持简洁。",
    characterBlock: "主角谨慎。",
    antiAiBlock: "避免套话。",
    selfCheckBlock: "检查连贯性。",
    mode: "generate",
    prompt: "写一句测试文本。",
    targetLength: 20,
  };
}

function semanticAsset() {
  return {
    id: "test.attempt.structured",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: { maxTokensBudget: 1000 },
    outputSchema: z.object({ value: z.string() }),
    render: () => [new HumanMessage("返回 JSON")],
    semanticRetryPolicy: { maxAttempts: 1 },
    postValidate: (output) => {
      if (output.value === "bad") throw new Error("semantic rejection");
      return output;
    },
  };
}

function chunked(content, usage) {
  return async function* () {
    yield { content, ...(usage ? { usage } : {}) };
  };
}

function resolvedOptions(provider, model) {
  const profile = structuredOutput.resolveStructuredOutputProfile({
    provider,
    model,
    executionMode: "structured",
  });
  return {
    provider,
    providerName: provider,
    model,
    temperature: 0.2,
    baseURL: "https://example.invalid/v1",
    authMode: "bearer",
    maxTokens: 256,
    timeoutMs: undefined,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    reasoningEnabled: false,
    reasoningEffort: null,
    includeRawResponse: false,
    requestProtocol: "chat_completions",
    executionMode: "structured",
    structuredProfile: profile,
    structuredStrategy: "prompt_json",
    reasoningForcedOff: false,
    selectionProvenance: {},
  };
}

test("production text invoke and stream write terminal attempts, including null usage", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  execution.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async function* () {
      yield { content: "ok" };
    },
  }));
  try {
    const invoke = await execution.runTextPrompt({ asset: textAsset(), promptInput: textInput() });
    assert.equal(invoke.output, "ok");
    assert.equal(invoke.meta.attemptEvidence.evidenceStatus, "complete");
    assert.equal(repository.rows[0].status, "succeeded");
    assert.equal(repository.rows[0].finalAdoption, "adopted");
    assert.equal(repository.rows[0].usage, null);

    const streamed = await execution.streamTextPrompt({ asset: textAsset(), promptInput: textInput() });
    for await (const _chunk of streamed.stream) { /* consume */ }
    const streamResult = await streamed.complete;
    assert.equal(streamResult.output, "ok");
    assert.equal(streamResult.meta.attemptEvidence.evidenceStatus, "complete");
    assert.equal(repository.rows.filter((row) => row.status === "started").length, 0);
    assert.equal(repository.rows.length, 2);
  } finally {
    execution.setPromptRunnerLLMFactoryForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("structured invoke records a real adopted candidate and structured stream closes semantic lineage", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const profile = structuredOutput.resolveStructuredOutputProfile({
    provider: "deepseek",
    model: "test-model",
    executionMode: "structured",
  });
  factory.resolveLLMClientOptions = async () => ({
    provider: "deepseek",
    providerName: "deepseek",
    model: "test-model",
    temperature: 0.2,
    baseURL: "https://example.invalid/v1",
    authMode: "bearer",
    maxTokens: 256,
    timeoutMs: undefined,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    reasoningEnabled: false,
    reasoningEffort: null,
    includeRawResponse: false,
    requestProtocol: "chat_completions",
    executionMode: "structured",
    structuredProfile: profile,
    structuredStrategy: "prompt_json",
    reasoningForcedOff: false,
    selectionProvenance: {},
  });
  factory.createLLMFromResolvedOptions = () => ({
    stream: async function* () {
      yield { content: '{"value":"ok"}' };
    },
  });
  try {
    const direct = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "deepseek",
      model: "test-model",
      schema: z.object({ value: z.string() }),
      label: "test.structured.invoke",
      structuredStrategy: "prompt_json",
      disableFallbackModel: true,
      messages: [new HumanMessage("return JSON")],
    });
    assert.deepEqual(direct.data, { value: "ok" });
    assert.equal(repository.rows[0].status, "succeeded");
    assert.equal(repository.rows[0].finalAdoption, "adopted");

    execution.setPromptRunnerLLMFactoryForTests(async () => ({
      stream: async function* () {
        yield { content: '{"riskScore":10,"summary":"ok","violations":[],"canAutoRewrite":false}' };
      },
    }));
    const streamed = await execution.streamStructuredPrompt({ asset: styleDetectionPrompt, promptInput: {
      styleContractText: "简洁",
      styleContractMetaText: "测试",
      antiRuleCatalogText: "无",
      content: "测试文本",
    } });
    for await (const _chunk of streamed.stream) { /* consume */ }
    const streamResult = await streamed.complete;
    assert.equal(streamResult.output.summary, "ok");
    const semanticRows = repository.rows.slice(1);
    assert.equal(semanticRows.length, 1);
    assert.equal(semanticRows[0].role, "primary");
    assert.equal(semanticRows[0].finalAdoption, "adopted");
    assert.equal(repository.rows.filter((row) => row.status === "started").length, 0);

    const semanticRepository = new RecordingRepository();
    attempts.setModelAttemptRepositoryForTests(semanticRepository);
    const semanticResult = await attempts.runWithModelAttemptRequestContext({ mode: "invoke" }, async () => {
      const primary = await attempts.startModelTransportAttempt({ provider: "deepseek", model: "semantic-primary" });
      return structuredExecution.resolveStructuredOutput({
        asset: semanticAsset(),
        promptInput: {},
        context: { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 },
        baseMessages: [new HumanMessage("semantic")],
        outputSchema: semanticAsset().outputSchema,
        initialResult: {
          data: { value: "bad" },
          repairUsed: false,
          repairAttempts: 0,
          diagnostics: { strategy: "prompt_json", profile, reasoningForcedOff: false, fallbackAvailable: false, fallbackUsed: false, errorCategory: null },
          modelAttemptCandidate: primary,
          modelAttemptUsage: null,
        },
        structuredInvoker: async (input) => {
          const candidate = await attempts.startModelTransportAttempt({
            provider: "deepseek",
            model: "semantic-retry",
            role: input.modelAttemptRole,
            parentAttemptId: input.modelAttemptParentId,
          });
          return {
            data: { value: "fixed" },
            repairUsed: false,
            repairAttempts: 0,
            diagnostics: { strategy: "prompt_json", profile, reasoningForcedOff: false, fallbackAvailable: false, fallbackUsed: false, errorCategory: null },
            modelAttemptCandidate: candidate,
            modelAttemptUsage: null,
          };
        },
      });
    });
    assert.deepEqual(semanticResult.output, { value: "fixed" });
    assert.deepEqual(semanticRepository.rows.map((row) => row.role), ["primary", "semantic_retry"]);
    assert.equal(semanticRepository.rows[0].finalAdoption, "not_adopted");
    assert.equal(semanticRepository.rows[1].finalAdoption, "adopted");
    assert.equal(semanticRepository.rows[1].parentAttemptId, semanticRepository.rows[0].attemptId);
    assert.equal(semanticRepository.rows.filter((row) => row.status === "started").length, 0);
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    execution.setPromptRunnerLLMFactoryForTests();
    execution.setPromptRunnerStructuredInvokerForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("structured transport retry, fallback, JSON repair, and empty-stream fallback keep roles and parents", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const originalGetLLM = factory.getLLM;
  const originalGetFallbackSettings = structuredFallbackSettings.getStructuredFallbackSettings;
  let calls = 0;
  factory.resolveLLMClientOptions = async (provider, options = {}) => resolvedOptions(
    provider ?? "deepseek",
    options.model ?? (provider === "deepseek" ? "deepseek-chat" : "primary-model"),
  );
  factory.createLLMFromResolvedOptions = (resolved) => ({
    stream: async function* () {
      calls += 1;
      if (calls <= 2) throw new Error("network error");
      yield { content: '{"value":"fallback"}' };
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: true,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: null,
    retryCount: 1,
  });
  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "primary-model",
      schema: z.object({ value: z.string() }),
      label: "test.transport.fallback",
      structuredStrategy: "prompt_json",
      messages: [new HumanMessage("return JSON")],
    });
    assert.deepEqual(result.data, { value: "fallback" });
    assert.deepEqual(repository.rows.map((row) => row.role), ["primary", "transport_retry", "fallback"]);
    assert.deepEqual(repository.rows.map((row) => row.routeTier), ["primary", "primary", "fallback"]);
    assert.equal(repository.rows[0].finalAdoption, "not_adopted");
    assert.equal(repository.rows[1].finalAdoption, "not_adopted");
    assert.equal(repository.rows[2].finalAdoption, "adopted");
    assert.equal(repository.rows[2].parentAttemptId, repository.rows[1].attemptId);

    const repairRepository = new RecordingRepository();
    attempts.setModelAttemptRepositoryForTests(repairRepository);
    calls = 0;
    factory.createLLMFromResolvedOptions = () => ({
      stream: async function* () {
        yield { content: "not-json" };
      },
    });
    factory.getLLM = async () => ({
      stream: async function* () {
        yield { content: '{"value":"repaired"}' };
      },
    });
    const repaired = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "primary-model",
      schema: z.object({ value: z.string() }),
      label: "test.json.repair",
      structuredStrategy: "prompt_json",
      maxRepairAttempts: 1,
      disableFallbackModel: true,
      messages: [new HumanMessage("return JSON")],
    });
    assert.deepEqual(repaired.data, { value: "repaired" });
    assert.deepEqual(repairRepository.rows.map((row) => row.role), ["primary", "json_repair"]);
    assert.equal(repairRepository.rows[0].finalAdoption, "not_adopted");
    assert.equal(repairRepository.rows[1].finalAdoption, "adopted");
    assert.equal(repairRepository.rows[1].parentAttemptId, repairRepository.rows[0].attemptId);

    const emptyRepository = new RecordingRepository();
    attempts.setModelAttemptRepositoryForTests(emptyRepository);
    execution.setPromptRunnerLLMFactoryForTests(async () => ({
      stream: async function* () { /* empty initial stream */ },
    }));
    execution.setPromptRunnerStructuredInvokerForTests(structuredInvoke.invokeStructuredLlmDetailed);
    calls = 0;
    factory.createLLMFromResolvedOptions = (resolved) => ({
      stream: async function* () {
        calls += 1;
        if (calls <= 2) throw new Error("network error");
        yield { content: '{"riskScore":1,"summary":"fallback","violations":[],"canAutoRewrite":false}' };
      },
    });
    const emptyFallback = await execution.streamStructuredPrompt({
      asset: styleDetectionPrompt,
      promptInput: {
        styleContractText: "简洁",
        styleContractMetaText: "测试",
        antiRuleCatalogText: "无",
        content: "测试文本",
      },
    });
    for await (const _chunk of emptyFallback.stream) { /* consume */ }
    await emptyFallback.complete;
    assert.deepEqual(emptyRepository.rows.map((row) => row.role), ["primary", "transport_retry", "transport_retry", "fallback"]);
    assert.deepEqual(emptyRepository.rows.map((row) => row.routeTier), ["primary", "primary", "primary", "fallback"]);
    assert.equal(emptyRepository.rows[0].finalAdoption, "not_adopted");
    assert.equal(emptyRepository.rows[1].finalAdoption, "not_adopted");
    assert.equal(emptyRepository.rows[2].finalAdoption, "not_adopted");
    assert.equal(emptyRepository.rows[3].finalAdoption, "adopted");
    assert.equal(emptyRepository.rows[1].parentAttemptId, emptyRepository.rows[0].attemptId);
    assert.equal(emptyRepository.rows[2].parentAttemptId, emptyRepository.rows[1].attemptId);
    assert.equal(emptyRepository.rows[3].parentAttemptId, emptyRepository.rows[2].attemptId);
    assert.equal(emptyRepository.rows.filter((row) => row.status === "started").length, 0);
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    factory.getLLM = originalGetLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originalGetFallbackSettings;
    execution.setPromptRunnerLLMFactoryForTests();
    execution.setPromptRunnerStructuredInvokerForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("recorder failures preserve text output and report missing evidence without creating model retries", async () => {
  const repository = new RecordingRepository({ failStart: true, failFinalize: true });
  attempts.setModelAttemptRepositoryForTests(repository);
  execution.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async function* () {
      yield { content: "usable" };
    },
  }));
  try {
    const result = await execution.runTextPrompt({ asset: textAsset(), promptInput: textInput() });
    assert.equal(result.output, "usable");
    assert.equal(result.meta.attemptEvidence.evidenceStatus, "missing");
    assert.equal(repository.rows.length, 0);
  } finally {
    execution.setPromptRunnerLLMFactoryForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("production request scopes stay isolated and budget rejection records no model attempt", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  execution.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async function* () {
      await Promise.resolve();
      yield { content: "parallel" };
    },
  }));
  try {
    const [first, second] = await Promise.all([
      execution.runTextPrompt({ asset: textAsset(), promptInput: textInput() }),
      execution.runTextPrompt({ asset: textAsset(), promptInput: textInput() }),
    ]);
    assert.equal(first.output, "parallel");
    assert.equal(second.output, "parallel");
    assert.equal(repository.rows.length, 2);
    assert.equal(new Set(repository.rows.map((row) => row.requestId)).size, 2);
    assert.equal(repository.rows.filter((row) => row.status === "started").length, 0);

    let structuredInvokerCalls = 0;
    execution.setPromptRunnerStructuredInvokerForTests(async () => {
      structuredInvokerCalls += 1;
      throw new Error("model must not be called after budget rejection");
    });
    await assert.rejects(
      execution.runStructuredPrompt({
        asset: styleDetectionPrompt,
        promptInput: {
          styleContractText: "简洁",
          styleContractMetaText: "测试",
          antiRuleCatalogText: "无",
          content: "测试文本",
        },
        options: { requestBudget: { mode: "reject", inputTokenLimit: 1 } },
      }),
      (error) => error?.name === "LlmRequestBudgetError",
    );
    assert.equal(structuredInvokerCalls, 0);
    assert.equal(repository.rows.length, 2);
  } finally {
    execution.setPromptRunnerLLMFactoryForTests();
    execution.setPromptRunnerStructuredInvokerForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("text and structured stream consumer early-stop finalizes cancelled attempts", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  execution.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async function* () {
      yield { content: "partial" };
      await new Promise(() => {});
    },
  }));
  try {
    const textStream = await execution.streamTextPrompt({
      asset: textAsset(),
      promptInput: textInput(),
    });
    for await (const _chunk of textStream.stream) {
      break;
    }
    await assert.rejects(textStream.complete, /model_stream_cancelled_before_completion/);
    assert.equal(repository.rows.length, 1);
    assert.equal(repository.rows[0].status, "cancelled");
    assert.equal(repository.rows[0].finalAdoption, "not_adopted");
    assert.equal(repository.rows.filter((row) => row.status === "started").length, 0);

    const structuredRepository = new RecordingRepository();
    attempts.setModelAttemptRepositoryForTests(structuredRepository);
    const structuredStream = await execution.streamStructuredPrompt({
      asset: styleDetectionPrompt,
      promptInput: {
        styleContractText: "简洁",
        styleContractMetaText: "测试",
        antiRuleCatalogText: "无",
        content: "测试文本",
      },
    });
    for await (const _chunk of structuredStream.stream) {
      break;
    }
    await assert.rejects(structuredStream.complete, /model_stream_cancelled_before_completion/);
    assert.equal(structuredRepository.rows.length, 1);
    assert.equal(structuredRepository.rows[0].status, "cancelled");
    assert.equal(structuredRepository.rows[0].finalAdoption, "not_adopted");
    assert.equal(structuredRepository.rows.filter((row) => row.status === "started").length, 0);
  } finally {
    execution.setPromptRunnerLLMFactoryForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("production structured strategy switch records strategy_retry lineage", async () => {
  const repository = new RecordingRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? "openai";
    const resolvedModel = options.model ?? "gpt-4o-mini";
    const baseURL = options.baseURL ?? "https://api.openai.com/v1";
    const profile = options.executionMode === "structured"
      ? structuredOutput.resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        baseURL,
        executionMode: "structured",
      })
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-key",
      baseURL,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
      concurrencyLimit: 0,
      requestIntervalMs: 0,
      reasoningEnabled: true,
      reasoningEffort: null,
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      requestProtocol: "chat_completions",
      structuredProfile: profile,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningForcedOff: false,
      selectionProvenance: {},
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  factory.createLLMFromResolvedOptions = (resolved) => ({
    stream: async function* () {
      if (resolved.structuredStrategy === "json_schema") {
        throw new Error("response_format is not supported");
      }
      yield { content: '{"value":"strategy-ok"}' };
    },
  });
  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "gpt-4o-mini",
      label: "test.strategy-switch",
      taskType: "planner",
      schema: z.object({ value: z.string() }),
      systemPrompt: "只返回 JSON。",
      userPrompt: "给我一个 value。",
      disableFallbackModel: true,
    });
    assert.deepEqual(result.data, { value: "strategy-ok" });
    assert.deepEqual(repository.rows.map((row) => row.structuredStrategy), ["json_schema", "json_object"]);
    assert.deepEqual(repository.rows.map((row) => row.role), ["primary", "strategy_retry"]);
    assert.equal(repository.rows[0].finalAdoption, "not_adopted");
    assert.equal(repository.rows[1].finalAdoption, "adopted");
    assert.equal(repository.rows[1].parentAttemptId, repository.rows[0].attemptId);
    assert.equal(repository.rows.filter((row) => row.status === "started").length, 0);
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    attempts.setModelAttemptRepositoryForTests();
  }
});
