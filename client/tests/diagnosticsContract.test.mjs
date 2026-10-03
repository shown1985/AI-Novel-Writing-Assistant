import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDiagnosticRecommendationsRequestSchema,
  diagnosticReadinessReportSchema,
} from "../../shared/types/diagnostics.ts";

const notCheckedReport = {
  diagnosticId: null,
  scope: "model_routes",
  checkState: "not_checked",
  checkedAt: null,
  configurationFingerprint: "opaque-config-v1",
  targets: [{
    targetId: "chapter_generation",
    targetKind: "model_route",
    taskType: "chapter_generation",
    provider: "openai",
    model: "gpt-test",
    checkState: "not_checked",
    checkedAt: null,
    errorSummary: null,
    capabilities: [],
    recommendation: null,
    revision: 3,
  }],
};

test("diagnostic readiness distinguishes unknown from failure without legacy ok booleans", () => {
  const parsed = diagnosticReadinessReportSchema.parse(notCheckedReport);
  assert.equal(parsed.checkState, "not_checked");
  assert.equal(parsed.targets[0].checkState, "not_checked");

  assert.throws(
    () => diagnosticReadinessReportSchema.parse({ ...notCheckedReport, ok: false }),
    /Unrecognized key/,
  );
});

test("diagnostic readiness rejects secret-bearing response fields", () => {
  assert.throws(
    () => diagnosticReadinessReportSchema.parse({ ...notCheckedReport, apiKey: "secret" }),
    /Unrecognized key/,
  );
  assert.throws(
    () => diagnosticReadinessReportSchema.parse({
      ...notCheckedReport,
      targets: [{ ...notCheckedReport.targets[0], credentialDigest: "digest" }],
    }),
    /Unrecognized key/,
  );
});

test("diagnostic readiness can expose one pending run and a non-recursive previous report", () => {
  const report = diagnosticReadinessReportSchema.parse({
    ...notCheckedReport,
    pending: {
      diagnosticId: "diagnostic-pending",
      startedAt: "2026-09-17T04:00:00.000Z",
      expiresAt: "2026-09-17T04:15:00.000Z",
    },
    previousReport: {
      ...notCheckedReport,
      diagnosticId: "diagnostic-previous",
      checkState: "healthy",
      checkedAt: "2026-09-17T03:00:00.000Z",
    },
  });

  assert.equal(report.pending?.diagnosticId, "diagnostic-pending");
  assert.equal(report.previousReport?.diagnosticId, "diagnostic-previous");
  assert.throws(
    () => diagnosticReadinessReportSchema.parse({
      ...report,
      previousReport: {
        ...report.previousReport,
        previousReport: notCheckedReport,
      },
    }),
    /Unrecognized key/,
  );
});

test("diagnostic capabilities preserve non-secret protocol details for legacy projections", () => {
  const report = diagnosticReadinessReportSchema.parse({
    ...notCheckedReport,
    targets: [{
      ...notCheckedReport.targets[0],
      capabilities: [{
        capability: "structured",
        checkState: "healthy",
        latencyMs: 120,
        errorSummary: null,
        requestProtocol: "anthropic",
        structuredDetails: {
          strategy: "prompt_json",
          reasoningForcedOff: true,
          fallbackAvailable: false,
          fallbackUsed: false,
          errorCategory: null,
          nativeJsonObject: false,
          nativeJsonSchema: false,
          profileFamily: "anthropic_messages",
        },
      }],
    }],
  });

  assert.equal(report.targets[0].capabilities[0].requestProtocol, "anthropic");
  assert.equal(report.targets[0].capabilities[0].structuredDetails.reasoningForcedOff, true);
});

test("diagnostic recommendation application requires unique guarded targets", () => {
  const request = {
    source: "diagnostic_recommendation",
    operationId: "operation-1",
    diagnosticId: "diagnostic-1",
    expectedConfigurationFingerprint: "opaque-config-v1",
    targets: [{
      targetId: "chapter_generation",
      recommendationId: "recommendation-1",
      expectedRevision: 3,
    }],
  };
  assert.deepEqual(applyDiagnosticRecommendationsRequestSchema.parse(request), request);
  assert.throws(
    () => applyDiagnosticRecommendationsRequestSchema.parse({
      ...request,
      targets: [...request.targets, { ...request.targets[0], recommendationId: "recommendation-2" }],
    }),
    /Each diagnostic target may be selected only once/,
  );
});
