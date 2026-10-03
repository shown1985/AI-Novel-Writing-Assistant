import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import type { CreativeCarryoverContract, CreativeCarryoverMode } from "@ai-novel/shared/types/creativeCarryoverContract";

interface CarryoverSourceInput {
  basicForm: Pick<NovelBasicFormState, "writingMode" | "continuationBookAnalysisId" | "referenceBookAnalysisId">;
  formInitialized: boolean;
  initialMode: CreativeCarryoverMode | "";
  initialBookAnalysisId: string;
  restoredContract?: Pick<CreativeCarryoverContract, "mode" | "bookAnalysisId"> | null;
}

/** URL values seed the form once; subsequent edits and restored drafts own the active source. */
export function resolveCarryoverSource(input: CarryoverSourceInput): {
  mode: CreativeCarryoverMode | "";
  bookAnalysisId: string;
} {
  const continuation = input.basicForm.writingMode === "continuation";
  const formAnalysisId = (continuation
    ? input.basicForm.continuationBookAnalysisId
    : input.basicForm.referenceBookAnalysisId).trim();
  if (input.formInitialized || formAnalysisId) {
    return {
      mode: continuation ? "continuation" : formAnalysisId ? "adaptation" : "",
      bookAnalysisId: formAnalysisId,
    };
  }
  if (input.initialMode && input.initialBookAnalysisId.trim()) {
    return { mode: input.initialMode, bookAnalysisId: input.initialBookAnalysisId.trim() };
  }
  return {
    mode: input.restoredContract?.mode ?? "",
    bookAnalysisId: input.restoredContract?.bookAnalysisId ?? "",
  };
}
