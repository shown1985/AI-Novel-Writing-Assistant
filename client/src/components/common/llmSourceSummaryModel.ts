import type {
  LlmAttemptProvenance,
  LlmAttemptProvenanceAttempt,
} from "@ai-novel/shared/types/llm";

export interface LlmSourceSummaryModel {
  expected: string;
  actual: string;
  note: string;
  hasFallback: boolean;
  attempts: LlmAttemptProvenanceAttempt[];
  showDetails: boolean;
}

function routeLabel(provider: string | null, model: string | null): string {
  const route = [provider, model].filter(Boolean).join(" / ");
  return route || "未提供";
}

function adoptedAttempt(provenance: LlmAttemptProvenance): LlmAttemptProvenanceAttempt | null {
  if (!provenance.adoptedAttemptId) {
    return null;
  }
  return provenance.attempts.find((attempt) => attempt.attemptId === provenance.adoptedAttemptId) ?? null;
}

export function buildLlmSourceSummaryModel(input: {
  expectedProvider?: string | null;
  expectedModel?: string | null;
  requestId?: string | null;
  provenance?: LlmAttemptProvenance | null;
  readError?: boolean;
}): LlmSourceSummaryModel {
  const expected = routeLabel(input.expectedProvider?.trim() || null, input.expectedModel?.trim() || null);
  const provenance = input.provenance;
  if (!input.requestId?.trim()) {
    return {
      expected,
      actual: "等待本次调用记录",
      note: "当前实况只提供预计选择，实际调用可能变化。",
      hasFallback: false,
      attempts: [],
      showDetails: false,
    };
  }
  if (input.readError || provenance?.status === "error") {
    return {
      expected,
      actual: "无法确认（读取失败）",
      note: "来源记录暂时无法读取，本次实际采用模型未确认。",
      hasFallback: false,
      attempts: [],
      showDetails: false,
    };
  }
  if (!provenance || provenance.status === "not_found") {
    return {
      expected,
      actual: "未记录",
      note: "没有找到本次调用的来源记录，不能把预计模型当作实际模型。",
      hasFallback: false,
      attempts: [],
      showDetails: false,
    };
  }

  const adopted = adoptedAttempt(provenance);
  const hasFallback = provenance.attempts.some((attempt) => (
    attempt.routeTier === "fallback" || attempt.role === "fallback"
  ));
  const note = !adopted
    ? "本次调用已记录尝试，但未标记实际采用模型。"
    : provenance.attributionStatus === "partial"
      ? "本次实际采用模型已记录，但来源归因信息不完整。"
      : provenance.attributionStatus === "unattributed"
        ? "本次实际采用模型已记录，但未能关联到具体创作来源。"
        : hasFallback
          ? "本次调用包含备用尝试，详情可展开查看。"
          : "实际采用模型来自本次调用记录。";
  return {
    expected,
    actual: adopted ? routeLabel(adopted.provider, adopted.model) : "未记录",
    note,
    hasFallback,
    attempts: provenance.attempts,
    showDetails: provenance.attempts.length > 1 || provenance.attributionStatus !== "complete",
  };
}

export function attemptRoleLabel(role: LlmAttemptProvenanceAttempt["role"]): string {
  return {
    primary: "首选",
    retry: "重试",
    repair: "修复",
    fallback: "备用",
    unknown: "未标注",
  }[role];
}

export function attemptResultLabel(attempt: LlmAttemptProvenanceAttempt): string {
  if (attempt.finalAdoption === "adopted") return "已采用";
  if (attempt.status === "succeeded") return "未采用";
  if (attempt.status === "failed") {
    const failureCategory = attempt.failureCategory ? {
      transport: "连接问题",
      timeout: "响应超时",
      cancelled: "已取消",
      validation: "结果检查未通过",
      unknown: "未分类问题",
    }[attempt.failureCategory] : null;
    return failureCategory ? `失败 · ${failureCategory}` : "失败";
  }
  if (attempt.status === "cancelled") return "已取消";
  if (attempt.status === "started") return "进行中";
  return "未记录结果";
}
