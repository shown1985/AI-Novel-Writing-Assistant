import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import { motion, useReducedMotion } from "framer-motion";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface NovelAutoDirectorIdeaInspirationPanelProps {
  ideas: DirectorIdeaInspiration[];
  isGenerating: boolean;
  error: string;
  onGenerate: () => void;
  onUseIdea: (text: string) => void;
}

export default function NovelAutoDirectorIdeaInspirationPanel({
  ideas,
  isGenerating,
  error,
  onGenerate,
  onUseIdea,
}: NovelAutoDirectorIdeaInspirationPanelProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="mt-5 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          这些只是临时灵感，使用后仍可继续改。
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onGenerate} disabled={isGenerating}>
          <RefreshCw className="h-4 w-4" />
          {isGenerating ? "生成中..." : error ? "重试" : ideas.length > 0 ? "换一组" : "生成灵感"}
        </Button>
      </div>
      {!isGenerating && error ? <p className="py-6 text-sm text-destructive" role="alert">{error}</p> : null}
      {!isGenerating && !error && ideas.length === 0 ? <p className="py-6 text-sm text-muted-foreground">暂时没有生成想法，请重试。</p> : null}
      {!isGenerating && !error && ideas.length > 0 ? (
        <div className="mt-2 space-y-1">
          {ideas.map((idea, index) => (
            <motion.button
              key={`${idea.angle}-${idea.text}`}
              type="button"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, delay: reducedMotion ? 0 : index * 0.04 }}
              className="flex w-full min-w-0 flex-col gap-3 rounded-lg px-3 py-4 text-left transition hover:bg-muted/45 sm:flex-row sm:items-start sm:justify-between"
              onClick={() => onUseIdea(idea.text)}
            >
              <div className="min-w-0">
                <div className="mb-1 text-xs font-medium text-primary">{idea.angle}</div>
                <div className={`whitespace-pre-wrap text-sm leading-6 text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {idea.text}
                </div>
                {idea.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {idea.tags.join(" · ")}
                  </div>
                ) : null}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 self-end rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary sm:self-start">
                <Check className="h-4 w-4" />
                使用这个想法
              </span>
            </motion.button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
