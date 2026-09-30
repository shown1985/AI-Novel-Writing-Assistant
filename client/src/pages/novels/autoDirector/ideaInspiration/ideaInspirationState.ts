export interface IdeaInspirationContext {
  idea: string;
  worldId: string;
  genreId: string;
  primaryStoryModeId: string;
  secondaryStoryModeId: string;
}

export function ideaInspirationContextKey(context: IdeaInspirationContext): string {
  return JSON.stringify(context);
}

export function isCurrentIdeaInspirationRequest(
  requestId: number,
  latestRequestId: number,
  requestedContext: string,
  currentContext: string,
): boolean {
  return requestId === latestRequestId && requestedContext === currentContext;
}
