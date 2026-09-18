import type {
  FinalizeModelAttemptInput,
  ModelAttemptRecord,
  ModelAttemptRequestEvidence,
  StartModelAttemptInput,
} from "./contracts";

/**
 * Persistence port frozen by S2-04b0. Implementations must be generic across
 * product workflows; a director-token table is not an implementation of this
 * port.
 */
export interface ModelAttemptRepository {
  /**
   * Idempotent for an identical immutable start payload, including when the
   * stored attempt has since reached a terminal state; conflicting reuse fails.
   */
  startAttempt(input: StartModelAttemptInput): Promise<void>;

  /** Idempotent for an identical terminal payload; terminal facts are immutable. */
  finalizeAttempt(input: FinalizeModelAttemptInput): Promise<void>;

  findAttempt(attemptId: string): Promise<ModelAttemptRecord | null>;
  reconstructRequest(requestId: string): Promise<ModelAttemptRequestEvidence | null>;
  findByNovelId(novelId: string): Promise<ModelAttemptRecord[]>;
}
