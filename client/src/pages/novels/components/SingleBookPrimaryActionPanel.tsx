import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNextAction } from "@/components/workspace";
import type {
  SingleBookDisplayModel,
  SingleBookPrimaryActionControl,
} from "./NovelEditView.types";

interface SingleBookPrimaryActionPanelProps {
  display: SingleBookDisplayModel;
  control: SingleBookPrimaryActionControl;
}

export default function SingleBookPrimaryActionPanel({
  display,
  control,
}: SingleBookPrimaryActionPanelProps) {
  const action = display.primaryAction;
  if (!action && !control.feedback && !control.error) {
    return null;
  }

  const scopeDescription = display.taskProgress.description
    ? `${display.taskProgress.label} · ${display.taskProgress.description}`
    : display.taskProgress.label;
  const description = action
    ? display.primaryActionReason || "按当前任务状态执行系统推荐的下一步。"
    : control.error || control.feedback || "正在读取本书最新任务状态。";
  const consequence = control.error
    ? `${control.error} 已保存正文不会受影响；可以重新提交，或刷新本书状态后再试。`
    : control.feedback
      ? control.feedback
      : `影响范围：${scopeDescription}。已保存正文会保留。`;

  return (
    <WorkspaceNextAction
      className="rounded-xl border-transparent bg-muted/30 shadow-none"
      icon={control.isPending ? Loader2 : ArrowRight}
      tone={control.error ? "danger" : control.feedback ? "success" : display.severity.tone}
      title={action ? `建议下一步：${action.label}` : "正在同步本书任务状态"}
      description={description}
      consequence={consequence}
      action={action ? (
        <Button
          type="button"
          size="sm"
          onClick={() => control.onExecute(action)}
          disabled={control.isPending}
        >
          {control.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {control.isPending ? "正在提交..." : action.label}
        </Button>
      ) : null}
    />
  );
}
