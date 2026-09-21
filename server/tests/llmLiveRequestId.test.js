const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { LlmLiveBroker } = require("../dist/platform/llm/live/LlmLiveBroker.js");

test("实况快照保留显式 requestId，供来源读取按请求隔离", () => {
  const broker = new LlmLiveBroker();
  const session = broker.begin({
    label: "章节正文",
    mode: "text",
    requestId: "request-a",
    provider: "openai",
    model: "gpt-primary",
  });
  const [snapshot] = broker.getSnapshots({ interactionId: session.interactionId });
  assert.equal(snapshot.context.requestId, "request-a");
});

test("四个现有实况入口都从 attempt request scope 显式传入 requestId", () => {
  const root = path.resolve(__dirname, "../src");
  const sources = [
    "prompting/core/promptRunner.ts",
    "prompting/core/execution/textPromptExecution.ts",
    "llm/structuredInvoke.ts",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  const occurrences = sources.reduce((count, source) => count + (source.match(/requestId: (?:requestState\?\.requestId|getModelAttemptRequestState\(\)\?\.requestId)/g) ?? []).length, 0);
  assert.equal(occurrences, 4);
});
