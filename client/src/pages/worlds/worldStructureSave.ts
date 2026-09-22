import type { WorldBindingSupport, WorldStructuredData } from "@ai-novel/shared/types/world";

export type WorldStructureSaveGuard = "none" | "conflict" | "unknown" | "read_required" | "replayed";
export type WorldStructureSaveOutcome = "committed" | "replayed";

export interface PendingWorldStructureOperation {
  operationId: string;
  intentKey: string;
  expectedContentRevision: number;
}

export interface WorldStructureSavePayload {
  worldId: string;
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
  operationId: string;
  expectedContentRevision: number;
}

export function structurePayloadKey(
  structure: WorldStructuredData | null | undefined,
  bindingSupport: WorldBindingSupport | null | undefined,
): string {
  return JSON.stringify({ structure: structure ?? null, bindingSupport: bindingSupport ?? null });
}

export function createWorldStructureOperationId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `world-structure-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createWorldStructureSaveIntent(
  input: {
    worldId: string;
    structure: WorldStructuredData;
    bindingSupport: WorldBindingSupport;
    currentContentRevision: number;
  },
  pending: PendingWorldStructureOperation | null,
  generateOperationId: () => string = createWorldStructureOperationId,
): { payload: WorldStructureSavePayload; pending: PendingWorldStructureOperation } {
  const intentKey = structurePayloadKey(input.structure, input.bindingSupport);
  const canReplay = pending?.intentKey === intentKey;
  const operationId = canReplay && pending ? pending.operationId : generateOperationId();
  const expectedContentRevision = canReplay && pending
    ? pending.expectedContentRevision
    : input.currentContentRevision;
  const nextPending = { operationId, intentKey, expectedContentRevision };
  return {
    payload: {
      worldId: input.worldId,
      structure: input.structure,
      bindingSupport: input.bindingSupport,
      operationId,
      expectedContentRevision,
    },
    pending: nextPending,
  };
}

export function getWorldStructureSaveErrorCode(error: {
  details?: unknown;
}): string | undefined {
  const details = error.details;
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const code = (details as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

export function shouldRetryWorldStructureSave(
  error: { status?: number; details?: unknown },
  failureCount: number,
): boolean {
  if (failureCount >= 1) {
    return false;
  }
  return !error.status || getWorldStructureSaveErrorCode(error) === "COMMIT_RESULT_UNKNOWN";
}

export function worldStructureSaveGuardForError(error: {
  status?: number;
  details?: unknown;
}): WorldStructureSaveGuard {
  if (error.status === 409) {
    return "conflict";
  }
  if (error.status === 428) {
    return "read_required";
  }
  if (!error.status || getWorldStructureSaveErrorCode(error) === "COMMIT_RESULT_UNKNOWN") {
    return "unknown";
  }
  return "none";
}

export function isCurrentWorldStructureResponse(currentWorldId: string, responseWorldId: string): boolean {
  return Boolean(currentWorldId) && currentWorldId === responseWorldId;
}

export function isCurrentWorldStructureRead(input: {
  currentWorldId: string;
  requestedWorldId: string;
  currentRequestToken: number;
  requestToken: number;
}): boolean {
  return Boolean(input.currentWorldId)
    && input.currentWorldId === input.requestedWorldId
    && input.currentRequestToken === input.requestToken;
}

export function shouldAdoptWorldStructurePayload(input: {
  syncedWorldId: string | null;
  incomingWorldId: string;
  incomingPayloadKey: string;
  draftPayloadKey: string;
  syncedPayloadKey: string;
  saveGuard: WorldStructureSaveGuard;
  replayServerPayloadKey?: string | null;
  replaySyncConsumed?: boolean;
  explicitReadPayloadKey?: string | null;
  explicitReadConsumed?: boolean;
}): boolean {
  if (input.syncedWorldId !== input.incomingWorldId) {
    return true;
  }
  if (input.explicitReadPayloadKey && !input.explicitReadConsumed) {
    return input.explicitReadPayloadKey === input.incomingPayloadKey;
  }
  if (input.replayServerPayloadKey && !input.replaySyncConsumed) {
    return input.replayServerPayloadKey === input.incomingPayloadKey;
  }
  if (input.saveGuard !== "none" && input.saveGuard !== "replayed") {
    return false;
  }
  return input.draftPayloadKey === input.syncedPayloadKey;
}

export function worldStructurePayloadKeyFromPersistedWorld(world: {
  structureJson?: string | null;
  bindingSupportJson?: string | null;
}): string | null {
  if (!world.structureJson?.trim()) {
    return null;
  }
  try {
    return structurePayloadKey(
      JSON.parse(world.structureJson) as WorldStructuredData,
      world.bindingSupportJson ? JSON.parse(world.bindingSupportJson) : null,
    );
  } catch {
    return null;
  }
}
