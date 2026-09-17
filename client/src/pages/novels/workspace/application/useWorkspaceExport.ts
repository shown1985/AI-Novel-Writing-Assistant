import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  NovelExportDownloadFormat,
  NovelExportFormat,
  NovelExportScope,
} from "@ai-novel/shared/types/novelExport";
import { downloadNovelExport } from "@/api/novel";
import { toast } from "@/components/ui/toast";
import { isNovelWorkspaceFlowTab } from "../../novelWorkspaceNavigation";

function startDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface WorkspaceExportInput {
  activeTab: string;
  draftTitle: string;
  novelId: string;
  savedTitle?: string | null;
}

/** Owns download commands and their current-book/current-scope pending state. */
export function useWorkspaceExport({
  activeTab,
  draftTitle,
  novelId,
  savedTitle,
}: WorkspaceExportInput) {
  const mutation = useMutation({
    mutationFn: async (input: {
      format: NovelExportFormat;
      scope: NovelExportScope;
      novelTitle: string;
    }) => {
      const exported = await downloadNovelExport(
        novelId,
        input.format,
        input.scope,
        input.novelTitle,
      );
      return { ...exported, scope: input.scope, format: input.format };
    },
    onSuccess: ({ blob, fileName, scope }) => {
      startDownload(blob, fileName);
      toast.success(scope === "full" ? "整本书导出已开始。" : "当前步骤导出已开始。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导出失败。");
    },
  });
  const novelTitle = useMemo(
    () => draftTitle.trim() || savedTitle?.trim() || novelId,
    [draftTitle, novelId, savedTitle],
  );
  const currentScope = isNovelWorkspaceFlowTab(activeTab) && activeTab !== "world"
    ? activeTab
    : null;
  const isPending = (scope: NovelExportScope, format: NovelExportFormat) => (
    mutation.isPending
    && mutation.variables?.scope === scope
    && mutation.variables?.format === format
  );
  const run = (scope: NovelExportScope, format: NovelExportFormat) => {
    mutation.mutate({ format, scope, novelTitle });
  };

  return {
    canExportCurrentStep: Boolean(currentScope),
    isExportingCurrentMarkdown: Boolean(currentScope && isPending(currentScope, "markdown")),
    isExportingCurrentJson: Boolean(currentScope && isPending(currentScope, "json")),
    isExportingFullMarkdown: isPending("full", "markdown"),
    isExportingFullJson: isPending("full", "json"),
    isExportingFullTxt: isPending("full", "txt"),
    onExportCurrent: (format: NovelExportDownloadFormat) => {
      if (currentScope) {
        run(currentScope, format);
      }
    },
    onExportFull: (format: NovelExportFormat) => run("full", format),
  };
}
