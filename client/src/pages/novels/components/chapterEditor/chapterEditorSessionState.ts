export type ChapterEditorAuxiliaryPanel = "reference" | "collaboration";

export interface ChapterEditorPanelState {
  referenceOpen: boolean;
  collaborationOpen: boolean;
  lastOpened: ChapterEditorAuxiliaryPanel | null;
}

export interface ExternalChapterContentInput {
  incomingContent: string;
  lastIncomingContent: string;
  draftContent: string;
  savedContent: string;
  hasPendingRevision: boolean;
}

export type ExternalChapterContentDecision = "unchanged" | "accept" | "conflict";

export const CLOSED_CHAPTER_EDITOR_PANELS: ChapterEditorPanelState = {
  referenceOpen: false,
  collaborationOpen: false,
  lastOpened: null,
};

export function buildChapterEditorSessionIdentity(novelId: string, chapterId: string): string {
  return `${novelId}:${chapterId}`;
}

export function isChapterEditorWorkspaceRequested(
  requestedIdentity: string | null,
  currentIdentity: string,
): boolean {
  return requestedIdentity === currentIdentity;
}

function panelIsOpen(state: ChapterEditorPanelState, panel: ChapterEditorAuxiliaryPanel): boolean {
  return panel === "reference" ? state.referenceOpen : state.collaborationOpen;
}

export function setChapterEditorPanelOpen(
  state: ChapterEditorPanelState,
  panel: ChapterEditorAuxiliaryPanel,
  open: boolean,
  narrowViewport: boolean,
): ChapterEditorPanelState {
  if (!open) {
    return panel === "reference"
      ? { ...state, referenceOpen: false }
      : { ...state, collaborationOpen: false };
  }

  if (panel === "reference") {
    return {
      referenceOpen: true,
      collaborationOpen: narrowViewport ? false : state.collaborationOpen,
      lastOpened: "reference",
    };
  }

  return {
    referenceOpen: narrowViewport ? false : state.referenceOpen,
    collaborationOpen: true,
    lastOpened: "collaboration",
  };
}

export function toggleChapterEditorPanel(
  state: ChapterEditorPanelState,
  panel: ChapterEditorAuxiliaryPanel,
  narrowViewport: boolean,
): ChapterEditorPanelState {
  return setChapterEditorPanelOpen(state, panel, !panelIsOpen(state, panel), narrowViewport);
}

export function constrainChapterEditorPanelsForViewport(
  state: ChapterEditorPanelState,
  narrowViewport: boolean,
): ChapterEditorPanelState {
  if (!narrowViewport || !state.referenceOpen || !state.collaborationOpen) {
    return state;
  }

  const panelToKeep = state.lastOpened ?? "collaboration";
  return setChapterEditorPanelOpen(state, panelToKeep, true, true);
}

export function decideExternalChapterContent(
  input: ExternalChapterContentInput,
): ExternalChapterContentDecision {
  if (input.incomingContent === input.lastIncomingContent) {
    return "unchanged";
  }

  const hasDirtyDraft = input.draftContent !== input.savedContent;
  return hasDirtyDraft || input.hasPendingRevision ? "conflict" : "accept";
}
