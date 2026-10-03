const OPEN_LIVE_EXECUTION_EVENT = "live-execution:open";

/** Open the existing global live feed for an action the user just started. */
export function openLiveExecution(): void {
  window.dispatchEvent(new Event(OPEN_LIVE_EXECUTION_EVENT));
}

export function subscribeToLiveExecutionOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_LIVE_EXECUTION_EVENT, listener);
  return () => window.removeEventListener(OPEN_LIVE_EXECUTION_EVENT, listener);
}
