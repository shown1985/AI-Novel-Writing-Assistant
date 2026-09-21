import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLlmSourceSummaryModel,
  attemptResultLabel,
} from "./llmSourceSummaryModel.ts";
import { createLlmProvenanceRequestGuard } from "../../hooks/llmAttemptProvenanceGuard.ts";

const testDir = dirname(fileURLToPath(import.meta.url));

const baseAttempt = (overrides = {}) => ({
  attemptId: "attempt-0",
  parentAttemptId: null,
  attemptIndex: 0,
  role: "primary",
  routeTier: "primary",
  status: "failed",
  finalAdoption: "not_adopted",
  provider: "openai",
  model: "gpt-primary",
  failureCode: "transport_error",
  failureCategory: "transport",
  retryable: true,
  startedAt: "2026-09-20T00:00:00.000Z",
  finishedAt: "2026-09-20T00:00:01.000Z",
  durationMs: 1000,
  ...overrides,
});

test("实况来源摘要区分预计、实际和备用采用结果", () => {
  const model = buildLlmSourceSummaryModel({
    expectedProvider: "openai",
    expectedModel: "gpt-primary",
    requestId: "request-1",
    provenance: {
      status: "found",
      requestId: "request-1",
      attributionStatus: "complete",
      adoptedAttemptId: "attempt-1",
      attempts: [
        baseAttempt(),
        baseAttempt({
          attemptId: "attempt-1",
          parentAttemptId: "attempt-0",
          attemptIndex: 1,
          role: "fallback",
          routeTier: "fallback",
          status: "succeeded",
          finalAdoption: "adopted",
          provider: "deepseek",
          model: "deepseek-chat",
          failureCode: null,
          failureCategory: null,
          retryable: null,
        }),
      ],
    },
  });

  assert.equal(model.expected, "openai / gpt-primary");
  assert.equal(model.actual, "deepseek / deepseek-chat");
  assert.equal(model.hasFallback, true);
  assert.equal(model.showDetails, true);
  assert.equal(attemptResultLabel(model.attempts[0]), "失败 · 连接问题");
  assert.equal(attemptResultLabel(model.attempts[1]), "已采用");

  const partial = buildLlmSourceSummaryModel({
    requestId: "request-partial",
    provenance: {
      status: "found",
      requestId: "request-partial",
      attributionStatus: "partial",
      adoptedAttemptId: null,
      attempts: [baseAttempt({ status: "succeeded", failure: null })],
    },
  });
  assert.equal(partial.actual, "未记录");
  assert.match(partial.note, /未标记实际采用模型/);
  assert.match(partial.note, /来源归因信息不完整/);

  const unattributed = buildLlmSourceSummaryModel({
    requestId: "request-unattributed",
    provenance: {
      status: "found",
      requestId: "request-unattributed",
      attributionStatus: "unattributed",
      adoptedAttemptId: null,
      attempts: [baseAttempt({ status: "succeeded", failure: null })],
    },
  });
  assert.equal(unattributed.actual, "未记录");
  assert.match(unattributed.note, /未标记实际采用模型/);
  assert.match(unattributed.note, /未能关联到具体创作来源/);
  assert.notEqual(partial.note, unattributed.note);
});

test("没有 requestId、未找到和读取失败不猜测实际模型", () => {
  const noRequest = buildLlmSourceSummaryModel({ expectedProvider: "openai", expectedModel: "gpt-primary" });
  assert.equal(noRequest.actual, "等待本次调用记录");
  assert.match(noRequest.note, /实际调用可能变化/);

  const notFound = buildLlmSourceSummaryModel({
    expectedProvider: "openai",
    expectedModel: "gpt-primary",
    requestId: "missing",
    provenance: {
      status: "not_found",
      requestId: "missing",
      attributionStatus: "unattributed",
      adoptedAttemptId: null,
      attempts: [],
    },
  });
  assert.equal(notFound.actual, "未记录");
  assert.match(notFound.note, /不能把预计模型当作实际模型/);

  const readError = buildLlmSourceSummaryModel({ requestId: "failed", readError: true });
  assert.equal(readError.actual, "无法确认（读取失败）");
});

test("切换 requestId 后迟到响应的 token 不再是当前请求", () => {
  const guard = createLlmProvenanceRequestGuard();
  const first = guard.begin("request-a");
  const second = guard.begin("request-b");
  assert.equal(guard.isCurrent(first, "request-a"), false);
  assert.equal(guard.isCurrent(second, "request-b"), true);
});

test("实况旧路由文案明确标为预计，不冒充实际调用", () => {
  const source = readFileSync(join(testDir, "../liveExecution/LiveExecutionDialog.tsx"), "utf8");
  assert.match(source, /title=\{`预计路由：厂商 \$\{provider\}，模型 \$\{model\}`\}/);
  assert.match(source, /预计使用：厂商/);
  assert.doesNotMatch(source, /title=\{`本次调用：厂商/);
});
