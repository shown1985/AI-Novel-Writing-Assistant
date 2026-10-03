import {
  MODEL_ATTEMPT_FAILURE_CODES,
  type ModelAttemptRecord,
  type ModelAttemptRole as InternalModelAttemptRole,
  type ModelAttemptRouteTier as InternalModelAttemptRouteTier,
  type ModelAttemptStatus as InternalModelAttemptStatus,
  type ModelAttemptFinalAdoption as InternalModelAttemptFinalAdoption,
} from "../contracts";
import type {
  LlmAttemptFailureCode,
  LlmAttemptProvenance,
  LlmAttemptProvenanceAdoption,
  LlmAttemptProvenanceAttempt,
  LlmAttemptProvenanceAttemptStatus,
  LlmAttemptProvenanceRole,
  LlmAttemptProvenanceRouteTier,
} from "@ai-novel/shared/types/llm";
import type { ModelAttemptReadProjection } from "./modelAttemptReadProjection";

const PUBLIC_FAILURE_CODES = new Set<string>(MODEL_ATTEMPT_FAILURE_CODES);
const PUBLIC_FAILURE_CATEGORIES = new Set(["transport", "timeout", "cancelled", "validation", "unknown"]);

function mapRole(role: InternalModelAttemptRole): LlmAttemptProvenanceRole {
  switch (role) {
    case "primary":
      return "primary";
    case "json_repair":
      return "repair";
    case "fallback":
      return "fallback";
    case "strategy_retry":
    case "transport_retry":
    case "semantic_retry":
      return "retry";
    default:
      return "unknown";
  }
}

function mapRouteTier(routeTier: InternalModelAttemptRouteTier): LlmAttemptProvenanceRouteTier {
  return routeTier === "primary" || routeTier === "fallback" ? routeTier : "unknown";
}

function mapStatus(status: InternalModelAttemptStatus): LlmAttemptProvenanceAttemptStatus {
  return status === "started"
    || status === "succeeded"
    || status === "failed"
    || status === "cancelled"
    ? status
    : "unknown";
}

function mapAdoption(finalAdoption: InternalModelAttemptFinalAdoption): LlmAttemptProvenanceAdoption {
  return finalAdoption === "pending"
    || finalAdoption === "adopted"
    || finalAdoption === "not_adopted"
    ? finalAdoption
    : "unknown";
}

function mapFailureCode(code: string | null): LlmAttemptFailureCode | null {
  return code && PUBLIC_FAILURE_CODES.has(code) ? code as LlmAttemptFailureCode : null;
}

function mapFailureCategory(category: string | null): LlmAttemptProvenanceAttempt["failureCategory"] {
  return category && PUBLIC_FAILURE_CATEGORIES.has(category)
    ? category as LlmAttemptProvenanceAttempt["failureCategory"]
    : null;
}

function publicText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mapAttempt(record: ModelAttemptRecord): LlmAttemptProvenanceAttempt {
  return {
    attemptId: record.attemptId,
    parentAttemptId: record.parentAttemptId,
    attemptIndex: record.attemptIndex,
    role: mapRole(record.role),
    routeTier: mapRouteTier(record.routeTier),
    status: mapStatus(record.status),
    finalAdoption: mapAdoption(record.finalAdoption),
    provider: publicText(record.provider),
    model: publicText(record.model),
    failureCode: mapFailureCode(record.failure?.code ?? null),
    failureCategory: mapFailureCategory(record.failure?.category ?? null),
    retryable: record.failure?.retryable ?? null,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
  };
}

/** Explicitly maps the internal read projection to the frozen public whitelist. */
export function projectModelAttemptProvenance(
  projection: ModelAttemptReadProjection,
): LlmAttemptProvenance {
  return {
    status: projection.status,
    requestId: projection.requestId,
    attributionStatus: projection.attributionStatus,
    adoptedAttemptId: projection.adoptedAttemptId,
    attempts: projection.attempts.map(mapAttempt),
  };
}
