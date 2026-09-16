const fs = require("node:fs");
const path = require("node:path");

function readFixture() {
  const fixturePath = process.env.R1_02_FIXTURE_PATH;
  if (!fixturePath) throw new Error("R1_02_FIXTURE_PATH is required");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function score(overrides = {}) {
  return {
    coherence: 88,
    repetition: 86,
    pacing: 84,
    voice: 82,
    engagement: 87,
    overall: 86,
    ...overrides,
  };
}

async function main() {
  const fixture = readFixture();
  const repoRoot = path.resolve(__dirname, "..", "..");
  const fromDist = (...segments) => require(path.join(repoRoot, "server", "dist", ...segments));

  global.prisma = undefined;
  let blockedNetworkCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    blockedNetworkCalls += 1;
    throw new Error("R1-02 deterministic regression forbids network access");
  };

  const { prisma } = fromDist("db", "prisma.js");
  const { ragServices } = fromDist("services", "rag", "index.js");
  const { NovelCoreCrudService } = fromDist("services", "novel", "novelCoreCrudService.js");
  const { NovelCoreCharacterService } = fromDist("services", "novel", "novelCoreCharacterService.js");
  const { NovelCorePipelineService } = fromDist("services", "novel", "novelCorePipelineService.js");
  const { NovelPipelineExecutor } = fromDist("services", "novel", "production", "NovelPipelineExecutor.js");
  const {
    buildChapterArtifactContentHash,
    CHAPTER_ARTIFACT_BOUNDARY_TYPE,
  } = fromDist("services", "novel", "runtime", "artifactSync", "index.js");
  const { WorldService } = fromDist("services", "world", "WorldService.js");
  const { NovelExportService } = fromDist("modules", "export", "novelExport.service.js");

  const originalRagUpsert = ragServices.ragIndexService.enqueueUpsert;
  const originalRagDelete = ragServices.ragIndexService.enqueueDelete;
  ragServices.ragIndexService.enqueueUpsert = async () => ({ id: "r1-02-noop-upsert" });
  ragServices.ragIndexService.enqueueDelete = async () => ({ id: "r1-02-noop-delete" });

  const mockCallOrders = [];
  let interruptionInjected = false;
  const mockCoordinator = {
    async runPipelineChapter(novelId, chapterId) {
      const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
      if (!chapter) throw new Error(`fixture chapter missing: ${chapterId}`);
      mockCallOrders.push(chapter.order);

      if (!interruptionInjected && chapter.order === fixture.interruption.chapterOrder) {
        interruptionInjected = true;
        const error = new Error("R1-02 scripted model interruption");
        error.status = 402;
        throw error;
      }

      const expected = fixture.chapters.find((item) => item.order === chapter.order);
      if (!expected) throw new Error(`fixture content missing for chapter ${chapter.order}`);
      const contentHash = buildChapterArtifactContentHash(expected.content);
      await prisma.$transaction([
        prisma.chapter.update({
          where: { id: chapter.id },
          data: {
            title: expected.title,
            content: expected.content,
            generationState: "drafted",
            chapterStatus: "generating",
          },
        }),
        prisma.chapterArtifactSyncCheckpoint.upsert({
          where: {
            novelId_chapterId_contentHash_artifactType_syncMode: {
              novelId,
              chapterId: chapter.id,
              contentHash,
              artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE,
              syncMode: "adaptive",
            },
          },
          update: {
            status: "succeeded",
            metadataJson: JSON.stringify({ outcome: "completed", fixtureId: fixture.fixtureId }),
          },
          create: {
            novelId,
            chapterId: chapter.id,
            contentHash,
            artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE,
            syncMode: "adaptive",
            status: "succeeded",
            sourceType: "deterministic_mock",
            sourceStage: "r1_02_baseline",
            metadataJson: JSON.stringify({ outcome: "completed", fixtureId: fixture.fixtureId }),
          },
        }),
      ]);

      const carriesQualityDebt = chapter.order === fixture.qualityDebt.chapterOrder;
      return {
        retryCountUsed: carriesQualityDebt ? 1 : 0,
        score: carriesQualityDebt
          ? score({ coherence: 72, pacing: 70, engagement: 69, overall: 71 })
          : score(),
        issues: carriesQualityDebt
          ? [{
              severity: "medium",
              category: "pacing",
              evidence: "供电代价与救援选择的因果承接偏快",
              fixSuggestion: "后续修订时补足代价兑现，但不阻断连续产出",
            }]
          : [],
        pass: !carriesQualityDebt,
        reviewExecuted: true,
        qualityDebtAttribution: carriesQualityDebt
          ? {
              firstFailureIssueCodes: [fixture.qualityDebt.issueCode],
              secondFailureIssueCodes: [fixture.qualityDebt.issueCode],
              repairAttemptsUsed: 1,
              repairAttemptsAllowed: 1,
            }
          : undefined,
      };
    },
  };
  const automaticAttempts = {
    async used() { return 0; },
    async claim() { return true; },
  };

  try {
    const world = await prisma.world.create({
      data: {
        name: "零点地铁世界",
        description: "停电时出现的隐藏线路会以乘客记忆维持城市供电。",
        worldType: "都市轻科幻悬疑",
        conflicts: "林澈必须查明零点列车的运行规则。",
      },
    });

    const crud = new NovelCoreCrudService();
    const novel = await crud.createNovel({
      title: fixture.book.title,
      description: fixture.book.description,
      targetAudience: fixture.book.targetAudience,
      bookSellingPoint: fixture.book.bookSellingPoint,
      estimatedChapterCount: fixture.book.estimatedChapterCount,
      worldId: world.id,
      writingMode: "original",
      projectMode: "ai_led",
      creationExperience: "simple",
      narrativeForm: "long_novel",
      narrativePov: "third_person",
      pacePreference: "fast",
      emotionIntensity: "medium",
      aiFreedom: "medium",
    });

    const characterService = new NovelCoreCharacterService();
    const character = await characterService.createCharacter(novel.id, {
      name: fixture.characterUpdate.name,
      role: "主角",
      gender: "male",
      currentState: "第一次独自承担停电夜班",
      currentGoal: "找回末班车上的失踪乘客",
    });

    await prisma.novelWorkflowTask.create({
      data: {
        id: fixture.directorPreparation.workflowTaskId,
        novelId: novel.id,
        lane: "auto_director",
        title: "R1-02 第一本书导演准备",
        status: "succeeded",
        progress: 1,
        currentStage: "ready",
        checkpointType: fixture.directorPreparation.checkpointType,
        checkpointSummary: fixture.directorPreparation.checkpointSummary,
        finishedAt: new Date(),
        seedPayloadJson: JSON.stringify({
          fixtureId: fixture.fixtureId,
          executionMode: fixture.execution.regressionMode,
          idea: fixture.idea,
        }),
      },
    });
    await prisma.novelIntentVersion.create({
      data: {
        novelId: novel.id,
        workflowTaskId: fixture.directorPreparation.workflowTaskId,
        version: 1,
        status: "accepted",
        source: "initial",
        originalExpression: fixture.idea,
        structuredIntentJson: JSON.stringify({ title: fixture.book.title, premise: fixture.idea }),
      },
    });
    await prisma.storyMacroPlan.create({
      data: {
        novelId: novel.id,
        storyInput: fixture.idea,
        expansionJson: JSON.stringify({ expanded_premise: fixture.book.description }),
        decompositionJson: JSON.stringify({
          core_conflict: "救回失踪乘客与维持城市供电之间的冲突",
          progression_loop: "追踪异常 -> 保存证据 -> 揭示一层记忆交易",
        }),
        issuesJson: "[]",
        lockedFieldsJson: "{}",
        constraintEngineJson: JSON.stringify({ hard_constraints: ["不能静默丢失已保存正文"] }),
        stateJson: JSON.stringify({ currentPhase: 1, progress: 1 }),
      },
    });
    await prisma.bookContract.create({
      data: {
        novelId: novel.id,
        readingPromise: "连续十夜揭开零点列车与城市供电的交易。",
        protagonistFantasy: "普通检修员用专业判断拆穿城市秘密。",
        coreSellingPoint: fixture.book.bookSellingPoint,
        chapter3Payoff: "确认停电与零点列车存在稳定关联。",
        chapter10Payoff: "停止记忆交易并救回失踪乘客。",
        chapter30Payoff: "本基线只覆盖十章，不提前承诺三十章结果。",
        escalationLadder: "异常列车 -> 记忆票据 -> 供电交易 -> 全城抉择",
        relationshipMainline: "林澈与愿意相信他的同伴共同查证。",
        absoluteRedLinesJson: JSON.stringify(["不覆盖已保存正文", "局部质量债不误停整书"]),
      },
    });
    await prisma.chapter.createMany({
      data: fixture.chapters.map((chapter) => ({
        novelId: novel.id,
        order: chapter.order,
        title: chapter.title,
        content: "",
        generationState: "planned",
        chapterStatus: "unplanned",
        targetWordCount: 1200,
        expectation: `完成第 ${chapter.order} 夜的调查推进`,
      })),
    });
    const [persistedIntent, persistedDirectorTask] = await Promise.all([
      prisma.novelIntentVersion.findFirst({
        where: { workflowTaskId: fixture.directorPreparation.workflowTaskId, version: 1 },
      }),
      prisma.novelWorkflowTask.findUnique({
        where: { id: fixture.directorPreparation.workflowTaskId },
      }),
    ]);

    const pipelineService = new NovelCorePipelineService();
    const scheduled = [];
    pipelineService.schedulePipelineExecution = (jobId, scheduledNovelId, options) => {
      scheduled.push({ jobId, novelId: scheduledNovelId, options });
    };
    const pipelineOptions = {
      startOrder: 1,
      endOrder: 10,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
      artifactSyncMode: "adaptive",
      maxRetries: 1,
      provider: fixture.execution.provider,
      model: fixture.execution.model,
      temperature: 0,
      issueGovernanceVersion: 1,
      issuePolicySnapshot: {
        maxAutomaticRetries: 1,
        issueActions: {
          "runtime.model_unavailable": "auto_retry",
          "quality.chapter_below_threshold": "continue_with_warning"
        },
      },
    };
    const initialJob = await pipelineService.startPipelineJob(novel.id, pipelineOptions);
    const executor = new NovelPipelineExecutor(mockCoordinator, automaticAttempts);
    await executor.execute(initialJob.id, novel.id, scheduled.shift().options);

    const interruptedJob = await prisma.generationJob.findUnique({ where: { id: initialJob.id } });
    const savedBeforeRecovery = await prisma.chapter.findMany({
      where: { novelId: novel.id, content: { not: "" } },
      orderBy: { order: "asc" },
      select: { order: true, content: true },
    });
    const beforeRecoveryHashes = Object.fromEntries(savedBeforeRecovery.map((chapter) => [
      chapter.order,
      buildChapterArtifactContentHash(chapter.content ?? ""),
    ]));

    await pipelineService.resumePipelineJob(initialJob.id);
    const resumed = scheduled.shift();
    if (!resumed) throw new Error("resumePipelineJob did not schedule deterministic recovery");
    await executor.execute(initialJob.id, novel.id, resumed.options);

    const completedJob = await prisma.generationJob.findUnique({ where: { id: initialJob.id } });
    const chapters = await prisma.chapter.findMany({
      where: { novelId: novel.id },
      orderBy: { order: "asc" },
      include: {
        artifactSyncCheckpoints: {
          where: { artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded" },
        },
      },
    });
    const afterRecoveryHashes = Object.fromEntries(chapters.map((chapter) => [
      chapter.order,
      buildChapterArtifactContentHash(chapter.content ?? ""),
    ]));
    const debtChapter = chapters.find((chapter) => chapter.order === fixture.qualityDebt.chapterOrder);

    const worldService = new WorldService();
    await worldService.updateWorld(world.id, { [fixture.worldUpdate.field]: fixture.worldUpdate.value });
    await characterService.updateCharacter(novel.id, character.id, {
      currentState: fixture.characterUpdate.currentState,
      currentGoal: fixture.characterUpdate.currentGoal,
    });
    const [updatedWorld, updatedCharacter] = await Promise.all([
      prisma.world.findUnique({ where: { id: world.id } }),
      prisma.character.findUnique({ where: { id: character.id } }),
    ]);

    const exported = await new NovelExportService().buildExportContent(novel.id, "txt");
    const qualityReports = await prisma.qualityReport.count({ where: { novelId: novel.id } });
    const artifactCheckpointCount = chapters.reduce(
      (sum, chapter) => sum + chapter.artifactSyncCheckpoints.length,
      0,
    );

    console.log(JSON.stringify({
      fixtureId: fixture.fixtureId,
      novelId: novel.id,
      intentStatus: persistedIntent?.status ?? null,
      intentExpression: persistedIntent?.originalExpression ?? null,
      directorTaskStatus: persistedDirectorTask?.status ?? null,
      directorCheckpointType: persistedDirectorTask?.checkpointType ?? null,
      interruptedJob: {
        status: interruptedJob?.status ?? null,
        pendingManualRecovery: interruptedJob?.pendingManualRecovery ?? null,
        completedCount: interruptedJob?.completedCount ?? null,
      },
      completedJob: {
        status: completedJob?.status ?? null,
        pendingManualRecovery: completedJob?.pendingManualRecovery ?? null,
        completedCount: completedJob?.completedCount ?? null,
        totalCount: completedJob?.totalCount ?? null,
        payload: completedJob?.payload ? JSON.parse(completedJob.payload) : null,
      },
      savedBeforeRecoveryOrders: savedBeforeRecovery.map((chapter) => chapter.order),
      beforeRecoveryHashes,
      afterRecoveryHashes,
      chapterOrders: chapters.map((chapter) => chapter.order),
      chapterContents: chapters.map((chapter) => chapter.content),
      artifactCheckpointCount,
      mockCallOrders,
      debtRiskFlags: debtChapter?.riskFlags ? JSON.parse(debtChapter.riskFlags) : null,
      qualityReports,
      worldValue: updatedWorld?.[fixture.worldUpdate.field] ?? null,
      characterState: updatedCharacter?.currentState ?? null,
      characterGoal: updatedCharacter?.currentGoal ?? null,
      export: {
        contentType: exported.contentType,
        fileName: exported.fileName,
        content: exported.content,
      },
      modelNetworkAttempts: blockedNetworkCalls,
    }));
  } finally {
    ragServices.ragIndexService.enqueueUpsert = originalRagUpsert;
    ragServices.ragIndexService.enqueueDelete = originalRagDelete;
    global.fetch = originalFetch;
    await prisma.$disconnect();
    global.prisma = undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
