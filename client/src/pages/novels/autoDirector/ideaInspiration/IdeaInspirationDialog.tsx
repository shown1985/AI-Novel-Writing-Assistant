import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import NovelAutoDirectorIdeaInspirationPanel from "../../components/NovelAutoDirectorIdeaInspirationPanel";
import IdeaInspirationLiveProgress from "./IdeaInspirationLiveProgress";

interface IdeaInspirationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { idea: string; worldName: string } | null;
  ideas: DirectorIdeaInspiration[];
  liveRequest: { key: string; startedAt: number; completedAt?: number } | null;
  isGenerating: boolean;
  error: string;
  onGenerate: () => void;
  onUseIdea: (text: string) => void;
}

export default function IdeaInspirationDialog({
  open, onOpenChange, source, ideas, liveRequest, isGenerating, error, onGenerate, onUseIdea,
}: IdeaInspirationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="选择一个开局想法"
        description="AI 会结合你的输入与创作世界；选中后仍可修改。"
        className="max-h-[min(48rem,80dvh)] w-[calc(100vw-2rem)] max-w-none border-0 sm:w-[min(85vw,64rem)] sm:max-w-none"
        headerClassName="border-0 pb-2"
        bodyClassName="pt-2"
      >
        <div className="space-y-1 rounded-lg bg-muted/45 px-4 py-2 text-sm leading-6">
          <p className="truncate"><span className="text-muted-foreground">创作世界：</span>{source?.worldName || "由 AI 自由构思"}</p>
          <p className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words"><span className="text-muted-foreground">你的输入：</span>{source?.idea || "未填写，AI 自由构思"}</p>
        </div>
        <NovelAutoDirectorIdeaInspirationPanel
          ideas={ideas}
          isGenerating={isGenerating}
          error={error}
          onGenerate={onGenerate}
          onUseIdea={onUseIdea}
        />
        <IdeaInspirationLiveProgress open={open} request={liveRequest} isGenerating={isGenerating} hasIdeas={ideas.length > 0} />
      </AppDialogContent>
    </Dialog>
  );
}
