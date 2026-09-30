const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { WorldService } = require("../dist/services/world/WorldService.js");
const { resolveDirectorIdeaContext } = require("../dist/services/novel/director/idea/ideaContext.js");
const { marketRadarService } = require("../dist/modules/marketRadar/application/MarketRadarService.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { StructuredOutputError } = require("../dist/llm/structuredOutput.js");
const { NovelDirectorIdeaInspirationService } = require("../dist/services/novel/director/NovelDirectorIdeaInspirationService.js");
const { NovelDirectorIdeaConstellationService } = require("../dist/services/novel/director/idea/NovelDirectorIdeaConstellationService.js");

const base = { name: "云城", description: "云城旧约", structureJson: null, bindingSupportJson: null,
  axioms: "每次施法需要记忆", background: "旧港城", geography: "北岸", magicSystem: "记忆术",
  politics: null, factions: "议会", conflicts: "议会和行会争夺旧港" };

test("world planning reference reads structured and legacy content without mutation", async () => {
  const original = prisma.world.findUnique;
  let reads = 0;
  const longText = "潮汐".repeat(8_000);
  prisma.world.findUnique = async () => { reads++; return { ...base, structureJson: JSON.stringify({
    profile: { summary: "分裂的云城", coreConflict: "争夺潮汐核" },
    rules: { axioms: [
      { name: "记忆代价", summary: "每次施法失去记忆", boundary: "不能复原" },
      ...Array.from({ length: 40 }, (_, index) => ({ name: `规则${index}`, summary: longText })),
    ] },
    forces: [{ name: "潮汐议会", summary: "控制水闸", currentObjective: "占领旧港" }],
    locations: [{ name: "旧港", summary: "潮汐入口", risk: "海啸" }],
  }) }; };
  try {
    const structured = await new WorldService().getPlanningReference("world-a");
    assert.match(structured, /记忆代价/);
    assert.match(structured, /潮汐议会/);
    assert.match(structured, /旧港/);
    assert.ok(structured.length <= 9000);
    assert.ok(longText.length > 9000, "oversized fixture exercises the cap");
    assert.ok(structured.length < longText.length);
    prisma.world.findUnique = async () => { reads++; return base; };
    const legacy = await new WorldService().getPlanningReference("world-b");
    assert.match(legacy, /议会和行会争夺旧港/);
    assert.match(legacy, /每次施法需要记忆/);
    prisma.world.findUnique = async () => { reads++; return null; };
    await assert.rejects(() => new WorldService().getPlanningReference("missing"), (error) => error.statusCode === 404);
    assert.equal(reads, 3);
  } finally { prisma.world.findUnique = original; }
});

test("blank world avoids lookup and inspiration retry keeps one world snapshot", async () => {
  const oldFind = prisma.world.findUnique;
  const oldBrief = marketRadarService.getBriefPromptBlock;
  const oldPrompt = promptRunner.runStructuredPrompt;
  let reads = 0;
  const contexts = [];
  prisma.world.findUnique = async () => { reads++; return base; };
  marketRadarService.getBriefPromptBlock = async () => "";
  promptRunner.runStructuredPrompt = async (request) => {
    contexts.push(request.promptInput.contextSummary);
    if (contexts.length === 1) throw new StructuredOutputError({ message: "bad shape", category: "schema_mismatch", diagnostics: {} });
    return { output: { ideas: [{ angle: "爽点强钩子", text: "旧港开局", tags: ["旧港"] }] } };
  };
  try {
    const blank = await resolveDirectorIdeaContext({ worldId: "" });
    assert.doesNotMatch(blank, /选定世界样本/);
    assert.equal(reads, 0);
    const result = await new NovelDirectorIdeaInspirationService().generate({ worldId: "world-a" });
    assert.equal(result.ideas[0].text, "旧港开局");
    assert.equal(reads, 1);
    assert.deepEqual(contexts[0], contexts[1]);
    assert.match(contexts[0], /议会和行会争夺旧港/);
  } finally {
    prisma.world.findUnique = oldFind;
    marketRadarService.getBriefPromptBlock = oldBrief;
    promptRunner.runStructuredPrompt = oldPrompt;
  }
});

test("constellation options and compose use selected world content", async () => {
  const oldFind = prisma.world.findUnique;
  const oldBrief = marketRadarService.getBriefPromptBlock;
  const oldPrompt = promptRunner.runStructuredPrompt;
  const contexts = [];
  prisma.world.findUnique = async () => base;
  marketRadarService.getBriefPromptBlock = async () => "";
  promptRunner.runStructuredPrompt = async (request) => {
    contexts.push(request.promptInput.contextSummary);
    return request.asset.id.endsWith("_options")
      ? { output: { options: [] } }
      : { output: { idea: "旧港开局" } };
  };
  try {
    const service = new NovelDirectorIdeaConstellationService();
    await service.generateOptions({ worldId: "world-a" });
    await service.compose({ worldId: "world-a", selectedOptions: [] });
    assert.equal(contexts.length, 2);
    assert.ok(contexts.every((context) => context.includes("议会和行会争夺旧港")));
  } finally {
    prisma.world.findUnique = oldFind;
    marketRadarService.getBriefPromptBlock = oldBrief;
    promptRunner.runStructuredPrompt = oldPrompt;
  }
});

test("missing selected world stops every creative entry before model or task mutation", async () => {
  const { NovelDirectorCandidateStageService } = require("../dist/services/novel/director/phases/novelDirectorCandidateStage.js");
  const { novelCreateResourceRecommendationService } = require("../dist/services/novel/NovelCreateResourceRecommendationService.js");
  const { titleGenerationService } = require("../dist/services/title/TitleGenerationService.js");
  const oldFind = prisma.world.findUnique;
  const oldResolve = novelCreateResourceRecommendationService.resolveRequired;
  const oldTitle = titleGenerationService.generateTitleIdeas;
  const oldPrompt = promptRunner.runStructuredPrompt;
  const oldBrief = marketRadarService.getBriefPromptBlock;
  let sideEffects = 0;
  const forbidden = async () => { sideEffects++; throw new Error("model or task reached"); };
  prisma.world.findUnique = async () => null;
  novelCreateResourceRecommendationService.resolveRequired = forbidden;
  titleGenerationService.generateTitleIdeas = forbidden;
  promptRunner.runStructuredPrompt = forbidden;
  marketRadarService.getBriefPromptBlock = async () => "";
  try {
    const workflow = {
      bootstrapTask: forbidden,
      markTaskRunning: forbidden,
      recordCandidateSelectionRequired: forbidden,
    };
    const candidates = new NovelDirectorCandidateStageService(workflow);
    const constellation = new NovelDirectorIdeaConstellationService();
    const input = { worldId: "missing", idea: "开局", workflowTaskId: "task-a" };
    const calls = [
      () => candidates.generateCandidates(input),
      () => candidates.refineCandidates(input),
      () => candidates.patchCandidate(input),
      () => candidates.refineCandidateTitleOptions(input),
      () => new NovelDirectorIdeaInspirationService().generate(input),
      () => constellation.generateOptions(input),
      () => constellation.compose({ ...input, selectedOptions: [] }),
    ];
    for (const call of calls) {
      await assert.rejects(call, (error) => error.statusCode === 404);
    }
    assert.equal(sideEffects, 0);
  } finally {
    prisma.world.findUnique = oldFind;
    novelCreateResourceRecommendationService.resolveRequired = oldResolve;
    titleGenerationService.generateTitleIdeas = oldTitle;
    promptRunner.runStructuredPrompt = oldPrompt;
    marketRadarService.getBriefPromptBlock = oldBrief;
  }
});
