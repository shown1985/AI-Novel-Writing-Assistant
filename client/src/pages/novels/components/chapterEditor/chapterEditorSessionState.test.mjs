import test from "node:test";
import assert from "node:assert/strict";

import {
  CLOSED_CHAPTER_EDITOR_PANELS,
  buildChapterEditorSessionIdentity,
  constrainChapterEditorPanelsForViewport,
  decideExternalChapterContent,
  isChapterEditorWorkspaceRequested,
  setChapterEditorPanelOpen,
  toggleChapterEditorPanel,
} from "./chapterEditorSessionState.ts";

test("workspace request state is scoped to one novel and chapter identity", () => {
  const firstIdentity = buildChapterEditorSessionIdentity("novel-a", "chapter-1");

  assert.equal(isChapterEditorWorkspaceRequested(null, firstIdentity), false);
  assert.equal(isChapterEditorWorkspaceRequested(firstIdentity, firstIdentity), true);
  assert.equal(
    isChapterEditorWorkspaceRequested(firstIdentity, buildChapterEditorSessionIdentity("novel-a", "chapter-2")),
    false,
  );
  assert.equal(
    isChapterEditorWorkspaceRequested(firstIdentity, buildChapterEditorSessionIdentity("novel-b", "chapter-1")),
    false,
  );
});

test("chapter editor starts with both auxiliary panels closed", () => {
  assert.deepEqual(CLOSED_CHAPTER_EDITOR_PANELS, {
    referenceOpen: false,
    collaborationOpen: false,
    lastOpened: null,
  });
});

test("wide viewport keeps reference and collaboration panels independent", () => {
  const withReference = setChapterEditorPanelOpen(
    CLOSED_CHAPTER_EDITOR_PANELS,
    "reference",
    true,
    false,
  );
  const withBoth = setChapterEditorPanelOpen(withReference, "collaboration", true, false);
  const collaborationOnly = toggleChapterEditorPanel(withBoth, "reference", false);

  assert.equal(withBoth.referenceOpen, true);
  assert.equal(withBoth.collaborationOpen, true);
  assert.equal(collaborationOnly.referenceOpen, false);
  assert.equal(collaborationOnly.collaborationOpen, true);
});

test("narrow viewport keeps only the panel explicitly opened most recently", () => {
  const withBoth = {
    referenceOpen: true,
    collaborationOpen: true,
    lastOpened: "reference",
  };

  assert.deepEqual(constrainChapterEditorPanelsForViewport(withBoth, true), {
    referenceOpen: true,
    collaborationOpen: false,
    lastOpened: "reference",
  });

  assert.deepEqual(setChapterEditorPanelOpen(withBoth, "collaboration", true, true), {
    referenceOpen: false,
    collaborationOpen: true,
    lastOpened: "collaboration",
  });
});

test("same query value is ignored even while the local draft is dirty", () => {
  assert.equal(decideExternalChapterContent({
    incomingContent: "server v1",
    lastIncomingContent: "server v1",
    draftContent: "local draft",
    savedContent: "server v1",
    hasPendingRevision: false,
  }), "unchanged");
});

test("new external content can replace a clean idle editor", () => {
  assert.equal(decideExternalChapterContent({
    incomingContent: "server v2",
    lastIncomingContent: "server v1",
    draftContent: "server v1",
    savedContent: "server v1",
    hasPendingRevision: false,
  }), "accept");
});

test("new external content conflicts with a dirty draft or pending revision work", () => {
  assert.equal(decideExternalChapterContent({
    incomingContent: "server v2",
    lastIncomingContent: "server v1",
    draftContent: "local draft",
    savedContent: "server v1",
    hasPendingRevision: false,
  }), "conflict");

  assert.equal(decideExternalChapterContent({
    incomingContent: "server v2",
    lastIncomingContent: "server v1",
    draftContent: "server v1",
    savedContent: "server v1",
    hasPendingRevision: true,
  }), "conflict");
});
