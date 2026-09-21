import { useEffect, useRef, useState } from "react";
import type { LlmAttemptProvenance } from "@ai-novel/shared/types/llm";
import { getLlmAttemptProvenance } from "@/api/llmProvenance";
import { createLlmProvenanceRequestGuard } from "./llmAttemptProvenanceGuard";

export interface LlmAttemptProvenanceState {
  data: LlmAttemptProvenance | null;
  isLoading: boolean;
  error: boolean;
}

export function useLlmAttemptProvenance(
  requestId?: string | null,
  scopeKey?: string | null,
): LlmAttemptProvenanceState {
  const [state, setState] = useState<LlmAttemptProvenanceState>({
    data: null,
    isLoading: false,
    error: false,
  });
  const guardRef = useRef<ReturnType<typeof createLlmProvenanceRequestGuard> | null>(null);
  if (!guardRef.current) {
    guardRef.current = createLlmProvenanceRequestGuard();
  }

  useEffect(() => {
    const normalizedRequestId = requestId?.trim() || null;
    guardRef.current?.invalidate();
    setState({ data: null, isLoading: Boolean(normalizedRequestId), error: false });
    if (!normalizedRequestId) {
      return () => guardRef.current?.invalidate();
    }

    const requestKey = `${scopeKey?.trim() || "global"}:${normalizedRequestId}`;
    const request = guardRef.current?.begin(requestKey);
    if (!request) {
      return;
    }
    void getLlmAttemptProvenance(normalizedRequestId).then((data) => {
      if (!guardRef.current?.isCurrent(request, requestKey)) {
        return;
      }
      setState({ data, isLoading: false, error: false });
    }).catch(() => {
      if (!guardRef.current?.isCurrent(request, requestKey)) {
        return;
      }
      setState({ data: null, isLoading: false, error: true });
    });
    return () => guardRef.current?.invalidate();
  }, [requestId, scopeKey]);

  return state;
}
