export function matchesCurrentDirectionVersion(currentVersionId: string | undefined, requestedVersionId: string): boolean {
  return Boolean(currentVersionId && requestedVersionId && currentVersionId === requestedVersionId);
}

export function canClaimDirectionEdit(seed: {
  currentIntentVersionId?: string;
  directionConfirmationClaimed?: boolean;
} | null | undefined, requestedVersionId: string): boolean {
  return Boolean(seed && !seed.directionConfirmationClaimed
    && matchesCurrentDirectionVersion(seed.currentIntentVersionId, requestedVersionId));
}

export function canClaimDirectionRegeneration(input: {
  status: string;
  novelId?: string | null;
  hasConfirmation: boolean;
  directionConfirmationClaimed?: boolean;
}): boolean {
  return (input.status === "waiting_approval" || input.status === "failed")
    && !input.novelId && !input.hasConfirmation && !input.directionConfirmationClaimed;
}

export function canRestorePriorDirections(input: {
  taskId: string;
  currentIntentVersionId?: string;
  priorIntent?: { id: string; workflowTaskId: string | null; status: string } | null;
}): boolean {
  return Boolean(input.currentIntentVersionId
    && input.priorIntent?.id === input.currentIntentVersionId
    && input.priorIntent.workflowTaskId === input.taskId
    && input.priorIntent.status === "proposed");
}
