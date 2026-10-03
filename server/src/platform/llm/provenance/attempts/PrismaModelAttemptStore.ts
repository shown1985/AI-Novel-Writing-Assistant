import type {
  FinalizeModelAttemptStorePatch,
  ModelAttemptStore,
  ModelAttemptStoreRow,
  ModelAttemptStoreTransaction,
  StartModelAttemptStoreRow,
} from "./store";

interface PrismaCountResult {
  count: number;
}

interface PrismaModelAttemptDelegate {
  findUnique(args: unknown): Promise<ModelAttemptStoreRow | null>;
  findMany(args: unknown): Promise<ModelAttemptStoreRow[]>;
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<PrismaCountResult>;
}

interface PrismaModelAttemptTransactionClient {
  modelAttemptEvidence: PrismaModelAttemptDelegate;
}

interface PrismaModelAttemptClient extends PrismaModelAttemptTransactionClient {
  $transaction<T>(
    operation: (transaction: PrismaModelAttemptTransactionClient) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ): Promise<T>;
}

export interface PrismaModelAttemptStoreOptions {
  /** Retry delays for serialization/deadlock/busy conflicts. */
  retryDelaysMs?: readonly number[];
  /** Test seam; production uses the platform timer. */
  wait?: (delayMs: number) => Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [10, 50, 150] as const;

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableTransactionConflict(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  return code === "P2002"
    || code === "P2034"
    || code === "P1008"
    || message.includes("SQLITE_BUSY")
    || message.includes("database is locked")
    || message.includes("serialization failure")
    || message.includes("deadlock detected");
}

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function assertPrismaClient(client: unknown): asserts client is PrismaModelAttemptClient {
  if (
    !client
    || typeof client !== "object"
    || !("$transaction" in client)
    || typeof (client as { $transaction?: unknown }).$transaction !== "function"
    || !("modelAttemptEvidence" in client)
  ) {
    throw new Error("invalid_model_attempt_prisma_client");
  }
}

function createTransactionAdapter(delegate: PrismaModelAttemptDelegate): ModelAttemptStoreTransaction {
  return {
    findByAttemptId: (attemptId) => delegate.findUnique({ where: { attemptId } }),
    findByRequestAndIndex: (requestId, attemptIndex) => delegate.findUnique({
      where: { requestId_attemptIndex: { requestId, attemptIndex } },
    }),
    listByRequestId: (requestId) => delegate.findMany({
      where: { requestId },
      orderBy: [{ attemptIndex: "asc" }, { startedAt: "asc" }],
    }),
    insertIfAbsent: async (row: StartModelAttemptStoreRow) => {
      await delegate.create({ data: row });
      return true;
    },
    finalizeIfStarted: async (attemptId: string, patch: FinalizeModelAttemptStorePatch) => {
      const result = await delegate.updateMany({
        where: { attemptId, status: "started" },
        data: patch,
      });
      return result.count === 1;
    },
  };
}

/**
 * Production adapter for either generated SQLite or PostgreSQL Prisma client.
 *
 * The client is injected so this module never selects a database, opens a
 * connection, or imports the application singleton. Both generated clients
 * expose the same `modelAttemptEvidence` delegate from the synchronized
 * schemas. Runtime shape validation avoids coupling this platform boundary to
 * whichever schema the environment selected during `prisma generate`.
 */
export class PrismaModelAttemptStore implements ModelAttemptStore {
  private readonly client: PrismaModelAttemptClient;
  private readonly retryDelaysMs: readonly number[];
  private readonly wait: (delayMs: number) => Promise<void>;

  constructor(client: unknown, options: PrismaModelAttemptStoreOptions = {}) {
    assertPrismaClient(client);
    this.client = client;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.wait = options.wait ?? defaultWait;
  }

  async withRequestTransaction<T>(
    _requestId: string,
    operation: (transaction: ModelAttemptStoreTransaction) => Promise<T>,
  ): Promise<T> {
    let retryIndex = 0;
    for (;;) {
      try {
        return await this.client.$transaction(
          (transaction) => operation(createTransactionAdapter(transaction.modelAttemptEvidence)),
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (!isRetryableTransactionConflict(error) || retryIndex >= this.retryDelaysMs.length) {
          throw error;
        }
        const delayMs = this.retryDelaysMs[retryIndex] ?? 0;
        retryIndex += 1;
        await this.wait(delayMs);
      }
    }
  }

  findByAttemptId(attemptId: string): Promise<ModelAttemptStoreRow | null> {
    return this.client.modelAttemptEvidence.findUnique({ where: { attemptId } });
  }

  listByRequestId(requestId: string): Promise<ModelAttemptStoreRow[]> {
    return this.client.modelAttemptEvidence.findMany({
      where: { requestId },
      orderBy: [{ attemptIndex: "asc" }, { startedAt: "asc" }],
    });
  }

  listByNovelId(novelId: string): Promise<ModelAttemptStoreRow[]> {
    return this.client.modelAttemptEvidence.findMany({
      where: { novelId },
      orderBy: [{ startedAt: "asc" }, { requestId: "asc" }, { attemptIndex: "asc" }],
    });
  }
}
