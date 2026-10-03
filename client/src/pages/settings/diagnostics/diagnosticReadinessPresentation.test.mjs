import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DIAGNOSTIC_POLL_INTERVAL_MS,
  formatDiagnosticTargetStatus,
  getDiagnosticPollingInterval,
  isDiagnosticBlockingCreation,
  resolveDiagnosticTargetState,
  resolveDiagnosticUiState,
  summarizeDiagnosticTargets,
} from "./diagnosticReadinessPresentation.ts";
import {
  createDiagnosticReadQueryPolicy,
  createExplicitDiagnosticCheckController,
  refreshDiagnosticReadinessAfterCheck,
  resetDiagnosticReadinessAfterConfigurationChange,
} from "./diagnosticReadinessBehavior.ts";
import { resolveSettingsReadinessDecision } from "./settingsReadinessPolicy.ts";

const now = Date.parse("2026-09-18T08:00:00.000Z");

function target(checkState = "not_checked", targetId = "model-route:writer") {
  return {
    targetId,
    targetKind: "model_route",
    taskType: "writer",
    provider: "mock",
    model: "mock-model",
    checkState,
    checkedAt: checkState === "not_checked" ? null : "2026-09-18T07:55:00.000Z",
    errorSummary: checkState === "failed" ? "连接设置需要检查。" : null,
    capabilities: [{
      capability: "plain",
      checkState,
      latencyMs: checkState === "healthy" ? 12 : null,
      errorSummary: checkState === "failed" ? "连接设置需要检查。" : null,
      requestProtocol: "openai_compatible",
      structuredDetails: null,
    }],
    recommendation: null,
    revision: 1,
  };
}

function report(checkState = "not_checked", overrides = {}) {
  return {
    diagnosticId: checkState === "not_checked" ? null : "diagnostic-1",
    scope: "model_routes",
    checkState,
    checkedAt: checkState === "not_checked" ? null : "2026-09-18T07:55:00.000Z",
    configurationFingerprint: "opaque-fingerprint",
    targets: [target(checkState)],
    ...overrides,
  };
}

test("diagnostic UI keeps loading, read error, unknown, stale, failed and healthy distinct", () => {
  assert.equal(resolveDiagnosticUiState({ isLoading: true }), "loading");
  assert.equal(resolveDiagnosticUiState({ isError: true, report: report("healthy") }), "error");
  assert.equal(resolveDiagnosticUiState({ report: report("not_checked") }), "not_checked");
  assert.equal(resolveDiagnosticUiState({ report: report("stale") }), "stale");
  assert.equal(resolveDiagnosticUiState({ report: report("failed") }), "failed");
  assert.equal(resolveDiagnosticUiState({ report: report("healthy") }), "healthy");
  assert.equal(resolveDiagnosticUiState({ report: report("healthy"), isRefreshing: true }), "loading");
  assert.equal(isDiagnosticBlockingCreation("failed"), true);
  for (const state of ["not_checked", "stale", "loading", "error", "pending", "healthy"]) {
    assert.equal(isDiagnosticBlockingCreation(state), false, `${state} must remain advisory`);
  }
});

test("active pending takes precedence, polls for a bounded lease, and expires locally", () => {
  const pendingReport = report("healthy", {
    pending: {
      diagnosticId: "diagnostic-pending",
      startedAt: "2026-09-18T07:59:00.000Z",
      expiresAt: "2026-09-18T08:01:00.000Z",
    },
  });
  assert.equal(resolveDiagnosticUiState({ report: pendingReport, now }), "pending");
  assert.equal(resolveDiagnosticUiState({ report: pendingReport, isRefreshing: true, now }), "pending");
  assert.equal(getDiagnosticPollingInterval(pendingReport, now), DIAGNOSTIC_POLL_INTERVAL_MS);
  assert.equal(resolveDiagnosticUiState({ report: pendingReport, now: now + 61_000 }), "healthy");
  assert.equal(getDiagnosticPollingInterval(pendingReport, now + 61_000), false);
});

test("a GET read error takes precedence over cached remote pending", () => {
  const pendingReport = report("healthy", {
    pending: {
      diagnosticId: "diagnostic-pending",
      startedAt: "2026-09-18T07:59:00.000Z",
      expiresAt: "2026-09-18T08:01:00.000Z",
    },
  });
  assert.equal(resolveDiagnosticUiState({ report: pendingReport, isError: true, now }), "error");
  assert.equal(
    resolveDiagnosticUiState({ report: pendingReport, isError: true, isChecking: true, now }),
    "pending",
  );
});

test("an explicit check pending state cannot be mistaken for a passive query load", () => {
  assert.equal(resolveDiagnosticUiState({ report: report("stale"), isChecking: true }), "pending");
  assert.equal(resolveDiagnosticUiState({ report: report("stale"), isChecking: true, isError: true }), "pending");
  assert.equal(resolveDiagnosticTargetState(target("stale"), "pending"), "pending");
  assert.equal(resolveDiagnosticTargetState(target("stale"), "stale"), "stale");
});

test("passive entry and focus reads stay GET-only while explicit checks coalesce", async () => {
  let readCount = 0;
  let checkCount = 0;
  let finishCheck;
  const readPolicy = createDiagnosticReadQueryPolicy(async () => {
    readCount += 1;
    return { success: true, data: report("not_checked") };
  });
  const checkController = createExplicitDiagnosticCheckController(async () => {
    checkCount += 1;
    await new Promise((resolve) => {
      finishCheck = resolve;
    });
    return report("healthy");
  });

  await readPolicy.queryFn();
  await readPolicy.queryFn();
  assert.equal(readPolicy.refetchOnWindowFocus, true);
  assert.equal(readCount, 2);
  assert.equal(checkCount, 0);

  const firstCheck = checkController.run();
  const duplicateCheck = checkController.run();
  await Promise.resolve();
  assert.equal(firstCheck, duplicateCheck);
  assert.equal(checkCount, 1);
  assert.equal(checkController.isPending(), true);
  finishCheck();
  await firstCheck;
  assert.equal(checkController.isPending(), false);
});

test("configuration reset and a late POST completion keep the current fingerprint authoritative", async () => {
  const oldReport = report("healthy", { configurationFingerprint: "old-fingerprint" });
  const currentReport = report("not_checked", { configurationFingerprint: "new-fingerprint" });
  let visibleReport = oldReport;
  let finishCheck;
  const calls = [];
  const queryCache = {
    async resetQueries(filters) {
      calls.push(["reset", filters]);
      visibleReport = null;
    },
    async invalidateQueries(filters) {
      calls.push(["invalidate", filters]);
      visibleReport = currentReport;
    },
  };
  const checkController = createExplicitDiagnosticCheckController(async () =>
    new Promise((resolve) => {
      finishCheck = () => resolve(oldReport);
    }));

  const lateCheck = checkController.run();
  await Promise.resolve();
  await resetDiagnosticReadinessAfterConfigurationChange(queryCache, ["readiness"]);
  assert.equal(visibleReport, null);
  finishCheck();
  await lateCheck;
  await refreshDiagnosticReadinessAfterCheck(queryCache, ["readiness"]);

  assert.equal(visibleReport.configurationFingerprint, "new-fingerprint");
  assert.deepEqual(calls.map(([kind]) => kind), ["reset", "invalidate"]);
});

test("creation decision keeps read errors and style enhancement warnings advisory", () => {
  const routeReadError = resolveSettingsReadinessDecision([
    { key: "model", state: "ready" },
    { key: "routes", state: "error" },
    { key: "rag", state: "optional" },
    { key: "style", state: "optional" },
  ]);
  assert.equal(routeReadError.canStart, true);
  assert.deepEqual(routeReadError.primaryAction, { label: "开始创建小说", to: "/novels/create" });

  const failedRoute = resolveSettingsReadinessDecision([
    { key: "model", state: "ready" },
    { key: "routes", state: "failed" },
    { key: "rag", state: "optional" },
    { key: "style", state: "optional" },
  ]);
  assert.equal(failedRoute.canStart, false);
  assert.deepEqual(failedRoute.primaryAction, { label: "查看模型路由", to: "/settings/model-routes" });
});

test("target summaries and details use checkState rather than legacy ok booleans", () => {
  assert.deepEqual(
    summarizeDiagnosticTargets([
      target("not_checked", "one"),
      target("healthy", "two"),
      target("failed", "three"),
      target("stale", "four"),
    ]),
    { not_checked: 1, healthy: 1, failed: 1, stale: 1 },
  );
  assert.match(formatDiagnosticTargetStatus(target("failed")), /普通连通失败/);
  assert.doesNotMatch(formatDiagnosticTargetStatus(target("failed")), /\.ok/);
});

test("page wiring keeps passive reads in queries and POST checks behind explicit mutations", async () => {
  const diagnosticsDirectory = fileURLToPath(new URL(".", import.meta.url));
  const overview = await readFile(new URL("../views/SettingsOverviewPage.tsx", import.meta.url), "utf8");
  const routes = await readFile(new URL("../ModelRoutesPage.tsx", import.meta.url), "utf8");
  const knowledge = await readFile(new URL("../../knowledge/KnowledgePage.tsx", import.meta.url), "utf8");
  const knowledgeOps = await readFile(new URL("../../knowledge/components/KnowledgeOpsTab.tsx", import.meta.url), "utf8");
  const providerSettings = await readFile(new URL("../SettingsPage.tsx", import.meta.url), "utf8");
  const quickSetup = await readFile(new URL("../../../components/onboarding/QuickSetupDialog.tsx", import.meta.url), "utf8");

  assert.ok(diagnosticsDirectory.endsWith("/pages/settings/diagnostics/"));
  assert.match(overview, /createDiagnosticReadQueryPolicy\(getModelRouteReadiness\)/);
  assert.doesNotMatch(overview, /testModelRouteConnectivity/);
  assert.match(routes, /createDiagnosticReadQueryPolicy\(getModelRouteReadiness\)/);
  assert.match(routes, /createExplicitDiagnosticCheckController\(testModelRouteConnectivity\)/);
  assert.doesNotMatch(routes, /setQueryData/);
  assert.match(knowledge, /createDiagnosticReadQueryPolicy\(getRagReadiness\)/);
  assert.match(knowledge, /createExplicitDiagnosticCheckController\(checkRagReadiness\)/);
  assert.doesNotMatch(knowledgeOps, /ragHealth|\.ok\b/);
  assert.match(providerSettings, /resetDiagnosticReadinessAfterConfigurationChange/);
  assert.match(quickSetup, /queryKeys\.settings\.modelRouteReadiness/);
  assert.doesNotMatch(quickSetup, /queryKeys\.settings\.modelRouteConnectivity/);
});
