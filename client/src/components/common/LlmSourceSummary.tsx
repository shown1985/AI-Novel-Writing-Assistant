import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";
import { useLlmAttemptProvenance } from "@/hooks/useLlmAttemptProvenance";
import {
  attemptResultLabel,
  attemptRoleLabel,
  buildLlmSourceSummaryModel,
} from "./llmSourceSummaryModel";

function SourceRoute({ value }: { value: string }) {
  return <span className="truncate text-emerald-100/80">{value}</span>;
}

/** Read-only, reusable model source summary. It is intentionally mounted only by LiveExecutionDialog. */
export function LlmSourceSummary({ session, scopeKey }: { session: LlmLiveSessionSnapshot; scopeKey?: string | null }) {
  const provenanceState = useLlmAttemptProvenance(session.context.requestId, scopeKey);
  const model = buildLlmSourceSummaryModel({
    expectedProvider: session.context.provider,
    expectedModel: session.context.model,
    requestId: session.context.requestId,
    provenance: provenanceState.data,
    readError: provenanceState.error,
  });
  const actual = provenanceState.isLoading ? "正在读取…" : model.actual;

  return (
    <div className="mt-1 space-y-1 text-[10px] leading-5 text-emerald-100/60" data-testid="llm-source-summary">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>预计 <SourceRoute value={model.expected} /></span>
        <span>实际 <SourceRoute value={actual} /></span>
      </div>
      <div className="text-emerald-100/50">{provenanceState.isLoading ? "正在读取本次调用记录…" : model.note}</div>
      {model.hasFallback ? <div className="text-amber-200/75">包含备用尝试，展开详情可查看调用顺序。</div> : null}
      {model.showDetails && !provenanceState.isLoading ? (
        <details className="group pt-0.5">
          <summary className="cursor-pointer list-none text-emerald-200/75 hover:text-emerald-50">
            <span className="group-open:hidden">查看重试与备用详情</span>
            <span className="hidden group-open:inline">收起重试与备用详情</span>
          </summary>
          <div className="mt-1 space-y-1 text-emerald-100/55">
            {model.attempts.map((attempt) => (
              <div key={attempt.attemptId} className="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-emerald-400/10 pt-1 first:border-t-0">
                <span>{attempt.attemptIndex + 1}. {attemptRoleLabel(attempt.role)}</span>
                <span>{attempt.provider || "未提供"} / {attempt.model || "未提供"}</span>
                <span>{attemptResultLabel(attempt)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
