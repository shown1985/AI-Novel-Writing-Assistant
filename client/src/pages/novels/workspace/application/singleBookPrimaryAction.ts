import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import {
  getDirectorCockpitActionHref,
  getDirectorCockpitContinuationMode,
  isDirectorCockpitContinuationAction,
} from "../../../../lib/directorCockpitActions.ts";

export type SingleBookPrimaryActionCommand =
  | {
      kind: "continue";
      novelId: string;
      taskId: string;
      mode?: DirectorContinuationMode;
    }
  | {
      kind: "confirm_candidate" | "open_chapter" | "open_quality_repair" | "open_details";
      novelId: string;
      taskId: string;
    }
  | {
      kind: "navigate";
      novelId: string;
      taskId: string;
      href: string;
    };

export interface SingleBookPrimaryActionLock {
  current: {
    novelId: string;
    requestKey: string;
  } | null;
}

function sameAction(
  left: DirectorBookAutomationAction,
  right: DirectorBookAutomationAction,
): boolean {
  return left.type === right.type
    && left.target.novelId === right.target.novelId
    && left.target.taskId === right.target.taskId
    && left.target.chapterId === right.target.chapterId
    && left.target.tab === right.target.tab
    && left.target.href === right.target.href
    && left.commandPayload?.taskId === right.commandPayload?.taskId
    && left.commandPayload?.continuationMode === right.commandPayload?.continuationMode;
}

export function resolveSingleBookPrimaryActionCommand(input: {
  novelId: string;
  directorTaskId: string | null;
  projection: DirectorBookAutomationProjection | null;
  action: DirectorBookAutomationAction;
}): SingleBookPrimaryActionCommand | null {
  const taskId = input.directorTaskId?.trim() || null;
  const projection = input.projection;
  const projectedAction = projection?.primaryAction ?? null;
  if (
    !taskId
    || !projection
    || !projectedAction
    || projection.novelId !== input.novelId
    || projection.focusNovel.id !== input.novelId
    || projection.latestTask?.id !== taskId
    || input.action.target.novelId !== input.novelId
    || !sameAction(projectedAction, input.action)
  ) {
    return null;
  }

  const suppliedTaskIds = [
    input.action.target.taskId,
    input.action.commandPayload?.taskId,
  ].flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
  if (suppliedTaskIds.some((value) => value !== taskId)) {
    return null;
  }

  if (isDirectorCockpitContinuationAction(input.action)) {
    return {
      kind: "continue",
      novelId: input.novelId,
      taskId,
      mode: getDirectorCockpitContinuationMode(input.action),
    };
  }
  if (
    input.action.type === "confirm_candidate"
    || input.action.type === "open_chapter"
    || input.action.type === "open_quality_repair"
    || input.action.type === "open_details"
  ) {
    return {
      kind: input.action.type,
      novelId: input.novelId,
      taskId,
    };
  }
  if (input.action.type === "open_novel") {
    return {
      kind: "navigate",
      novelId: input.novelId,
      taskId,
      href: getDirectorCockpitActionHref(projection, input.action),
    };
  }
  return null;
}

export function buildSingleBookPrimaryActionRequestKey(
  command: Extract<SingleBookPrimaryActionCommand, { kind: "continue" }>,
): string {
  return [
    command.novelId,
    command.taskId,
    command.kind,
    command.mode ?? "default",
  ].join(":");
}

export function acquireSingleBookPrimaryAction(
  lock: SingleBookPrimaryActionLock,
  novelId: string,
  requestKey: string,
): boolean {
  if (lock.current?.novelId === novelId) {
    return false;
  }
  lock.current = { novelId, requestKey };
  return true;
}

export function releaseSingleBookPrimaryAction(
  lock: SingleBookPrimaryActionLock,
  novelId: string,
  requestKey: string,
): void {
  if (
    lock.current?.novelId === novelId
    && lock.current.requestKey === requestKey
  ) {
    lock.current = null;
  }
}

export function dispatchSingleBookPrimaryAction(
  command: SingleBookPrimaryActionCommand,
  handlers: {
    continue: (
      command: Extract<SingleBookPrimaryActionCommand, { kind: "continue" }>,
    ) => void;
    confirmCandidate: (taskId: string) => void;
    openChapter: (taskId: string) => void;
    openQualityRepair: (taskId: string) => void;
    openDetails: (taskId: string) => void;
    navigate: (href: string) => void;
  },
): void {
  if (command.kind === "continue") {
    handlers.continue(command);
    return;
  }
  if (command.kind === "confirm_candidate") {
    handlers.confirmCandidate(command.taskId);
    return;
  }
  if (command.kind === "open_chapter") {
    handlers.openChapter(command.taskId);
    return;
  }
  if (command.kind === "open_quality_repair") {
    handlers.openQualityRepair(command.taskId);
    return;
  }
  if (command.kind === "open_details") {
    handlers.openDetails(command.taskId);
    return;
  }
  if (command.kind === "navigate") {
    handlers.navigate(command.href);
  }
}
