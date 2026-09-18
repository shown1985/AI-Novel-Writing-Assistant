import type {
  ModelAttemptAttribution,
  ModelAttemptEvidenceStatus,
  ModelAttemptFailure,
  ModelAttemptMode,
  ModelAttemptObservationIssue,
  ModelAttemptPromptIdentity,
  ModelAttemptRole,
  ModelAttemptRouteTier,
  ModelAttemptUsage,
} from "../contracts";
import type { ModelAttemptRepository } from "../repository";

export interface PrototypeTransportTarget {
  provider: string;
  model: string;
  structuredStrategy?: string | null;
  /** Transport-only fields. The evidence projection must never persist them. */
  apiKey?: string;
  baseUrl?: string;
  authHeader?: string;
  payload?: unknown;
}

export interface PrototypeTransportSuccess<T> {
  output: T;
  usage: ModelAttemptUsage | null;
  accepted: boolean;
}

export interface PrototypeStreamChunk<T> {
  delta?: string;
  output?: T;
  usage?: ModelAttemptUsage | null;
}

export interface PrototypeStreamResult<T> {
  chunks: AsyncIterable<PrototypeStreamChunk<T>>;
  accepted: boolean;
}

export interface PrototypeModelTransport<T> {
  invoke(target: PrototypeTransportTarget): Promise<PrototypeTransportSuccess<T>>;
  stream(target: PrototypeTransportTarget): Promise<PrototypeStreamResult<T>>;
}

export interface PrototypeAttemptPlanItem {
  attemptId: string;
  parentAttemptId: string | null;
  attemptIndex: number;
  role: ModelAttemptRole;
  routeTier: ModelAttemptRouteTier;
  target: PrototypeTransportTarget;
}

export interface PrototypeAttemptRequest {
  requestId: string;
  mode: ModelAttemptMode;
  attribution: ModelAttemptAttribution;
  prompt: ModelAttemptPromptIdentity;
  attempts: PrototypeAttemptPlanItem[];
}

export interface PrototypeAttemptExecutionResult<T> {
  output: T;
  adoptedAttemptId: string;
  usage: ModelAttemptUsage | null;
  evidenceStatus: ModelAttemptEvidenceStatus;
  observationIssues: ModelAttemptObservationIssue[];
}

export interface PrototypeAttemptClock {
  now(): Date;
}

const systemClock: PrototypeAttemptClock = { now: () => new Date() };

function normalizeUsage(usage: ModelAttemptUsage | null | undefined): ModelAttemptUsage | null {
  if (!usage) {
    return null;
  }
  return {
    promptTokens: Math.max(0, Math.round(usage.promptTokens)),
    completionTokens: Math.max(0, Math.round(usage.completionTokens)),
    reasoningTokens: usage.reasoningTokens === null ? null : Math.max(0, Math.round(usage.reasoningTokens)),
    totalTokens: Math.max(0, Math.round(usage.totalTokens)),
  };
}

function classifyFailure(error: unknown): ModelAttemptFailure {
  const code = error instanceof PrototypeTransportError ? error.code : "transport_unknown";
  const category = error instanceof PrototypeTransportError ? error.category : "unknown";
  const retryable = error instanceof PrototypeTransportError ? error.retryable : false;
  return { code, category, retryable };
}

function validatePlan(request: PrototypeAttemptRequest): void {
  if (!request.requestId.trim() || request.attempts.length === 0) {
    throw new Error("invalid_attempt_request");
  }
  const attemptIds = new Set<string>();
  request.attempts.forEach((attempt, index) => {
    if (!attempt.attemptId.trim() || attemptIds.has(attempt.attemptId) || attempt.attemptIndex !== index) {
      throw new Error("invalid_attempt_plan");
    }
    attemptIds.add(attempt.attemptId);
    if (index === 0) {
      if (attempt.role !== "primary" || attempt.parentAttemptId !== null) {
        throw new Error("invalid_primary_attempt");
      }
      return;
    }
    if (!attempt.parentAttemptId || !attemptIds.has(attempt.parentAttemptId)) {
      throw new Error("invalid_attempt_parent");
    }
  });
}

async function observe(
  issues: ModelAttemptObservationIssue[],
  phase: ModelAttemptObservationIssue["phase"],
  attemptId: string,
  writer: () => Promise<void>,
): Promise<void> {
  try {
    await writer();
  } catch {
    issues.push({ phase, attemptId, code: "attempt_evidence_write_failed" });
  }
}

function resolveEvidenceStatus(
  issues: ModelAttemptObservationIssue[],
  successfulEvidenceWriteCount: number,
): ModelAttemptEvidenceStatus {
  if (issues.length === 0) {
    return "complete";
  }
  return successfulEvidenceWriteCount > 0 ? "partial" : "missing";
}

/**
 * Executable seam proof only. A production adapter must integrate at the real
 * transport boundary rather than importing this orchestrator.
 */
export async function executeAttemptSeamPrototype<T>(input: {
  request: PrototypeAttemptRequest;
  repository: ModelAttemptRepository;
  transport: PrototypeModelTransport<T>;
  clock?: PrototypeAttemptClock;
}): Promise<PrototypeAttemptExecutionResult<T>> {
  validatePlan(input.request);
  const clock = input.clock ?? systemClock;
  const issues: ModelAttemptObservationIssue[] = [];
  let successfulEvidenceWrites = 0;
  let lastError: unknown = new Error("model_attempts_exhausted");

  for (const attempt of input.request.attempts) {
    const startedAtDate = clock.now();
    const startIssueCount = issues.length;
    await observe(issues, "start", attempt.attemptId, () => input.repository.startAttempt({
      requestId: input.request.requestId,
      attemptId: attempt.attemptId,
      parentAttemptId: attempt.parentAttemptId,
      attemptIndex: attempt.attemptIndex,
      role: attempt.role,
      routeTier: attempt.routeTier,
      mode: input.request.mode,
      provider: attempt.target.provider,
      model: attempt.target.model,
      structuredStrategy: attempt.target.structuredStrategy,
      attribution: input.request.attribution,
      prompt: input.request.prompt,
      startedAt: startedAtDate.toISOString(),
    }));
    if (issues.length === startIssueCount) {
      successfulEvidenceWrites += 1;
    }

    try {
      let success: PrototypeTransportSuccess<T>;
      if (input.request.mode === "invoke") {
        success = await input.transport.invoke(attempt.target);
      } else {
        const streamed = await input.transport.stream(attempt.target);
        let output: T | undefined;
        let usage: ModelAttemptUsage | null = null;
        for await (const chunk of streamed.chunks) {
          if (chunk.output !== undefined) {
            output = chunk.output;
          }
          if (chunk.usage !== undefined) {
            usage = normalizeUsage(chunk.usage);
          }
        }
        if (output === undefined) {
          throw new PrototypeTransportError("stream_missing_output", "transport", false);
        }
        success = { output, usage, accepted: streamed.accepted };
      }

      const finishedAt = clock.now();
      const finalizeIssueCount = issues.length;
      await observe(issues, "finalize", attempt.attemptId, () => input.repository.finalizeAttempt({
        requestId: input.request.requestId,
        attemptId: attempt.attemptId,
        status: "succeeded",
        finalAdoption: success.accepted ? "adopted" : "not_adopted",
        usage: normalizeUsage(success.usage),
        failure: null,
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAtDate.getTime()),
      }));
      if (issues.length === finalizeIssueCount) {
        successfulEvidenceWrites += 1;
      }
      if (success.accepted) {
        return {
          output: success.output,
          adoptedAttemptId: attempt.attemptId,
          usage: normalizeUsage(success.usage),
          evidenceStatus: resolveEvidenceStatus(issues, successfulEvidenceWrites),
          observationIssues: issues,
        };
      }
    } catch (error) {
      lastError = error;
      const finishedAt = clock.now();
      const finalizeIssueCount = issues.length;
      await observe(issues, "finalize", attempt.attemptId, () => input.repository.finalizeAttempt({
        requestId: input.request.requestId,
        attemptId: attempt.attemptId,
        status: error instanceof PrototypeTransportError && error.category === "cancelled" ? "cancelled" : "failed",
        finalAdoption: "not_adopted",
        usage: null,
        failure: classifyFailure(error),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAtDate.getTime()),
      }));
      if (issues.length === finalizeIssueCount) {
        successfulEvidenceWrites += 1;
      }
    }
  }
  throw lastError;
}

export class PrototypeTransportError extends Error {
  constructor(
    readonly code: string,
    readonly category: ModelAttemptFailure["category"] = "transport",
    readonly retryable = false,
  ) {
    super(code);
  }
}
