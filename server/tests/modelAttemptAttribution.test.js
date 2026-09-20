const test = require("node:test");
const assert = require("node:assert/strict");

const attempts = require("../dist/platform/llm/provenance/index.js");
const { InMemoryModelAttemptRepository } = require("../dist/platform/llm/provenance/attempts/prototype/InMemoryModelAttemptRepository.js");
const { DirectorNodeRunner } = require("../dist/services/novel/director/runtime/DirectorNodeRunner.js");
const { DirectorPolicyEngine } = require("../dist/services/novel/director/runtime/DirectorPolicyEngine.js");
const { NovelChapterEditorService } = require("../dist/services/novel/chapterEditor/NovelChapterEditorService.js");
const promptExecution = require("../dist/prompting/core/promptRunner.js");
const { styleGenerationPrompt } = require("../dist/prompting/prompts/style/style.prompts.js");

function directorSnapshot() {
  return {
    schemaVersion: 1,
    runId: "run-a",
    novelId: "novel-a",
    entrypoint: "test",
    policy: {
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: new Date().toISOString(),
    },
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: new Date().toISOString(),
  };
}

function directorStore(snapshot) {
  return {
    getSnapshot: async () => snapshot,
    recordNodeGate: async () => {},
    recordStepStarted: async () => {},
    recordStepCompleted: async () => {},
    recordStepFailed: async () => {},
  };
}

async function recordOne(repository, attribution) {
  attempts.setModelAttemptRepositoryForTests(repository);
  let requestId;
  await attempts.runWithModelAttemptRequestContext({ mode: "invoke", attribution }, async () => {
    const candidate = await attempts.startModelTransportAttempt({ provider: "test", model: "test-model" });
    await candidate.finalizeSucceeded(null, "adopted");
    requestId = attempts.getModelAttemptRequestState().requestId;
  });
  return requestId;
}

test("the three contracted prompt attributions never infer identity from other fields", () => {
  assert.deepEqual(
    attempts.buildPromptInvocationAttribution({
      novelId: "novel-a",
      entrypoint: "novel-world-generate",
    }),
    {
      kind: "novel_world_generate",
      source: "prompt_invocation",
      novelId: "novel-a",
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId: null,
      entrypoint: "novel-world-generate",
    },
  );
  const chapter = attempts.buildPromptInvocationAttribution({
    novelId: "novel-a",
    chapterId: "chapter-a",
    entrypoint: "ai-revision-preview",
  });
  assert.equal(chapter.kind, "ai_revision_preview");
  assert.equal(chapter.novelId, "novel-a");
  assert.equal(chapter.chapterId, "chapter-a");
  assert.equal(attempts.buildPromptInvocationAttribution({ entrypoint: "other-entrypoint" }), undefined);
});

test("director runtime frame is captured as one complete attribution snapshot", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const runner = new DirectorNodeRunner(
    directorStore(directorSnapshot()),
    new DirectorPolicyEngine(),
  );
  try {
    await runner.run({
      nodeKey: "chapter_execution_node",
      label: "chapter",
      reads: [],
      writes: [],
      mayModifyUserContent: false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
      run: async () => {
        const candidate = await attempts.startModelTransportAttempt({ provider: "test", model: "test-model" });
        await candidate.finalizeSucceeded(null, "adopted");
        return { ok: true };
      },
    }, {
      taskId: "task-a",
      novelId: "novel-a",
      input: null,
    });
    const [row] = repository.exportRowsForReconstruction();
    assert.equal(row.attribution.kind, "auto_director");
    assert.equal(row.attribution.source, "director_runtime");
    assert.equal(row.attribution.novelId, "novel-a");
    assert.equal(row.attribution.taskId, "task-a");
    assert.equal(row.attribution.directorRunId, "run-a");
    assert.equal(row.attribution.directorStepIdempotencyKey, "task-a:chapter_execution_node:global:global");
    assert.equal(row.attribution.directorNodeKey, "chapter_execution_node");
    assert.equal(row.attribution.entrypoint, "director_runtime");
  } finally {
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("director identity conflict does not mix input and snapshot fields", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const runner = new DirectorNodeRunner(
    directorStore(directorSnapshot()),
    new DirectorPolicyEngine(),
  );
  try {
    const result = await runner.run({
      nodeKey: "conflict_node",
      label: "conflict",
      reads: [],
      writes: [],
      mayModifyUserContent: false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
      run: async () => {
        const candidate = await attempts.startModelTransportAttempt({ provider: "test", model: "test-model" });
        await candidate.finalizeSucceeded(null, "adopted");
        return { output: "preserved", evidence: attempts.getModelAttemptExecutionEvidence() };
      },
    }, {
      taskId: "task-a",
      novelId: "novel-b",
      input: null,
    });
    const [row] = repository.exportRowsForReconstruction();
    assert.equal(result.output.output, "preserved");
    assert.equal(row.attribution.kind, "unattributed");
    assert.equal(result.output.evidence.attributionIssue, "director_frame_conflict");
    assert.notEqual(row.attribution.novelId, "novel-b");
    assert.notEqual(row.attribution.directorRunId, "task-a");
  } finally {
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("missing director snapshot does not masquerade task id as run id", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const store = directorStore(null);
  const runner = new DirectorNodeRunner(store, new DirectorPolicyEngine());
  try {
    const result = await runner.run({
      nodeKey: "missing_node",
      label: "missing",
      reads: [],
      writes: [],
      mayModifyUserContent: false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
      run: async () => {
        const candidate = await attempts.startModelTransportAttempt({ provider: "test", model: "test-model" });
        await candidate.finalizeSucceeded(null, "adopted");
        return attempts.getModelAttemptExecutionEvidence();
      },
    }, {
      taskId: "task-missing",
      novelId: "novel-a",
      input: null,
    });
    const [row] = repository.exportRowsForReconstruction();
    assert.equal(row.attribution.kind, "unattributed");
    assert.equal(result.output.attributionIssue, "director_frame_missing");
    assert.equal(row.attribution.directorRunId, null);
    assert.notEqual(row.attribution.directorRunId, "task-missing");
  } finally {
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("attribution survives deferred stream consumption in the original request scope", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  promptExecution.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async function* () {
      yield { content: "streamed" };
    },
  }));
  try {
    const streamed = await promptExecution.streamTextPrompt({
      asset: styleGenerationPrompt,
      promptInput: {
        styleBlock: "简洁",
        characterBlock: "谨慎",
        antiAiBlock: "避免套话",
        selfCheckBlock: "检查连贯",
        mode: "generate",
        prompt: "写一句测试文本",
        targetLength: 20,
      },
      options: {
        novelId: "novel-stream",
        chapterId: "chapter-stream",
        entrypoint: "ai-revision-preview",
      },
    });
    for await (const _chunk of streamed.stream) { /* deferred consumer */ }
    await streamed.complete;
    const [row] = repository.exportRowsForReconstruction();
    assert.equal(row.attribution.novelId, "novel-stream");
    assert.equal(row.attribution.chapterId, "chapter-stream");
    assert.equal(row.attribution.entrypoint, "ai-revision-preview");
  } finally {
    promptExecution.setPromptRunnerLLMFactoryForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("read projection keeps not_found, legacy attribution, and execution evidence separate", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  try {
    const missing = await attempts.readModelAttemptRequest({
      requestId: "missing",
      repository,
      executionEvidence: {
        requestId: "missing",
        evidenceStatus: "missing",
        observationIssues: [],
      },
    });
    assert.equal(missing.status, "not_found");
    assert.equal(missing.attributionStatus, "unattributed");
    assert.equal(missing.evidenceStatus, "missing");

    const legacyRequestId = await recordOne(repository, {
      kind: "unattributed",
      source: "legacy_unknown",
      novelId: null,
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId: null,
      entrypoint: null,
    });
    const legacy = await attempts.readModelAttemptRequest({ requestId: legacyRequestId, repository });
    assert.equal(legacy.status, "found");
    assert.equal(legacy.attributionStatus, "unattributed");
    assert.equal(legacy.evidenceStatus, undefined);

    const partialRequestId = await recordOne(repository, {
      kind: "novel_world_generate",
      source: "prompt_invocation",
      novelId: null,
      taskId: null,
      directorRunId: null,
      directorStepIdempotencyKey: null,
      directorNodeKey: null,
      chapterId: null,
      entrypoint: "novel-world-generate",
    });
    const partial = await attempts.readModelAttemptRequest({ requestId: partialRequestId, repository });
    assert.equal(partial.status, "found");
    assert.equal(partial.attributionStatus, "partial");
  } finally {
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("concurrent request scopes keep novel attribution and lineage isolated", async () => {
  const repository = new InMemoryModelAttemptRepository();
  attempts.setModelAttemptRepositoryForTests(repository);
  const run = (novelId) => recordOne(repository, attempts.buildPromptInvocationAttribution({
    novelId,
    entrypoint: "novel-world-generate",
  }));
  try {
    const [firstRequestId, secondRequestId] = await Promise.all([run("novel-a"), run("novel-b")]);
    const [first, second] = await Promise.all([
      attempts.readModelAttemptRequest({ requestId: firstRequestId, repository }),
      attempts.readModelAttemptRequest({ requestId: secondRequestId, repository }),
    ]);
    assert.notEqual(firstRequestId, secondRequestId);
    assert.equal(first.attempts[0].attribution.novelId, "novel-a");
    assert.equal(second.attempts[0].attribution.novelId, "novel-b");
    assert.equal(first.attempts[0].requestId, firstRequestId);
    assert.equal(second.attempts[0].requestId, secondRequestId);
  } finally {
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("repository read failure is diagnosable without fabricating execution loss", async () => {
  const failure = await attempts.readModelAttemptRequest({
    requestId: "request-a",
    repository: {
      reconstructRequest: async () => { throw new Error("database details must stay private"); },
    },
    attribution: attempts.buildPromptInvocationAttribution({
      novelId: "novel-a",
      entrypoint: "novel-world-generate",
    }),
    executionEvidence: {
      requestId: "request-a",
      evidenceStatus: "partial",
      observationIssues: [],
    },
  });
  assert.equal(failure.status, "error");
  assert.equal(failure.errorCode, "attempt_read_failed");
  assert.equal(failure.attributionStatus, "complete");
  assert.equal(failure.evidenceStatus, "partial");
  assert.equal("database details must stay private" in failure, false);
});

test("read projection is stable across changed defaults, restart-safe, redacted, and model-free", async () => {
  const originalRepository = new InMemoryModelAttemptRepository();
  const requestId = await recordOne(originalRepository, attempts.buildPromptInvocationAttribution({
    novelId: "novel-restart",
    entrypoint: "novel-world-generate",
  }));
  const [record] = originalRepository.exportRowsForReconstruction();
  const restartedRepository = new InMemoryModelAttemptRepository(originalRepository.exportRowsForReconstruction());

  // This is the existing PromptRunner resolver seam. A read must not touch it;
  // the changing defaults below make an accidental model resolution observable.
  const defaultModelSettings = {
    provider: "deepseek",
    model: "deepseek-chat",
    route: "primary",
  };
  let modelCalls = 0;
  const resolvedDefaults = [];
  promptExecution.setPromptRunnerLLMFactoryForTests(async () => {
    modelCalls += 1;
    resolvedDefaults.push({ ...defaultModelSettings });
    throw new Error("read projection must not resolve a model");
  });
  try {
    const firstDefaults = { ...defaultModelSettings };
    const first = await attempts.readModelAttemptRequest({ requestId, repository: originalRepository });

    Object.assign(defaultModelSettings, {
      provider: "openai",
      model: "gpt-4o-mini",
      route: "fallback",
    });
    const secondDefaults = { ...defaultModelSettings };
    const second = await attempts.readModelAttemptRequest({ requestId, repository: restartedRepository });

    assert.notDeepEqual(secondDefaults, firstDefaults);
    assert.deepEqual(second, first);
    assert.equal(modelCalls, 0);
    assert.deepEqual(resolvedDefaults, []);

    const unsafeRecord = {
      ...record,
      apiKey: "secret-key",
      promptText: "secret prompt",
      providerErrorBody: "secret provider response",
    };
    const redacted = await attempts.readModelAttemptRequest({
      requestId,
      repository: {
        reconstructRequest: async () => ({ requestId, attempts: [unsafeRecord], adoptedAttemptId: unsafeRecord.attemptId }),
      },
    });
    assert.equal(redacted.status, "found");
    assert.equal(JSON.stringify(redacted).includes("secret-key"), false);
    assert.equal(JSON.stringify(redacted).includes("secret prompt"), false);
    assert.equal(JSON.stringify(redacted).includes("secret provider response"), false);
  } finally {
    promptExecution.setPromptRunnerLLMFactoryForTests();
    attempts.setModelAttemptRepositoryForTests();
  }
});

test("chapter revision prompt receives explicit novel, chapter, and entrypoint", async () => {
  const optionsSeen = [];
  const service = new NovelChapterEditorService(
    {
      loadContext: async () => ({
        chapter: { id: "chapter-a", content: "alpha" },
        chapterPlan: { objective: "move the conflict" },
        chapterSummary: "summary",
        styleSummary: "restrained",
        latestStateSnapshot: null,
        macroContext: {
          chapterRoleInVolume: "opening",
          volumeTitle: "volume",
          volumePositionLabel: "1 / 1",
          volumePhaseLabel: "opening",
          paceDirective: "balanced",
          worldConstraintSummary: "none",
          previousChapterBridge: "none",
          nextChapterBridge: "none",
          activePlotThreads: [],
          characterStateSummary: "none",
          mustKeepConstraints: [],
          chapterMission: "move the conflict",
        },
      }),
    },
    async ({ options }) => {
      optionsSeen.push(options);
      return {
        output: {
          macroAlignmentNote: null,
          candidates: [
            { label: "A", content: "alpha one" },
            { label: "B", content: "alpha two" },
          ],
        },
      };
    },
  );
  await service.previewAiRevision("novel-a", "chapter-a", {
    source: "preset",
    scope: "chapter",
    presetOperation: "polish",
    contentSnapshot: "alpha",
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
  });
  assert.equal(optionsSeen.length, 1);
  assert.deepEqual(
    {
      novelId: optionsSeen[0].novelId,
      chapterId: optionsSeen[0].chapterId,
      entrypoint: optionsSeen[0].entrypoint,
    },
    { novelId: "novel-a", chapterId: "chapter-a", entrypoint: "ai-revision-preview" },
  );
});
