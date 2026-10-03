const test = require("node:test");
const assert = require("node:assert/strict");
const {
  creationIntentInterpretPrompt,
  creationDirectionReplacePrompt,
  requestedCreationDirectionCount,
} = require("../dist/prompting/prompts/creation/creationIntent.prompts");
const {
  matchesCurrentDirectionVersion,
  canClaimDirectionEdit,
  canClaimDirectionRegeneration,
  canRestorePriorDirections,
} = require("../dist/modules/novel/creation-studio/domain/directionIntentState");

function direction(index) {
  return {
    id: `direction-${index}`,
    title: `方向 ${index}`,
    premise: `主角以不同方式守住原始想法的核心目标 ${index}`,
    coreExperience: `体验 ${index}`,
    protagonist: `主角主动选择 ${index}`,
    centralConflict: `持续升级的阻力 ${index}`,
    endingPromise: `明确兑现结局 ${index}`,
    styleKeywords: ["推进清晰", "结尾完整"],
  };
}

function interpretation(directions) {
  return {
    understanding: "用户想写一个有明确目标与结局的故事。",
    recommendedNarrativeForm: "short_story",
    recommendedTargetWordCount: 8000,
    confidence: 0.8,
    recommendationReason: "核心冲突能在短篇内完成并收束。",
    recommendedWritingPlatform: "zhihu_story",
    writingPlatformConfidence: 0.8,
    writingPlatformReason: "短故事适合在该平台一次读完。",
    directions,
  };
}

test("interpretation accepts historical two directions and new four or six directions", () => {
  for (const count of [2, 4, 6]) {
    const output = creationIntentInterpretPrompt.outputSchema.parse(interpretation(Array.from({ length: count }, (_, index) => direction(index))));
    assert.equal(creationIntentInterpretPrompt.postValidate(output, { idea: "故事", directionCount: count }).directions.length, count);
  }
});

test("interpretation rejects duplicate direction identity and excess directions", () => {
  const duplicate = interpretation([direction(1), { ...direction(2), id: "direction-1" }]);
  assert.throws(() => creationIntentInterpretPrompt.postValidate(creationIntentInterpretPrompt.outputSchema.parse(duplicate), { idea: "故事" }));
  assert.equal(creationIntentInterpretPrompt.outputSchema.safeParse(interpretation(Array.from({ length: 7 }, (_, index) => direction(index)))).success, false);
});

test("single direction replacement prompt carries original idea, feedback and other directions", () => {
  const messages = creationDirectionReplacePrompt.render({
    idea: "守住最后一间书店",
    understanding: "主角要保护书店",
    targetWordCount: 8000,
    writingPlatform: "zhihu_story",
    currentDirection: direction(1),
    otherDirections: [direction(2)],
    feedback: "想要悬疑推进",
  });
  const content = messages.map((message) => message.content).join("\n");
  assert.match(content, /守住最后一间书店/);
  assert.match(content, /想要悬疑推进/);
  assert.match(content, /方向 2/);
  assert.equal(creationDirectionReplacePrompt.outputSchema.safeParse(direction(3)).success, true);
});

test("requested direction count stays aligned for derived long form and AI form changes", () => {
  const derived = { idea: "把短篇发展成长篇", preferredNarrativeForm: "long_novel", targetWordCount: 200000 };
  assert.equal(requestedCreationDirectionCount(derived, "short_story"), 2);
  assert.equal(requestedCreationDirectionCount({ idea: "短篇", preferredNarrativeForm: "short_story" }, "short_story"), 4);
  assert.equal(requestedCreationDirectionCount({ idea: "短篇", preferredNarrativeForm: "short_story", directionCount: 6 }, "short_story"), 6);
  assert.equal(requestedCreationDirectionCount({ idea: "短篇", preferredNarrativeForm: "short_story", directionCount: 6 }, "long_novel"), 2);
  const content = creationIntentInterpretPrompt.render(derived).map((message) => message.content).join("\n");
  assert.match(content, /创作方向数量：2/);
  assert.throws(() => creationIntentInterpretPrompt.postValidate(creationIntentInterpretPrompt.outputSchema.parse(interpretation([direction(1), direction(2)])), { idea: "短篇", directionCount: 4 }));
});

test("stale or missing direction versions cannot authorize a mutation", () => {
  assert.equal(matchesCurrentDirectionVersion("intent-2", "intent-2"), true);
  assert.equal(matchesCurrentDirectionVersion("intent-2", "intent-1"), false);
  assert.equal(matchesCurrentDirectionVersion("intent-2", ""), false);
  assert.equal(matchesCurrentDirectionVersion(undefined, "intent-2"), false);
  assert.equal(canClaimDirectionEdit({ currentIntentVersionId: "intent-2" }, "intent-2"), true);
  assert.equal(canClaimDirectionEdit({ currentIntentVersionId: "intent-2", directionConfirmationClaimed: true }, "intent-2"), false);
  assert.equal(canClaimDirectionEdit({ currentIntentVersionId: "intent-2" }, "intent-1"), false);
});

test("failed regeneration restores only the same task's active proposed directions", () => {
  const priorIntent = { id: "intent-1", workflowTaskId: "task-1", status: "proposed" };
  assert.equal(canRestorePriorDirections({ taskId: "task-1", currentIntentVersionId: "intent-1", priorIntent }), true);
  assert.equal(canRestorePriorDirections({ taskId: "task-1", currentIntentVersionId: "intent-2", priorIntent }), false);
  assert.equal(canRestorePriorDirections({ taskId: "task-2", currentIntentVersionId: "intent-1", priorIntent }), false);
  assert.equal(canRestorePriorDirections({ taskId: "task-1", currentIntentVersionId: "intent-1", priorIntent: { ...priorIntent, status: "superseded" } }), false);
  assert.equal(canRestorePriorDirections({ taskId: "task-1" }), false);
});

test("regeneration can claim waiting or failed tasks but never a confirmation or running task", () => {
  assert.equal(canClaimDirectionRegeneration({ status: "waiting_approval", hasConfirmation: false, novelId: null }), true);
  assert.equal(canClaimDirectionRegeneration({ status: "failed", hasConfirmation: false, novelId: null }), true);
  assert.equal(canClaimDirectionRegeneration({ status: "running", hasConfirmation: false, novelId: null }), false);
  assert.equal(canClaimDirectionRegeneration({ status: "waiting_approval", hasConfirmation: true, novelId: null }), false);
  assert.equal(canClaimDirectionRegeneration({ status: "waiting_approval", hasConfirmation: false, novelId: null, directionConfirmationClaimed: true }), false);
  assert.equal(canClaimDirectionRegeneration({ status: "waiting_approval", hasConfirmation: false, novelId: "novel-1" }), false);
});
