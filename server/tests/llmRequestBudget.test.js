const test = require("node:test");
const assert = require("node:assert/strict");
const {
  estimatePromptTokensFromChars,
  evaluateLlmRequestBudget,
  LlmRequestBudgetError,
} = require("../dist/llm/requestBudget.js");

test("request budget estimates rendered prompt tokens and preserves an explicit safety margin", () => {
  assert.equal(estimatePromptTokensFromChars(0), 0);
  assert.equal(estimatePromptTokensFromChars(9), 3);

  const budget = evaluateLlmRequestBudget({
    renderedPromptChars: 3_000,
    inputTokenLimit: 1_200,
    safetyMarginTokens: 200,
    maxTokens: 800,
  });

  assert.equal(budget.estimatedInputTokens, 750);
  assert.equal(budget.effectiveInputTokenLimit, 1_000);
  assert.equal(budget.requestedOutputTokens, 800);
  assert.equal(budget.estimatedTotalTokens, 1_550);
  assert.equal(budget.status, "ok");
  assert.equal(budget.utilization, 0.75);
});

test("request budget distinguishes near-limit and exceeded soft policies", () => {
  assert.equal(
    evaluateLlmRequestBudget({
      renderedPromptChars: 3_200,
      inputTokenLimit: 1_000,
      safetyMarginTokens: 0,
    }).status,
    "near_limit",
  );
  const exceeded = evaluateLlmRequestBudget({
    renderedPromptChars: 4_004,
    inputTokenLimit: 1_000,
    safetyMarginTokens: 0,
  });
  assert.equal(exceeded.status, "exceeds_limit");
  assert.throws(() => {
    throw new LlmRequestBudgetError(exceeded);
  }, /LLM_BUDGET.*超过本阶段输入预算/);
});

test("request budget remains unknown when no soft limit is configured", () => {
  const budget = evaluateLlmRequestBudget({
    renderedPromptChars: 4_004,
    maxTokens: 500,
  });
  assert.equal(budget.status, "unknown");
  assert.equal(budget.inputTokenLimit, null);
  assert.equal(budget.effectiveInputTokenLimit, null);
  assert.equal(budget.estimatedTotalTokens, 1_501);
});
