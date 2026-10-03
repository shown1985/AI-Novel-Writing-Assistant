/**
 * Scalar persistence shape for the generic model-attempt store.
 *
 * This is intentionally narrower than any transport/client object. Store
 * adapters must map only these fields and must never serialize arbitrary
 * options, errors, prompts, context, outputs, headers, endpoints, or secrets.
 */
export interface ModelAttemptStoreRow {
  attemptId: string;
  requestId: string;
  parentAttemptId: string | null;
  attemptIndex: number;
  role: string;
  routeTier: string;
  mode: string;
  status: string;
  finalAdoption: string;
  provider: string | null;
  model: string | null;
  structuredStrategy: string | null;
  attributionKind: string;
  attributionSource: string;
  novelId: string | null;
  taskId: string | null;
  directorRunId: string | null;
  directorStepIdempotencyKey: string | null;
  directorNodeKey: string | null;
  chapterId: string | null;
  entrypoint: string | null;
  promptId: string | null;
  promptVersion: string | null;
  taskType: string | null;
  modelRoute: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  failureCode: string | null;
  failureCategory: string | null;
  failureRetryable: boolean | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}

export type StartModelAttemptStoreRow = ModelAttemptStoreRow;

export interface FinalizeModelAttemptStorePatch {
  status: string;
  finalAdoption: string;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  failureCode: string | null;
  failureCategory: string | null;
  failureRetryable: boolean | null;
  finishedAt: Date;
  durationMs: number;
}

export interface ModelAttemptStoreTransaction {
  findByAttemptId(attemptId: string): Promise<ModelAttemptStoreRow | null>;
  findByRequestAndIndex(requestId: string, attemptIndex: number): Promise<ModelAttemptStoreRow | null>;
  listByRequestId(requestId: string): Promise<ModelAttemptStoreRow[]>;

  /**
   * Atomically inserts unless either attemptId or (requestId, attemptIndex)
   * already exists. It may return false for a non-aborting collision. Stores
   * whose database aborts a transaction on unique violation must restart the
   * entire request transaction, allowing the repository preflight to classify
   * the now-visible collision.
   */
  insertIfAbsent(row: StartModelAttemptStoreRow): Promise<boolean>;

  /** Atomically updates only a row whose current status is `started`. */
  finalizeIfStarted(attemptId: string, patch: FinalizeModelAttemptStorePatch): Promise<boolean>;
}

export interface ModelAttemptStore {
  /**
   * Runs atomically and serializes concurrent operations for the same
   * requestId. A database adapter may satisfy this with a serializable
   * transaction plus retry on serialization conflicts.
   */
  withRequestTransaction<T>(
    requestId: string,
    operation: (transaction: ModelAttemptStoreTransaction) => Promise<T>,
  ): Promise<T>;

  findByAttemptId(attemptId: string): Promise<ModelAttemptStoreRow | null>;
  listByRequestId(requestId: string): Promise<ModelAttemptStoreRow[]>;
  listByNovelId(novelId: string): Promise<ModelAttemptStoreRow[]>;
}
