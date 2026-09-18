import type {
  FinalizeModelAttemptInput,
  ModelAttemptRecord,
  ModelAttemptRequestEvidence,
  StartModelAttemptInput,
} from "../contracts";
import type { ModelAttemptRepository } from "../repository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

/** Test/POC adapter only. It deliberately performs a serialization round trip. */
export class InMemoryModelAttemptRepository implements ModelAttemptRepository {
  private readonly rows = new Map<string, ModelAttemptRecord>();

  constructor(seedRows: ModelAttemptRecord[] = []) {
    for (const row of seedRows) {
      this.rows.set(row.attemptId, clone(row));
    }
  }

  async startAttempt(input: StartModelAttemptInput): Promise<void> {
    const row: ModelAttemptRecord = {
      ...clone(input),
      structuredStrategy: input.structuredStrategy ?? null,
      status: "started",
      finalAdoption: "pending",
      usage: null,
      failure: null,
      finishedAt: null,
      durationMs: null,
    };
    const existing = this.rows.get(input.attemptId);
    if (existing) {
      if (canonical(existing) !== canonical(row)) {
        throw new Error("attempt_id_conflict");
      }
      return;
    }
    const requestRows = [...this.rows.values()].filter((candidate) => candidate.requestId === input.requestId);
    if (requestRows.some((candidate) => candidate.attemptIndex === input.attemptIndex)) {
      throw new Error("attempt_index_conflict");
    }
    if (input.parentAttemptId !== null) {
      const parent = this.rows.get(input.parentAttemptId);
      if (!parent || parent.requestId !== input.requestId || parent.attemptIndex >= input.attemptIndex) {
        throw new Error("invalid_parent_attempt");
      }
    } else if (input.role !== "primary") {
      throw new Error("missing_parent_attempt");
    }
    this.rows.set(input.attemptId, clone(row));
  }

  async finalizeAttempt(input: FinalizeModelAttemptInput): Promise<void> {
    const existing = this.rows.get(input.attemptId);
    if (!existing || existing.requestId !== input.requestId) {
      throw new Error("attempt_not_started");
    }
    const finalized: ModelAttemptRecord = {
      ...existing,
      status: input.status,
      finalAdoption: input.finalAdoption,
      usage: clone(input.usage),
      failure: clone(input.failure),
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
    };
    if (existing.status !== "started") {
      if (canonical(existing) !== canonical(finalized)) {
        throw new Error("attempt_finalize_conflict");
      }
      return;
    }
    if (input.finalAdoption === "adopted") {
      const alreadyAdopted = [...this.rows.values()].some((candidate) => (
        candidate.requestId === input.requestId
        && candidate.attemptId !== input.attemptId
        && candidate.finalAdoption === "adopted"
      ));
      if (alreadyAdopted) {
        throw new Error("request_already_adopted");
      }
    }
    this.rows.set(input.attemptId, clone(finalized));
  }

  async findAttempt(attemptId: string): Promise<ModelAttemptRecord | null> {
    return clone(this.rows.get(attemptId) ?? null);
  }

  async reconstructRequest(requestId: string): Promise<ModelAttemptRequestEvidence | null> {
    const attempts = [...this.rows.values()]
      .filter((row) => row.requestId === requestId)
      .sort((left, right) => left.attemptIndex - right.attemptIndex)
      .map(clone);
    if (attempts.length === 0) {
      return null;
    }
    return {
      requestId,
      attempts,
      adoptedAttemptId: attempts.find((attempt) => attempt.finalAdoption === "adopted")?.attemptId ?? null,
    };
  }

  async findByNovelId(novelId: string): Promise<ModelAttemptRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.attribution.novelId === novelId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.attemptIndex - right.attemptIndex)
      .map(clone);
  }

  /** Simulates rows read by a new repository process after persistence. */
  exportRowsForReconstruction(): ModelAttemptRecord[] {
    return [...this.rows.values()].map(clone);
  }
}
