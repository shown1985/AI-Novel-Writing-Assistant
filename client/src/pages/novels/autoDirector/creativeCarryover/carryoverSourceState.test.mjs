import assert from "node:assert/strict";
import test from "node:test";
import { resolveCarryoverSource } from "./carryoverSourceState.ts";

const basicForm = { writingMode: "original", continuationBookAnalysisId: "", referenceBookAnalysisId: "" };
const sourceA = { initialMode: "continuation", initialBookAnalysisId: "analysis-A", restoredContract: { mode: "continuation", bookAnalysisId: "analysis-A" } };

test("reference URL is a seed before the form is initialized", () => {
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, basicForm, formInitialized: false }), { mode: "continuation", bookAnalysisId: "analysis-A" });
});

test("editing continuation source to B supersedes the original URL and adopted source A", () => {
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, basicForm: { ...basicForm, writingMode: "continuation", continuationBookAnalysisId: "analysis-B" }, formInitialized: true }), { mode: "continuation", bookAnalysisId: "analysis-B" });
});

test("a restored draft's reference selection supersedes the original URL", () => {
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, basicForm: { ...basicForm, referenceBookAnalysisId: "analysis-B" }, formInitialized: true }), { mode: "adaptation", bookAnalysisId: "analysis-B" });
});

test("clearing a source after initialization does not resurrect the URL or old contract", () => {
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, basicForm, formInitialized: true }), { mode: "", bookAnalysisId: "" });
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, basicForm: { ...basicForm, writingMode: "continuation" }, formInitialized: true }), { mode: "continuation", bookAnalysisId: "" });
});

test("restored contract binding is only an initialization fallback", () => {
  assert.deepEqual(resolveCarryoverSource({ ...sourceA, initialMode: "", initialBookAnalysisId: "", basicForm, formInitialized: false }), { mode: "continuation", bookAnalysisId: "analysis-A" });
});
