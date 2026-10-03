import type { DiagnosticCapabilityResult, DiagnosticTargetResult } from "@ai-novel/shared/types/diagnostics";

const FAILED_MESSAGE = "检测未完成，请检查连接配置后重试。";

export function sanitizeDiagnosticError(value: unknown): string | null {
  return value == null ? null : FAILED_MESSAGE;
}

function sanitizeCapability(capability: DiagnosticCapabilityResult): DiagnosticCapabilityResult {
  return {
    ...capability,
    errorSummary: sanitizeDiagnosticError(capability.errorSummary),
  };
}

/**
 * Diagnostic persistence is a trust boundary. Provider errors may contain
 * credentials, query strings, prompts, or response bodies, so only a stable
 * user-facing category crosses it.
 */
export function sanitizeDiagnosticTarget(target: DiagnosticTargetResult): DiagnosticTargetResult {
  return {
    ...target,
    errorSummary: sanitizeDiagnosticError(target.errorSummary),
    capabilities: target.capabilities.map(sanitizeCapability),
  };
}
