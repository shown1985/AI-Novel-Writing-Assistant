import { CircleAlert, CircleCheck, CircleDashed, Clock3, Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { DiagnosticReadinessReport, DiagnosticTargetResult } from "@ai-novel/shared/types/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RagJobSummary } from "@/api/knowledge";
import { getDiagnosticStateLabel, type DiagnosticUiState } from "@/pages/settings/diagnostics";
import {
  formatRagJobMeta,
  formatStatus,
  getRagJobProgressPercent,
  getRagJobProgressWidth,
} from "./knowledgeRagUi";

interface KnowledgeOpsTabProps {
  visibleDocumentsCount: number;
  enabledCount: number;
  disabledCount: number;
  ragReadiness?: DiagnosticReadinessReport;
  ragReadinessState: DiagnosticUiState;
  ragReadinessNotice?: string;
  jobs: RagJobSummary[];
  failedJobs: RagJobSummary[];
  actionMessage?: string;
  isClearingJobs: boolean;
  deletingJobId?: string;
  onClearFinishedJobs: () => void;
  onDeleteJob: (jobId: string) => void;
  onOpenSettings: () => void;
  onCheckReadiness: () => void;
  onRetryReadiness: () => void;
}

const FINISHED_RAG_JOB_STATUSES = new Set<RagJobSummary["status"]>(["succeeded", "failed", "cancelled"]);

const OWNER_LABELS: Record<string, string> = {
  novel: "小说资料",
  chapter: "章节正文",
  world: "本书世界",
  world_library_item: "世界样本",
  character: "角色资料",
  character_timeline: "角色经历",
  bible: "创作设定",
  chapter_summary: "章节摘要",
  consistency_fact: "连续性资料",
  knowledge_document: "知识资料",
  chat_message: "创作对话",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  upsert: "更新检索内容",
  rebuild: "重新建立索引",
  delete: "移除检索内容",
};

function canDeleteRagJob(job: RagJobSummary): boolean {
  return FINISHED_RAG_JOB_STATUSES.has(job.status);
}

function formatOwnerLabel(ownerType: string): string {
  return OWNER_LABELS[ownerType] ?? "创作资料";
}

function formatJobType(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? "同步检索内容";
}

function getReadinessPresentation(state: DiagnosticUiState) {
  switch (state) {
    case "healthy":
      return {
        title: "资料可以用于创作",
        description: "向量模型与资料库最近一次检测正常，已完成索引的资料可以参与创作。",
        surface: "bg-success/[0.065]",
        iconSurface: "bg-success/10 text-success",
        icon: CircleCheck,
      };
    case "failed":
      return {
        title: "资料连接检测未通过",
        description: "查看连接详情并修复对应设置；失败记录不会自动修改你的配置。",
        surface: "bg-destructive/[0.055]",
        iconSurface: "bg-destructive/10 text-destructive",
        icon: CircleAlert,
      };
    case "stale":
      return {
        title: "资料连接状态已过期",
        description: "检索配置发生了变化；这不是连接失败，可在需要时重新检测。",
        surface: "bg-sky-500/[0.055]",
        iconSurface: "bg-sky-500/10 text-sky-700",
        icon: CircleDashed,
      };
    case "not_checked":
      return {
        title: "资料连接尚未检测",
        description: "未检测不等于连接失败，也不会影响不依赖知识库的基础创作。",
        surface: "bg-muted/25",
        iconSurface: "bg-muted/70 text-muted-foreground",
        icon: CircleDashed,
      };
    case "error":
      return {
        title: "无法读取连接记录",
        description: "状态读取暂时失败；这不代表向量模型或资料库连接失败。",
        surface: "bg-amber-500/[0.055]",
        iconSurface: "bg-amber-500/10 text-amber-700",
        icon: CircleAlert,
      };
    case "pending":
      return {
        title: "正在检测资料连接",
        description: "正在检查向量模型与资料库；页面会自动读取完成结果。",
        surface: "bg-amber-500/[0.055]",
        iconSurface: "bg-amber-500/10 text-amber-700",
        icon: Loader2,
      };
    case "loading":
      return {
        title: "正在读取连接记录",
        description: "这里只读取最近诊断，不会调用向量模型或资料库。",
        surface: "bg-muted/25",
        iconSurface: "bg-muted/70 text-muted-foreground",
        icon: Loader2,
      };
  }
}

function formatTargetDetail(target?: DiagnosticTargetResult): string {
  if (!target) {
    return "尚未获得这个目标的检测记录";
  }
  const identity = [target.provider, target.model].filter(Boolean).join(" · ");
  const error = target.errorSummary ? ` · ${target.errorSummary}` : "";
  return `${identity || "配置已读取"} · ${getDiagnosticStateLabel(target.checkState)}${error}`;
}

export default function KnowledgeOpsTab({
  visibleDocumentsCount,
  enabledCount,
  disabledCount,
  ragReadiness,
  ragReadinessState,
  ragReadinessNotice,
  jobs,
  failedJobs,
  actionMessage,
  isClearingJobs,
  deletingJobId,
  onClearFinishedJobs,
  onDeleteJob,
  onOpenSettings,
  onCheckReadiness,
  onRetryReadiness,
}: KnowledgeOpsTabProps) {
  const finishedJobCount = jobs.filter((job) => canDeleteRagJob(job)).length;
  const activeJobCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const presentation = getReadinessPresentation(ragReadinessState);
  const StatusIcon = presentation.icon;
  const embeddingTarget = ragReadiness?.targets.find((target) => target.targetKind === "rag_embedding");
  const vectorTarget = ragReadiness?.targets.find((target) => target.targetKind === "rag_vector_store");
  const diagnosticBusy = ragReadinessState === "loading" || ragReadinessState === "pending";

  return (
    <div className="space-y-6">
      <section
        aria-label="资料检索可用状态"
        className={`rounded-3xl px-5 py-5 sm:px-6 ${presentation.surface}`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${presentation.iconSurface}`}>
              <StatusIcon className={`h-5 w-5 ${diagnosticBusy ? "animate-spin" : ""}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">
                {presentation.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {presentation.description}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {ragReadinessState === "failed" ? (
              <Button type="button" size="sm" variant="outline" className="w-full rounded-full sm:w-auto" onClick={onOpenSettings}>
                打开检索设置
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="w-full rounded-full sm:w-auto"
              variant={ragReadinessState === "healthy" ? "outline" : "default"}
              onClick={ragReadinessState === "error" ? onRetryReadiness : onCheckReadiness}
              disabled={diagnosticBusy}
            >
              <RefreshCw className={`h-4 w-4 ${diagnosticBusy ? "animate-spin" : ""}`} />
              {ragReadinessState === "error"
                ? "重新读取状态"
                : diagnosticBusy
                  ? ragReadinessState === "pending" ? "检测中..." : "读取中..."
                  : ragReadiness?.diagnosticId ? "重新检测" : "检测资料连接"}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-foreground/[0.06] pt-4 text-sm">
          <span><strong className="tabular-nums">{visibleDocumentsCount}</strong> 份资料</span>
          <span className="text-muted-foreground"><strong className="font-semibold tabular-nums text-foreground">{enabledCount}</strong> 份已启用</span>
          {disabledCount > 0 ? (
            <span className="text-muted-foreground"><strong className="font-semibold tabular-nums text-foreground">{disabledCount}</strong> 份已停用</span>
          ) : null}
          <span className="text-muted-foreground"><strong className="font-semibold tabular-nums text-foreground">{activeJobCount}</strong> 个同步中</span>
          {failedJobs.length > 0 ? (
            <span className="text-destructive"><strong className="font-semibold tabular-nums">{failedJobs.length}</strong> 个任务失败</span>
          ) : null}
        </div>

        <details className="group mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer list-none marker:hidden">查看连接详情</summary>
          <div className="mt-3 grid gap-3 rounded-2xl bg-background/55 p-4 sm:grid-cols-2">
            <div>
              <div className="font-medium text-foreground">向量模型</div>
              <div className="mt-1 break-words">
                {formatTargetDetail(embeddingTarget)}
              </div>
            </div>
            <div>
              <div className="font-medium text-foreground">资料库连接</div>
              <div className="mt-1 break-words">{formatTargetDetail(vectorTarget)}</div>
            </div>
            {ragReadinessNotice ? <div className="sm:col-span-2">{ragReadinessNotice}</div> : null}
          </div>
        </details>
      </section>

      <section aria-labelledby="knowledge-jobs-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="knowledge-jobs-title" className="text-xl font-semibold tracking-tight">资料同步记录</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">查看资料进入检索库的进度；失败原因会直接显示，运行细节按需展开。</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full rounded-full text-muted-foreground sm:w-auto"
            onClick={onClearFinishedJobs}
            disabled={isClearingJobs || finishedJobCount === 0}
          >
            <Trash2 className="h-4 w-4" />
            {isClearingJobs ? "清理中..." : `清理记录 ${finishedJobCount}`}
          </Button>
        </div>

        {actionMessage ? (
          <div className="mt-4 rounded-2xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{actionMessage}</div>
        ) : null}

        {jobs.length === 0 ? (
          <div className="mt-5 flex min-h-44 flex-col items-center justify-center rounded-3xl bg-muted/20 px-6 text-center">
            <Database className="h-6 w-6 text-muted-foreground/60" />
            <div className="mt-3 font-medium">还没有资料同步记录</div>
            <div className="mt-1 text-sm text-muted-foreground">上传资料或重建索引后，可以在这里查看进度。</div>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {jobs.map((job) => {
              const failed = job.status === "failed";
              const active = job.status === "queued" || job.status === "running";
              return (
                <article
                  key={job.id}
                  className={`rounded-2xl border p-4 ${failed ? "border-destructive/20 bg-destructive/[0.025]" : "border-border/35 bg-card/70"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${failed ? "bg-destructive/10 text-destructive" : active ? "bg-info/10 text-info" : "bg-muted/60 text-muted-foreground"}`}>
                        {failed ? <CircleAlert className="h-4 w-4" /> : active ? <Clock3 className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{formatOwnerLabel(job.ownerType)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{formatJobType(job.jobType)}</div>
                      </div>
                    </div>
                    <Badge variant="secondary" className={`border-0 font-normal ${failed ? "bg-destructive/10 text-destructive" : active ? "bg-info/10 text-info" : "bg-muted/60"}`}>
                      {formatStatus(job.status)}
                    </Badge>
                  </div>

                  {job.progress ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span>{job.progress.label}</span>
                        <span className="tabular-nums text-muted-foreground">{getRagJobProgressPercent(job)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${failed ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: getRagJobProgressWidth(job) }}
                        />
                      </div>
                      {job.progress.detail ? <div className="text-xs text-muted-foreground">{job.progress.detail}</div> : null}
                    </div>
                  ) : null}

                  {job.lastError ? (
                    <div className="mt-3 rounded-xl bg-destructive/[0.06] px-3 py-2 text-xs leading-5 text-destructive">{job.lastError}</div>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                    <details className="group min-w-0 text-xs text-muted-foreground">
                      <summary className="cursor-pointer list-none marker:hidden">任务详情</summary>
                      <div className="mt-2 space-y-1 break-all">
                        <div>{formatRagJobMeta(job)}</div>
                        <div>{job.ownerType}:{job.ownerId}</div>
                      </div>
                    </details>
                    {canDeleteRagJob(job) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 rounded-full px-2 text-muted-foreground"
                        onClick={() => onDeleteJob(job.id)}
                        disabled={deletingJobId === job.id}
                        aria-label="删除任务记录"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingJobId === job.id ? "删除中..." : "删除"}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
