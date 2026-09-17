import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { DiagnosticReadinessReport } from "@ai-novel/shared/types/diagnostics";
import { getDiagnosticPollingInterval } from "./diagnosticReadinessPresentation.ts";

type DiagnosticReadinessResponse = ApiResponse<DiagnosticReadinessReport>;

type DiagnosticQuerySnapshot<TResponse extends DiagnosticReadinessResponse> = {
  state: {
    data?: TResponse;
  };
};

type DiagnosticQueryCache = {
  invalidateQueries: (filters: {
    queryKey: readonly unknown[];
    exact: true;
  }) => Promise<unknown>;
  resetQueries: (filters: {
    queryKey: readonly unknown[];
    exact: true;
  }) => Promise<unknown>;
};

export function createDiagnosticReadQueryPolicy<TResponse extends DiagnosticReadinessResponse>(
  queryFn: () => Promise<TResponse>,
) {
  return {
    queryFn,
    refetchOnWindowFocus: true,
    refetchInterval: (query: DiagnosticQuerySnapshot<TResponse>) =>
      getDiagnosticPollingInterval(query.state.data?.data),
  };
}

export function createExplicitDiagnosticCheckController<TResult>(
  command: () => Promise<TResult>,
) {
  let activeRequest: Promise<TResult> | null = null;

  return {
    run(): Promise<TResult> {
      if (activeRequest) {
        return activeRequest;
      }
      const commandRequest = Promise.resolve().then(command);
      const trackedRequest = commandRequest.finally(() => {
        if (activeRequest === trackedRequest) {
          activeRequest = null;
        }
      });
      activeRequest = trackedRequest;
      return trackedRequest;
    },
    isPending(): boolean {
      return activeRequest != null;
    },
  };
}

export async function refreshDiagnosticReadinessAfterCheck(
  queryClient: DiagnosticQueryCache,
  queryKey: readonly unknown[],
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey, exact: true });
}

export async function resetDiagnosticReadinessAfterConfigurationChange(
  queryClient: DiagnosticQueryCache,
  queryKey: readonly unknown[],
): Promise<void> {
  await queryClient.resetQueries({ queryKey, exact: true });
}
