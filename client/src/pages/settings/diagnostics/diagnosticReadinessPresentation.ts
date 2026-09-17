import type {
  DiagnosticReadinessReport,
  DiagnosticTargetResult,
} from "@ai-novel/shared/types/diagnostics";

export type DiagnosticUiState =
  | "not_checked"
  | "healthy"
  | "failed"
  | "stale"
  | "loading"
  | "error"
  | "pending";

export const DIAGNOSTIC_POLL_INTERVAL_MS = 1_500;

export function hasActiveDiagnosticPending(
  report?: DiagnosticReadinessReport | null,
  now = Date.now(),
): boolean {
  if (!report?.pending) {
    return false;
  }
  const expiresAt = Date.parse(report.pending.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function getDiagnosticPollingInterval(
  report?: DiagnosticReadinessReport | null,
  now = Date.now(),
): number | false {
  return hasActiveDiagnosticPending(report, now) ? DIAGNOSTIC_POLL_INTERVAL_MS : false;
}

export function resolveDiagnosticUiState(input: {
  report?: DiagnosticReadinessReport | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  isChecking?: boolean;
  now?: number;
}): DiagnosticUiState {
  if (input.isChecking) {
    return "pending";
  }
  if (input.isError) {
    return "error";
  }
  if (hasActiveDiagnosticPending(input.report, input.now)) {
    return "pending";
  }
  if (input.isLoading || input.isRefreshing || !input.report) {
    return "loading";
  }
  return input.report.checkState;
}

export function resolveDiagnosticTargetState(
  target: DiagnosticTargetResult | undefined,
  reportState: DiagnosticUiState,
): DiagnosticUiState {
  if (reportState === "loading" || reportState === "error" || reportState === "pending") {
    return reportState;
  }
  return target?.checkState ?? "not_checked";
}

export function getDiagnosticStateLabel(state: DiagnosticUiState): string {
  switch (state) {
    case "healthy":
      return "兼容性正常";
    case "failed":
      return "检测失败";
    case "stale":
      return "配置已变，请重新检测";
    case "loading":
      return "正在读取状态";
    case "error":
      return "状态读取失败";
    case "pending":
      return "检测中";
    case "not_checked":
      return "尚未检测";
  }
}

export function isDiagnosticBlockingCreation(state: DiagnosticUiState): boolean {
  return state === "failed";
}

function formatCapability(target: DiagnosticTargetResult, capability: "plain" | "structured"): string {
  const result = target.capabilities.find((item) => item.capability === capability);
  const label = capability === "plain" ? "普通连通" : "结构化输出";
  if (!result || result.checkState === "not_checked") {
    return `${label}未检测`;
  }
  if (result.checkState === "stale") {
    return `${label}结果已过期`;
  }
  if (result.checkState === "failed") {
    return `${label}失败 · ${result.errorSummary ?? "请检查连接设置"}`;
  }
  const latency = result.latencyMs != null ? ` · ${result.latencyMs}ms` : "";
  if (capability === "structured" && result.structuredDetails) {
    const strategy = result.structuredDetails.strategy ?? "自动";
    return `${label}正常 · ${result.requestProtocol ?? "auto"} · ${strategy}${latency}`;
  }
  return `${label}正常${latency}`;
}

export function formatDiagnosticTargetStatus(target?: DiagnosticTargetResult | null): string {
  if (!target) {
    return "尚未检测生效路由。";
  }
  const parts: string[] = [];
  if (target.checkState === "stale") {
    parts.push("检测结果来自旧配置");
  } else if (target.errorSummary) {
    parts.push(target.errorSummary);
  }
  parts.push(formatCapability(target, "plain"), formatCapability(target, "structured"));
  return `${target.provider ?? "未配置厂商"} / ${target.model ?? "未配置模型"} · ${parts.join(" · ")}`;
}

export function summarizeDiagnosticTargets(targets: DiagnosticTargetResult[]) {
  return targets.reduce((summary, target) => {
    summary[target.checkState] += 1;
    return summary;
  }, {
    not_checked: 0,
    healthy: 0,
    failed: 0,
    stale: 0,
  });
}
