/** Generation guard for request-scoped reads; late responses cannot become current UI state. */
export function createLlmProvenanceRequestGuard() {
  let generation = 0;
  return {
    begin(requestId: string): { requestId: string; generation: number } {
      generation += 1;
      return { requestId, generation };
    },
    isCurrent(request: { requestId: string; generation: number }, requestId: string): boolean {
      return request.requestId === requestId && request.generation === generation;
    },
    invalidate(): void {
      generation += 1;
    },
  };
}
