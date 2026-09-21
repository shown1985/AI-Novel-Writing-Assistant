import type { LlmAttemptProvenance } from "@ai-novel/shared/types/llm";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

/** Read persisted evidence for one live model request; this never starts or mutates a model call. */
export async function getLlmAttemptProvenance(requestId: string): Promise<LlmAttemptProvenance> {
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) {
    throw new Error("缺少本次调用的来源记录标识。");
  }
  const { data } = await apiClient.get<ApiResponse<LlmAttemptProvenance>>(
    `/llm/attempt-requests/${encodeURIComponent(normalizedRequestId)}/provenance`,
    { suppressErrorToast: true },
  );
  if (!data.success || !data.data) {
    throw new Error("本次调用的来源记录暂时无法读取。");
  }
  return data.data;
}
