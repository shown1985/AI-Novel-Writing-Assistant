import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { ideaInspirationElapsedSeconds, selectIdeaInspirationSessions } from "./ideaInspirationLiveState";

interface Props {
  open: boolean;
  request: { key: string; startedAt: number; completedAt?: number } | null;
  isGenerating: boolean;
  hasIdeas: boolean;
}

export default function IdeaInspirationLiveProgress({ open, request, isGenerating, hasIdeas }: Props) {
  const { connected, sessions } = useLlmLiveFeed({ enabled: open && Boolean(request) });
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(isGenerating);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const matched = request ? selectIdeaInspirationSessions(sessions, request.key) : [];
  const latest = matched.at(-1) ?? null;
  const preview = latest?.preview ?? "";
  const reasoning = latest?.reasoning ?? "";

  useEffect(() => {
    if (!open || !request) return;
    setNow(Date.now());
    if (!isGenerating) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, request?.key, request?.startedAt, isGenerating]);

  useEffect(() => {
    setExpanded(isGenerating);
    followingRef.current = true;
    // Only a new request resets the user's expand/collapse choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.key]);

  useEffect(() => {
    if (hasIdeas && !isGenerating) setExpanded(false);
  }, [hasIdeas, isGenerating]);

  useEffect(() => {
    if (expanded && followingRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, preview, reasoning]);

  if (!open || !request) return null;
  const elapsed = ideaInspirationElapsedSeconds(request.startedAt, request.completedAt ?? now);
  const phase = isGenerating
    ? latest?.phase === "failed" || latest?.phase === "cancelled"
      ? "等待本次生成结果"
      : latest?.phaseMessage || (connected ? "等待 AI 开始生成" : "正在连接生成实况")
    : hasIdeas ? "生成完成" : "生成已结束";

  return (
    <section className="mt-4 rounded-lg bg-muted/35 px-4 py-3 text-sm" aria-label="AI 生成实况">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isGenerating ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : null}
          <span className="font-medium" role="status">{phase}</span>
          <span className="text-xs text-muted-foreground">{elapsed} 秒</span>
        </div>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          AI 实况 <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>{connected ? "实况已连接" : isGenerating ? "实况连接中，生成仍在继续" : "实况连接中"}{latest ? ` · 输出 ${latest.totalChars} 字 · 思考 ${latest.totalReasoningChars} 字` : ""}</p>
          {preview || reasoning ? (
            <div
              ref={scrollRef}
              onScroll={(event) => {
                const node = event.currentTarget;
                followingRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
              }}
              className="max-h-44 overflow-y-auto rounded-md bg-background/70 px-3 py-2 leading-5"
            >
              {reasoning ? <><p className="mb-1 font-medium">思考过程</p><p className="mb-2 whitespace-pre-wrap break-words">{reasoning}</p></> : null}
              {preview ? <><p className="mb-1 font-medium">生成内容</p><p className="whitespace-pre-wrap break-words text-foreground">{preview}</p></> : null}
            </div>
          ) : <p>等待 AI 返回内容…</p>}
          {preview ? <p>以上为实时生成内容，请选择生成完成后的开局想法。</p> : null}
        </div>
      ) : null}
    </section>
  );
}
