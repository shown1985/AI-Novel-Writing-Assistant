const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLlmRequestCapabilities } = require("../dist/llm/requestCapabilities.js");
const { evaluateLlmRequestBudget } = require("../dist/llm/requestBudget.js");

test("request capabilities keep explicit limits and redact endpoint query data", () => {
  const capabilities = resolveLlmRequestCapabilities({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    baseURL: "https://api.deepseek.com/v1?api_key=secret-value",
    inputTokenLimit: 4_000,
  });

  assert.equal(capabilities.inputTokenLimit, 4_000);
  assert.equal(capabilities.inputTokenLimitSource, "explicit");
  assert.equal(capabilities.outputTokenLimit, 8_192);
  assert.equal(capabilities.outputTokenLimitSource, "provider_default");
  assert.equal(capabilities.endpoint, "https://api.deepseek.com/v1");
  assert.doesNotMatch(capabilities.capabilityKey, /secret-value/);
  assert.equal(capabilities.supportsJsonObject, true);
});

test("OpenCode Go capability shares the common contract without spoofing identity", () => {
  const capabilities = resolveLlmRequestCapabilities({
    provider: "opencode",
    model: "glm-5.3-flash",
    baseURL: "https://opencode.ai/zen/go/v1?token=secret-value",
  });

  assert.equal(capabilities.inputTokenLimit, null);
  assert.equal(capabilities.inputTokenLimitSource, "unknown");
  assert.equal(capabilities.outputTokenLimit, null);
  assert.equal(capabilities.outputTokenLimitSource, "unknown");
  assert.equal(capabilities.endpoint, "https://opencode.ai/zen/go/v1");
  assert.equal(capabilities.supportsReasoningEffort, true);
  assert.doesNotMatch(capabilities.capabilityKey, /secret-value/);
});

test("budget snapshot reports provider output limits without changing observe semantics", () => {
  const budget = evaluateLlmRequestBudget({
    renderedPromptChars: 2_000,
    inputTokenLimit: 1_000,
    safetyMarginTokens: 0,
    maxTokens: 9_000,
    provider: "deepseek",
    model: "deepseek-v4-flash",
  });

  assert.equal(budget.status, "ok");
  assert.equal(budget.inputTokenLimitSource, "explicit");
  assert.equal(budget.outputTokenLimit, 8_192);
  assert.equal(budget.outputLimitExceeded, true);
  assert.match(budget.capabilityKey, /^deepseek\|deepseek-v4-flash\|/);
});
