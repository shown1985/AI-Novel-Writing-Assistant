/**
 * S2-04b0 prototype contract only.
 *
 * Nothing in this directory is wired to the production LLM facade. These
 * types describe the evidence a later production story must persist at the
 * actual transport boundary.
 */

export type ModelAttemptMode = "invoke" | "stream";

export type ModelAttemptRole =
  | "primary"
  | "strategy_retry"
  | "transport_retry"
  | "json_repair"
  | "semantic_retry"
  | "fallback"
  | "legacy_unknown";

export type ModelAttemptStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "legacy_unknown";

export type ModelAttemptFinalAdoption =
  | "pending"
  | "adopted"
  | "not_adopted"
  | "legacy_unknown";

export type ModelAttemptRouteTier = "primary" | "fallback" | "legacy_unknown";

export type ModelAttemptAttributionKind =
  | "auto_director"
  | "novel_world_generate"
  | "ai_revision_preview"
  | "unattributed";

export type ModelAttemptAttributionSource =
  | "director_runtime"
  | "prompt_invocation"
  | "legacy_unknown";

export interface ModelAttemptAttribution {
  kind: ModelAttemptAttributionKind;
  source: ModelAttemptAttributionSource;
  novelId: string | null;
  taskId: string | null;
  directorRunId: string | null;
  directorStepIdempotencyKey: string | null;
  directorNodeKey: string | null;
  chapterId: string | null;
  entrypoint: string | null;
}

export interface ModelAttemptPromptIdentity {
  promptId: string | null;
  promptVersion: string | null;
  taskType: string | null;
  modelRoute: string | null;
}

export interface ModelAttemptUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number | null;
  totalTokens: number;
}

export interface ModelAttemptFailure {
  /** Stable, allow-listed classifier; never a provider response body. */
  code: string;
  category: "transport" | "timeout" | "cancelled" | "validation" | "unknown";
  retryable: boolean;
}

export interface ModelAttemptRecord {
  requestId: string;
  attemptId: string;
  parentAttemptId: string | null;
  attemptIndex: number;
  role: ModelAttemptRole;
  routeTier: ModelAttemptRouteTier;
  mode: ModelAttemptMode;
  status: ModelAttemptStatus;
  finalAdoption: ModelAttemptFinalAdoption;
  provider: string | null;
  model: string | null;
  structuredStrategy: string | null;
  attribution: ModelAttemptAttribution;
  prompt: ModelAttemptPromptIdentity;
  usage: ModelAttemptUsage | null;
  failure: ModelAttemptFailure | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface StartModelAttemptInput {
  requestId: string;
  attemptId: string;
  parentAttemptId: string | null;
  attemptIndex: number;
  role: ModelAttemptRole;
  routeTier: ModelAttemptRouteTier;
  mode: ModelAttemptMode;
  provider: string;
  model: string;
  structuredStrategy?: string | null;
  attribution: ModelAttemptAttribution;
  prompt: ModelAttemptPromptIdentity;
  startedAt: string;
}

export interface FinalizeModelAttemptInput {
  requestId: string;
  attemptId: string;
  status: Exclude<ModelAttemptStatus, "started" | "legacy_unknown">;
  finalAdoption: Exclude<ModelAttemptFinalAdoption, "pending" | "legacy_unknown">;
  usage: ModelAttemptUsage | null;
  failure: ModelAttemptFailure | null;
  finishedAt: string;
  durationMs: number;
}

export interface ModelAttemptRequestEvidence {
  requestId: string;
  attempts: ModelAttemptRecord[];
  adoptedAttemptId: string | null;
}

export type ModelAttemptEvidenceStatus = "complete" | "partial" | "missing";

export interface ModelAttemptObservationIssue {
  phase: "start" | "finalize";
  attemptId: string;
  /** Deliberately generic so repository details and credentials cannot leak. */
  code: "attempt_evidence_write_failed";
}

export const LEGACY_UNKNOWN_ATTRIBUTION: ModelAttemptAttribution = {
  kind: "unattributed",
  source: "legacy_unknown",
  novelId: null,
  taskId: null,
  directorRunId: null,
  directorStepIdempotencyKey: null,
  directorNodeKey: null,
  chapterId: null,
  entrypoint: null,
};
