import {
  WorldStructureBackfillStoreError,
  type WorldStructureBackfillCommitOutcome,
  type WorldStructureBackfillCommitReadOutcome,
  type WorldStructureBackfillCommitReceiptRecord,
  type WorldStructureBackfillFailureCategory,
  type WorldStructureBackfillOperationRecord,
  type WorldStructureBackfillReadResult,
  type WorldStructureBackfillResultRecord,
} from "../domain/worldStructureBackfillContracts";
import type {
  GenerateWorldStructureBackfillResultInput,
  WorldStructureBackfillGenerationOutcome,
} from "./WorldStructureBackfillGenerationService";

/**
 * `committed`: the result is in the world and a verified receipt exists.
 * `conflict_result_retained`: the author changed the world first; the result is kept, not applied.
 * `result_pending_commit`: a result is stored but its commit is not yet confirmed; a replay commits it.
 * `in_progress`, `failed_terminal`, `model_unknown`: generation states that never reopen a model call.
 */
export type WorldStructureBackfillRunOutcomeKind =
  | "committed"
  | "conflict_result_retained"
  | "result_pending_commit"
  | "in_progress"
  | "failed_terminal"
  | "model_unknown";

export interface WorldStructureBackfillRunOutcome {
  kind: WorldStructureBackfillRunOutcomeKind;
  operation: WorldStructureBackfillOperationRecord;
  result: WorldStructureBackfillResultRecord | null;
  /** Present only for `committed`. */
  receipt: WorldStructureBackfillCommitReceiptRecord | null;
  /** Persisted machine-readable category; user-facing wording belongs to the source page. */
  failureCategory: WorldStructureBackfillFailureCategory | null;
}

export type RunWorldStructureBackfillInput = GenerateWorldStructureBackfillResultInput;

export interface WorldStructureBackfillRunGenerationPort {
  generatePersistedResult(input: GenerateWorldStructureBackfillResultInput): Promise<WorldStructureBackfillGenerationOutcome>;
}

export interface WorldStructureBackfillRunCommitPort {
  commitPersistedResult(worldId: string, operationId: string): Promise<WorldStructureBackfillCommitOutcome>;
  readCommitOutcome(worldId: string, operationId: string): Promise<WorldStructureBackfillCommitReadOutcome | null>;
}

/** Reads the backfill store's operation row, the owner of the persisted failure category. */
export interface WorldStructureBackfillRunOperationPort {
  read(worldId: string, operationId: string): Promise<WorldStructureBackfillReadResult | null>;
}

export interface WorldStructureBackfillRunServiceDeps {
  generation: WorldStructureBackfillRunGenerationPort;
  commit: WorldStructureBackfillRunCommitPort;
  operations: WorldStructureBackfillRunOperationPort;
}

/** Only these statuses carry a category; both are terminal, so the category never changes after it is read. */
function carriesFailureCategory(status: WorldStructureBackfillOperationRecord["status"]): boolean {
  return status === "failed_terminal" || status === "model_unknown";
}

function toRunOutcome(
  kind: WorldStructureBackfillRunOutcomeKind,
  state: WorldStructureBackfillCommitReadOutcome,
  failureCategory: WorldStructureBackfillFailureCategory | null = null,
): WorldStructureBackfillRunOutcome {
  return {
    kind,
    operation: { ...state.operation, failureCategory },
    result: state.result,
    receipt: kind === "committed" ? state.receipt : null,
    failureCategory,
  };
}

/**
 * Map a persisted commit read-back by operation status. Only these three
 * states can follow a commit attempt; `committed` additionally requires the
 * receipt, so a missing receipt is never reported as committed.
 */
function mapCommitAttemptState(state: WorldStructureBackfillCommitReadOutcome): WorldStructureBackfillRunOutcome | null {
  switch (state.operation.status) {
    case "committed":
      return state.receipt && state.result ? toRunOutcome("committed", state) : null;
    case "conflict_result_retained":
      return toRunOutcome("conflict_result_retained", state);
    case "model_succeeded_pending_commit":
      return toRunOutcome("result_pending_commit", state);
    default:
      return null;
  }
}

function mapPersistedState(
  state: WorldStructureBackfillCommitReadOutcome,
  failureCategory: WorldStructureBackfillFailureCategory | null,
): WorldStructureBackfillRunOutcome {
  const commitState = mapCommitAttemptState(state);
  if (commitState) {
    return commitState;
  }
  switch (state.operation.status) {
    case "failed_terminal":
      return toRunOutcome("failed_terminal", state, failureCategory);
    case "model_unknown":
      return toRunOutcome("model_unknown", state, failureCategory);
    case "model_not_called":
    case "model_in_flight":
      return toRunOutcome("in_progress", state);
    default:
      throw new WorldStructureBackfillStoreError(
        "COMMIT_RECEIPT_INTEGRITY",
        "The persisted backfill state cannot be reported as a run outcome.",
      );
  }
}

/**
 * Runs one backfill operation to its durable outcome: generate once, commit
 * once, and converge every uncertain step by reading persisted facts. It adds
 * no path that can reopen a model call.
 */
export class WorldStructureBackfillRunService {
  constructor(private readonly deps: WorldStructureBackfillRunServiceDeps) {}

  async runBackfill(input: RunWorldStructureBackfillInput): Promise<WorldStructureBackfillRunOutcome> {
    const generated = await this.deps.generation.generatePersistedResult(input);
    if (generated.kind !== "result_stored") {
      const failureCategory = generated.operation.failureCategory ?? null;
      return {
        kind: generated.kind,
        operation: { ...generated.operation, failureCategory },
        result: generated.result,
        receipt: null,
        failureCategory,
      };
    }
    if (generated.operation.status === "model_succeeded_pending_commit") {
      return this.commit(input.worldId, input.operationId);
    }
    return this.readRequired(input.worldId, input.operationId);
  }

  /** Read-only: zero model calls and zero writes. Unknown or cross-world operations return null. */
  async readRunOutcome(worldId: string, operationId: string): Promise<WorldStructureBackfillRunOutcome | null> {
    const state = await this.deps.commit.readCommitOutcome(worldId, operationId);
    if (!state) {
      return null;
    }
    const failureCategory = carriesFailureCategory(state.operation.status)
      ? (await this.deps.operations.read(worldId, operationId))?.operation.failureCategory ?? null
      : null;
    return mapPersistedState(state, failureCategory);
  }

  private async commit(worldId: string, operationId: string): Promise<WorldStructureBackfillRunOutcome> {
    try {
      const committed = await this.deps.commit.commitPersistedResult(worldId, operationId);
      return mapPersistedState(committed.outcome, null);
    } catch (commitError) {
      // The commit may or may not have landed; only persisted facts decide.
      let state: WorldStructureBackfillCommitReadOutcome | null;
      try {
        state = await this.deps.commit.readCommitOutcome(worldId, operationId);
      } catch {
        throw commitError;
      }
      const outcome = state ? mapCommitAttemptState(state) : null;
      if (!outcome) {
        throw commitError;
      }
      return outcome;
    }
  }

  private async readRequired(worldId: string, operationId: string): Promise<WorldStructureBackfillRunOutcome> {
    const outcome = await this.readRunOutcome(worldId, operationId);
    if (!outcome) {
      throw new WorldStructureBackfillStoreError(
        "OPERATION_NOT_FOUND",
        "No backfill operation belongs to this world and operationId.",
      );
    }
    return outcome;
  }
}
