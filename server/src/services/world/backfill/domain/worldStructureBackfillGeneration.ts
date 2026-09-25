import { createHash } from "node:crypto";

/**
 * Backfill-owned generation policy version. It participates in the frozen
 * request hash, so any change to normalization or call policy must bump it.
 */
export const WORLD_STRUCTURE_BACKFILL_GENERATION_POLICY_VERSION = "structure-backfill-policy-v1";

/** Default time an owner may hold the model call right before replay treats it as lost. */
export const DEFAULT_WORLD_STRUCTURE_BACKFILL_LEASE_MS = 5 * 60 * 1000;

/** Fixed sampling temperature, identical to the legacy backfill path. */
export const WORLD_STRUCTURE_BACKFILL_TEMPERATURE = 0.2;

/**
 * Structured failure categories that prove the provider returned a response
 * whose content is unusable. Only these may become `failed_terminal`.
 */
export const WORLD_STRUCTURE_BACKFILL_TERMINAL_FAILURE_CATEGORIES: ReadonlySet<string> = new Set([
  "malformed_json",
  "empty_content",
  "incomplete_json",
  "schema_mismatch",
  "thinking_pollution",
  "output_truncated",
  "reasoning_budget_exhausted",
]);

/** Local categories for failures that carry no structured provider category. */
export const WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES = {
  cancelled: "cancelled",
  unstructuredError: "unstructured_error",
  normalizationFailed: "normalization_failed",
  persistFailed: "persist_failed",
  leaseExpired: "lease_expired",
} as const;

export type WorldStructureBackfillLocalFailureCategory =
  (typeof WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES)[keyof typeof WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES];

export type WorldStructureBackfillFailurePhase = "provider_call" | "after_provider_output";
export type WorldStructureBackfillFailureStatus = "failed_terminal" | "model_unknown";

/**
 * Deterministic post-processing of an already-structured failure. Anything
 * outside the provider-content whitelist, and every failure after the model
 * output was received, is conservatively treated as an unknown result.
 */
export function resolveWorldStructureBackfillFailureStatus(input: {
  phase: WorldStructureBackfillFailurePhase;
  category: string;
}): WorldStructureBackfillFailureStatus {
  if (
    input.phase === "provider_call"
    && WORLD_STRUCTURE_BACKFILL_TERMINAL_FAILURE_CATEGORIES.has(input.category)
  ) {
    return "failed_terminal";
  }
  return "model_unknown";
}

/** SHA-256 of the exact prompt source text that the backfill prompt receives. */
export function createWorldStructureBackfillSourceDigest(promptSource: string): string {
  return createHash("sha256").update(promptSource, "utf8").digest("hex");
}

export function resolveWorldStructureBackfillLeaseExpiresAt(now: Date, leaseDurationMs: number): Date {
  return new Date(now.getTime() + leaseDurationMs);
}

export function isWorldStructureBackfillLeaseExpired(leaseExpiresAt: Date | null, now: Date): boolean {
  return leaseExpiresAt !== null && leaseExpiresAt.getTime() <= now.getTime();
}
