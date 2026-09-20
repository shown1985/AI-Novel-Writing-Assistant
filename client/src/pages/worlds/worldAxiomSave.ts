import type { WorldWriteProtection } from "@/api/world";

export interface WorldAxiomsSavePayload extends WorldWriteProtection {
  axioms: string[];
}

export interface WorldAxiomsSaveError {
  status?: number;
  details?: unknown;
}

export function createWorldAxiomsSavePayload(
  axioms: string[],
  contentRevision: number,
  currentOperationId: string | null,
  generateOperationId: () => string,
): WorldAxiomsSavePayload {
  return {
    axioms,
    operationId: currentOperationId ?? generateOperationId(),
    expectedContentRevision: contentRevision,
  };
}

export function shouldRetryWorldAxiomsSave(
  error: WorldAxiomsSaveError,
  failureCount: number,
): boolean {
  if (failureCount >= 1) {
    return false;
  }
  const responseCode = typeof error.details === "object" && error.details
    ? (error.details as { error?: unknown }).error
    : undefined;
  return !error.status || responseCode === "COMMIT_RESULT_UNKNOWN";
}

export function shouldResetWorldAxiomsOperation(error: WorldAxiomsSaveError): boolean {
  return error.status === 409 || error.status === 428;
}

export function createWorldAxiomsOperationId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `world-axioms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
