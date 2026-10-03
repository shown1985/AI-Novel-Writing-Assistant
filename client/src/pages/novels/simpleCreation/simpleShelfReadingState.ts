export interface SimpleShelfReadableChapter {
  id: string;
}

export interface SimpleShelfReadingSelection {
  chapterId: string | null;
  shouldReplaceUrl: boolean;
}

export interface SimpleShelfReadingPosition {
  contentVersion: string;
  scrollTop: number;
  progress: number;
}

interface ReadingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = "ai-novel:simple-shelf-reading:v1";

function storageSegment(value: string): string {
  return encodeURIComponent(value);
}

function lastChapterKey(novelId: string): string {
  return `${STORAGE_PREFIX}:novel:${storageSegment(novelId)}:last-chapter`;
}

function readingPositionKey(novelId: string, chapterId: string): string {
  return `${STORAGE_PREFIX}:novel:${storageSegment(novelId)}:chapter:${storageSegment(chapterId)}:position`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getSimpleShelfReadingStorage(): ReadingStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLastReadableChapterId(storage: ReadingStorage | null, novelId: string): string | null {
  if (!storage || !novelId) return null;
  try {
    return storage.getItem(lastChapterKey(novelId))?.trim() || null;
  } catch {
    return null;
  }
}

export function saveLastReadableChapterId(
  storage: ReadingStorage | null,
  novelId: string,
  chapterId: string,
): void {
  if (!storage || !novelId || !chapterId) return;
  try {
    storage.setItem(lastChapterKey(novelId), chapterId);
  } catch {
    // Reading must remain available when storage is blocked or full.
  }
}

export function resolveSimpleShelfReadingSelection(input: {
  explicitChapterId: string | null;
  lastChapterId: string | null;
  readableChapters: readonly SimpleShelfReadableChapter[];
}): SimpleShelfReadingSelection {
  const readableIds = new Set(input.readableChapters.map((chapter) => chapter.id));
  const fallbackChapterId = input.readableChapters.at(-1)?.id ?? null;

  if (input.explicitChapterId !== null) {
    const requestedChapterId = input.explicitChapterId.trim();
    if (requestedChapterId && readableIds.has(requestedChapterId)) {
      return { chapterId: requestedChapterId, shouldReplaceUrl: false };
    }
    return { chapterId: fallbackChapterId, shouldReplaceUrl: true };
  }

  const storedChapterId = input.lastChapterId?.trim() ?? "";
  if (storedChapterId && readableIds.has(storedChapterId)) {
    return { chapterId: storedChapterId, shouldReplaceUrl: true };
  }
  return {
    chapterId: fallbackChapterId,
    shouldReplaceUrl: fallbackChapterId !== null,
  };
}

export function matchesSimpleShelfNovel(requestedNovelId: string, shelfNovelId: string | null | undefined): boolean {
  return Boolean(requestedNovelId && shelfNovelId === requestedNovelId);
}

export function createReadingContentVersion(input: {
  content: string;
  updatedAt: string;
}): string {
  let hash = 2166136261;
  for (let index = 0; index < input.content.length; index += 1) {
    hash ^= input.content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${input.updatedAt}:${input.content.length}:${(hash >>> 0).toString(36)}`;
}

export function createReadingPosition(
  scrollTop: number,
  maxScroll: number,
  contentVersion: string,
): SimpleShelfReadingPosition {
  const safeMaxScroll = Math.max(0, maxScroll);
  const safeScrollTop = clamp(Number.isFinite(scrollTop) ? scrollTop : 0, 0, safeMaxScroll);
  return {
    contentVersion,
    scrollTop: safeScrollTop,
    progress: safeMaxScroll > 0 ? safeScrollTop / safeMaxScroll : 0,
  };
}

export function resolveReadingScrollTop(
  position: SimpleShelfReadingPosition | null,
  contentVersion: string,
  maxScroll: number,
): number {
  if (!position) return 0;
  const safeMaxScroll = Math.max(0, maxScroll);
  if (position.contentVersion === contentVersion) {
    return clamp(position.scrollTop, 0, safeMaxScroll);
  }
  return clamp(position.progress, 0, 1) * safeMaxScroll;
}

export function readReadingPosition(
  storage: ReadingStorage | null,
  novelId: string,
  chapterId: string,
): SimpleShelfReadingPosition | null {
  if (!storage || !novelId || !chapterId) return null;
  try {
    const raw = storage.getItem(readingPositionKey(novelId, chapterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SimpleShelfReadingPosition>;
    if (
      typeof parsed.contentVersion !== "string"
      || typeof parsed.scrollTop !== "number"
      || !Number.isFinite(parsed.scrollTop)
      || typeof parsed.progress !== "number"
      || !Number.isFinite(parsed.progress)
    ) {
      return null;
    }
    return {
      contentVersion: parsed.contentVersion,
      scrollTop: Math.max(0, parsed.scrollTop),
      progress: clamp(parsed.progress, 0, 1),
    };
  } catch {
    return null;
  }
}

export function saveReadingPosition(
  storage: ReadingStorage | null,
  novelId: string,
  chapterId: string,
  position: SimpleShelfReadingPosition,
): void {
  if (!storage || !novelId || !chapterId) return;
  try {
    storage.setItem(readingPositionKey(novelId, chapterId), JSON.stringify(position));
  } catch {
    // Reading must remain available when storage is blocked or full.
  }
}
