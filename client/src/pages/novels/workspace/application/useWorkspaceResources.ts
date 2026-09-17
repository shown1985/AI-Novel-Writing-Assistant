import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBaseCharacterList } from "@/api/character";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import {
  getChapterAuditReports,
  getChapterPlan,
  getChapterResourceContext,
  getChapterStateSnapshot,
  getChapterTimeline,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelDetail,
  getNovelPayoffLedger,
  getNovelPipelineJob,
  getNovelQualityReport,
  getNovelVolumeWorkspace,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { getWorldList } from "@/api/world";
import type { ChapterExecutionBackgroundActivity } from "../../components/chapterExecution.shared";
import { buildWorldInjectionSummary } from "../../novelEdit.utils";
import type { ExistingOutlineChapter } from "../../volumePlan.utils";
import { resolveWorkspaceActivation } from "./workspaceSessionPolicy";

function parsePipelineBackgroundActivities(payload: string | null | undefined): ChapterExecutionBackgroundActivity[] {
  if (!payload?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as {
      backgroundSync?: {
        activities?: Array<{
          kind?: unknown;
          status?: unknown;
          chapterId?: unknown;
          chapterOrder?: unknown;
          chapterTitle?: unknown;
          updatedAt?: unknown;
          error?: unknown;
        }>;
      };
    };
    return (parsed.backgroundSync?.activities ?? [])
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const kind = item.kind;
        const status = item.status;
        if (
          (kind !== "character_dynamics" && kind !== "state_snapshot" && kind !== "payoff_ledger" && kind !== "character_resources")
          || (status !== "running" && status !== "failed")
          || typeof item.chapterId !== "string"
          || !item.chapterId.trim()
          || typeof item.updatedAt !== "string"
          || !item.updatedAt.trim()
        ) {
          return [];
        }
        const activity: ChapterExecutionBackgroundActivity = {
          kind,
          status,
          chapterId: item.chapterId.trim(),
          chapterOrder: typeof item.chapterOrder === "number" ? item.chapterOrder : undefined,
          chapterTitle: typeof item.chapterTitle === "string" && item.chapterTitle.trim() ? item.chapterTitle.trim() : undefined,
          updatedAt: item.updatedAt.trim(),
          error: typeof item.error === "string" && item.error.trim() ? item.error.trim() : null,
        };
        return [activity];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}


interface ResourceInput {
 id: string; activeTab: string; selectedChapterId: string; currentJobId: string; selectedCharacterId: string; selectedBaseCharacterId: string;
}
export function useWorkspaceResources({id, activeTab, selectedChapterId, currentJobId, selectedCharacterId, selectedBaseCharacterId}: ResourceInput) {
  const activation = resolveWorkspaceActivation({ activeTab, novelId: id, selectedChapterId });
  const shouldLoadVolumeWorkspace = activation.queries.loadVolumeWorkspace;
  const shouldLoadStoryMacro = activation.queries.loadStoryMacro;
  const shouldLoadWorldSlice = activation.queries.loadWorldSlice;
  const shouldLoadQualityReport = activation.queries.loadQualityReport;
  const shouldLoadLatestState = activation.queries.loadLatestState;
  const shouldLoadPayoffLedger = activation.queries.loadPayoffLedger;
  const shouldLoadCharacterResources = activation.queries.loadCharacterResources;
  const shouldLoadChapterContext = activation.queries.loadChapterContext;
  const shouldLoadChapterTimeline = activation.queries.loadChapterTimeline;

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });
  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(id),
    queryFn: () => getNovelQualityReport(id),
    enabled: Boolean(id && shouldLoadQualityReport),
  });
  const volumeWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.volumeWorkspace(id),
    queryFn: () => getNovelVolumeWorkspace(id),
    enabled: Boolean(id && shouldLoadVolumeWorkspace),
  });
  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(id),
    queryFn: () => getLatestStateSnapshot(id),
    enabled: Boolean(id && shouldLoadLatestState),
  });
  const chapterStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.chapterStateSnapshot(id, selectedChapterId || "none"),
    queryFn: () => getChapterStateSnapshot(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });
  const payoffLedgerChapterOrder = useMemo(() => {
    const orders = novelDetailQuery.data?.data?.chapters?.map((chapter) => chapter.order) ?? [];
    return orders.length > 0 ? Math.max(...orders) : undefined;
  }, [novelDetailQuery.data?.data?.chapters]);
  const payoffLedgerQuery = useQuery({
    queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder),
    queryFn: () => getNovelPayoffLedger(id, payoffLedgerChapterOrder),
    enabled: Boolean(id && shouldLoadPayoffLedger),
  });
  const characterResourcesQuery = useQuery({
    queryKey: queryKeys.novels.characterResources(id),
    queryFn: () => getNovelCharacterResources(id),
    enabled: Boolean(id && shouldLoadCharacterResources),
  });
  const chapterResourceContextQuery = useQuery({
    queryKey: queryKeys.novels.characterResourceContext(id, selectedChapterId || "none"),
    queryFn: () => getChapterResourceContext(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const chapterTimelineQuery = useQuery({
    queryKey: queryKeys.novels.chapterTimeline(id, selectedChapterId || "none"),
    queryFn: () => getChapterTimeline(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterTimeline),
  });
  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId || "none"),
    queryFn: () => getChapterPlan(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId || "none"),
    queryFn: () => getChapterAuditReports(id, selectedChapterId),
    enabled: Boolean(id && shouldLoadChapterContext),
  });
  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []), [genreTreeQuery.data?.data]);
  const storyModeOptions = useMemo(
    () => flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []),
    [storyModeTreeQuery.data?.data],
  );

  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(id, currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(id, currentJobId),
    enabled: Boolean(id && currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });
  const chapters = useMemo(() => novelDetailQuery.data?.data?.chapters ?? [], [novelDetailQuery.data?.data?.chapters]);
  const outlineSyncChapters = useMemo<ExistingOutlineChapter[]>(
    () => chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      content: chapter.content ?? "",
      expectation: chapter.expectation ?? "",
      targetWordCount: chapter.targetWordCount ?? null,
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      mustAvoid: chapter.mustAvoid ?? null,
      taskSheet: chapter.taskSheet ?? null,
    })),
    [chapters],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId),
    [chapters, selectedChapterId],
  );
  const characters = novelDetailQuery.data?.data?.characters ?? [];
  const baseCharacters = baseCharacterListQuery.data?.data ?? [];
  const selectedCharacter = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedBaseCharacter = useMemo(
    () => baseCharacters.find((item) => item.id === selectedBaseCharacterId),
    [baseCharacters, selectedBaseCharacterId],
  );
  const importedBaseCharacterIds = useMemo(
    () => new Set(
      characters
        .map((item) => item.baseCharacterId)
        .filter((item): item is string => Boolean(item)),
    ),
    [characters],
  );
  const hasCharacters = characters.length > 0;
  const savedVolumeWorkspace = volumeWorkspaceQuery.data?.data ?? null;
  const coreCharacterCount = useMemo(
    () => characters.filter((item) => /主角|反派/.test(item.role)).length,
    [characters],
  );
  const bible = novelDetailQuery.data?.data?.bible;
  const plotBeats = novelDetailQuery.data?.data?.plotBeats ?? [];
  const maxOrder = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.order), 1),
    [chapters],
  );
  const worldInjectionSummary = useMemo(
    () => buildWorldInjectionSummary(novelDetailQuery.data?.data?.world),
    [novelDetailQuery.data?.data?.world],
  );
  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const chapterQualityReport = useMemo(() => (qualityReportQuery.data?.data?.chapterReports ?? []).find((item) => item.chapterId === selectedChapterId), [qualityReportQuery.data?.data?.chapterReports, selectedChapterId]);
  const chapterPlan = chapterPlanQuery.data?.data ?? null;
  const chapterTimeline = chapterTimelineQuery.data?.data ?? null;
  const latestStateSnapshot = latestStateSnapshotQuery.data?.data ?? null;
  const chapterStateSnapshot = chapterStateSnapshotQuery.data?.data ?? null;
  const payoffLedger = payoffLedgerQuery.data?.data ?? null;
  const characterResources = characterResourcesQuery.data?.data?.items ?? [];
  const pendingCharacterResourceProposals = characterResourcesQuery.data?.data?.pendingProposals ?? [];
  const chapterResourceContext = chapterResourceContextQuery.data?.data ?? null;
  const chapterAuditReports = chapterAuditReportsQuery.data?.data ?? [];
  const pipelineBackgroundActivities = useMemo(
    () => parsePipelineBackgroundActivities(pipelineJobQuery.data?.data?.payload ?? null),
    [pipelineJobQuery.data?.data?.payload],
  );
  return { shouldLoadVolumeWorkspace, shouldLoadStoryMacro, shouldLoadWorldSlice, shouldLoadQualityReport, shouldLoadLatestState, shouldLoadPayoffLedger, shouldLoadCharacterResources, shouldLoadChapterContext, shouldLoadChapterTimeline, novelDetailQuery, qualityReportQuery, volumeWorkspaceQuery, latestStateSnapshotQuery, chapterStateSnapshotQuery, payoffLedgerChapterOrder, payoffLedgerQuery, characterResourcesQuery, chapterResourceContextQuery, chapterTimelineQuery, chapterPlanQuery, chapterAuditReportsQuery, baseCharacterListQuery, worldListQuery, genreTreeQuery, storyModeTreeQuery, genreOptions, storyModeOptions, pipelineJobQuery, chapters, outlineSyncChapters, selectedChapter, characters, baseCharacters, selectedCharacter, selectedBaseCharacter, importedBaseCharacterIds, hasCharacters, savedVolumeWorkspace, coreCharacterCount, bible, plotBeats, maxOrder, worldInjectionSummary, qualitySummary, chapterQualityReport, chapterPlan, chapterTimeline, latestStateSnapshot, chapterStateSnapshot, payoffLedger, characterResources, pendingCharacterResourceProposals, chapterResourceContext, chapterAuditReports, pipelineBackgroundActivities };
}
