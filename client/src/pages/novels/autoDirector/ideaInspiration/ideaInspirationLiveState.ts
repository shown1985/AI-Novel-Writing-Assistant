import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";

export function selectIdeaInspirationSessions(sessions: LlmLiveSessionSnapshot[], key: string) {
  return sessions.filter((session) =>
    session.context.itemKey === key
    && session.context.promptId === "novel.director.idea_inspiration"
  ).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function ideaInspirationElapsedSeconds(startedAt: number, now: number) {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
