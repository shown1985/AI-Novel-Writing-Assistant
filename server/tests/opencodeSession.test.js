const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOpenCodeRequestHeaders,
  resolveOpenCodeSessionId,
} = require("../dist/llm/opencode/session.js");

test("OpenCode session header is stable for one conversation", () => {
  const first = buildOpenCodeRequestHeaders({
    provider: "deepseek",
    baseURL: "https://opencode.ai/zen/go/v1",
    sessionId: "conversation-1",
  });
  const second = buildOpenCodeRequestHeaders({
    provider: "deepseek",
    baseURL: "https://opencode.ai/zen/go/v1",
    sessionId: "conversation-1",
  });

  assert.deepEqual(first, second);
  assert.match(first["x-opencode-session"], /^ai-novel-[a-f0-9]{32}$/);
  assert.equal(first["user-agent"], "AI-Novel-Writing-Assistant/0.4.17");
});

test("different conversations receive different opaque session ids", () => {
  const first = resolveOpenCodeSessionId({
    provider: "deepseek",
    baseURL: "https://opencode.ai/zen/go/v1",
    sessionId: "conversation-1",
  });
  const second = resolveOpenCodeSessionId({
    provider: "deepseek",
    baseURL: "https://opencode.ai/zen/go/v1",
    sessionId: "conversation-2",
  });

  assert.notEqual(first, second);
  assert.match(first, /^ai-novel-[a-f0-9]{32}$/);
  assert.match(second, /^ai-novel-[a-f0-9]{32}$/);
});

test("non-OpenCode endpoints do not receive OpenCode headers", () => {
  assert.equal(buildOpenCodeRequestHeaders({
    provider: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    sessionId: "conversation-1",
  }), undefined);
});
