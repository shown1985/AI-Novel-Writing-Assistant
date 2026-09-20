import type {
  ModelAttemptAttribution,
  ModelAttemptAttributionStatus,
  ModelAttemptAttributionIssue,
  ModelAttemptExecutionEvidence,
  ModelAttemptEvidenceStatus,
  ModelAttemptRecord,
  ModelAttemptReadStatus,
  ModelAttemptRequestEvidence,
} from "../contracts";
import type { ModelAttemptRepository } from "../repository";
import { getModelAttemptRepository } from "./modelAttemptRepositoryProvider";

export type { ModelAttemptAttributionStatus, ModelAttemptReadStatus } from "../contracts";

/** Internal projection only; never use this as an HTTP/shared response DTO. */
export interface ModelAttemptReadProjection {
  status: ModelAttemptReadStatus;
  requestId: string;
  request: ModelAttemptRequestEvidence | null;
  attempts: ModelAttemptRecord[];
  /** Alias retained to make the lineage boundary explicit to internal callers. */
  lineage: ModelAttemptRecord[];
  adoptedAttemptId: string | null;
  adoptedAttempt: ModelAttemptRecord | null;
  attributionStatus: ModelAttemptAttributionStatus;
  /** Present only when the caller supplies real execution evidence. */
  evidenceStatus?: ModelAttemptEvidenceStatus;
  executionEvidence?: ModelAttemptExecutionEvidence;
  attributionIssue?: ModelAttemptAttributionIssue;
  /** Stable diagnostic; repository details are deliberately not exposed. */
  errorCode?: "attempt_read_failed" | "execution_evidence_request_mismatch";
}

function cloneRecord(record: ModelAttemptRecord): ModelAttemptRecord {
  return {
    requestId: record.requestId,
    attemptId: record.attemptId,
    parentAttemptId: record.parentAttemptId,
    attemptIndex: record.attemptIndex,
    role: record.role,
    routeTier: record.routeTier,
    mode: record.mode,
    status: record.status,
    finalAdoption: record.finalAdoption,
    provider: record.provider,
    model: record.model,
    structuredStrategy: record.structuredStrategy,
    attribution: { ...record.attribution },
    prompt: { ...record.prompt },
    usage: record.usage ? { ...record.usage } : null,
    failure: record.failure ? { ...record.failure } : null,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
  };
}

function cloneEvidence(evidence: ModelAttemptRequestEvidence): ModelAttemptRequestEvidence {
  const attempts = evidence.attempts.map(cloneRecord);
  return {
    requestId: evidence.requestId,
    attempts,
    adoptedAttemptId: evidence.adoptedAttemptId,
  };
}

function requiredAttributionFields(kind: ModelAttemptAttribution["kind"]): (keyof ModelAttemptAttribution)[] {
  switch (kind) {
    case "auto_director":
      return [
        "novelId",
        "taskId",
        "directorRunId",
        "directorStepIdempotencyKey",
        "directorNodeKey",
        "entrypoint",
      ];
    case "novel_world_generate":
      return ["novelId", "entrypoint"];
    case "ai_revision_preview":
      return ["novelId", "chapterId", "entrypoint"];
    default:
      return [];
  }
}

function classifyAttribution(attempts: ModelAttemptRecord[]): ModelAttemptAttributionStatus {
  const first = attempts[0]?.attribution;
  return classifyAttributionIdentity(first, attempts);
}

function classifyAttributionIdentity(
  first: ModelAttemptAttribution | undefined,
  attempts: ModelAttemptRecord[] = [],
): ModelAttemptAttributionStatus {
  if (!first || first.kind === "unattributed" || first.source === "legacy_unknown") {
    return "unattributed";
  }

  // A request's identity is immutable. A malformed legacy adapter that
  // returns mixed identities is not promoted to complete by picking a row.
  const firstIdentity = JSON.stringify(first);
  if (attempts.some((attempt) => JSON.stringify(attempt.attribution) !== firstIdentity)) {
    return "partial";
  }

  const required = requiredAttributionFields(first.kind);
  if (required.length === 0) {
    return "unattributed";
  }
  return required.every((field) => {
    const value = first[field];
    return typeof value === "string" && value.trim().length > 0;
  }) ? "complete" : "partial";
}

function withExecutionEvidence(
  projection: ModelAttemptReadProjection,
  evidence: ModelAttemptExecutionEvidence | undefined,
): ModelAttemptReadProjection {
  if (!evidence) {
    return projection;
  }
  if (evidence.requestId !== projection.requestId) {
    return { ...projection, errorCode: "execution_evidence_request_mismatch" };
  }
  return {
    ...projection,
    evidenceStatus: evidence.evidenceStatus,
    executionEvidence: {
      requestId: evidence.requestId,
      evidenceStatus: evidence.evidenceStatus,
      observationIssues: evidence.observationIssues.map((issue) => ({ ...issue })),
      ...(evidence.attributionIssue ? { attributionIssue: evidence.attributionIssue } : {}),
    },
    ...(evidence.attributionIssue ? { attributionIssue: evidence.attributionIssue } : {}),
  };
}

/**
 * Reconstructs persisted request facts without invoking a model or writing
 * evidence. `null` from the repository is the only source of `not_found`.
 */
export async function readModelAttemptRequest(input: {
  requestId: string;
  repository?: ModelAttemptRepository;
  executionEvidence?: ModelAttemptExecutionEvidence;
  /** Optional request-scope fact used only to diagnose repository failures. */
  attribution?: ModelAttemptAttribution;
}): Promise<ModelAttemptReadProjection> {
  const requestId = input.requestId;
  const base: ModelAttemptReadProjection = {
    status: "not_found",
    requestId,
    request: null,
    attempts: [],
    lineage: [],
    adoptedAttemptId: null,
    adoptedAttempt: null,
    attributionStatus: "unattributed",
  };
  let request: ModelAttemptRequestEvidence | null;
  try {
    request = await (input.repository ?? getModelAttemptRepository()).reconstructRequest(requestId);
  } catch {
    return withExecutionEvidence({
      ...base,
      status: "error",
      errorCode: "attempt_read_failed",
      attributionStatus: classifyAttributionIdentity(input.attribution),
    }, input.executionEvidence);
  }
  if (!request) {
    return withExecutionEvidence(base, input.executionEvidence);
  }

  const detached = cloneEvidence(request);
  const attempts = detached.attempts;
  const adoptedAttempt = detached.adoptedAttemptId
    ? attempts.find((attempt) => attempt.attemptId === detached.adoptedAttemptId) ?? null
    : null;
  return withExecutionEvidence({
    status: "found",
    requestId,
    request: detached,
    attempts,
    lineage: attempts,
    adoptedAttemptId: detached.adoptedAttemptId,
    adoptedAttempt,
    attributionStatus: classifyAttribution(attempts),
  }, input.executionEvidence);
}

/** Stable alias for internal callers that refer to this as a projection. */
export const projectModelAttemptRead = readModelAttemptRequest;
