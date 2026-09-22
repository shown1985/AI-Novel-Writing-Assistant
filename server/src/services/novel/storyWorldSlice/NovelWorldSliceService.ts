import { createHash } from "node:crypto";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryWorldSlice,
  StoryWorldSliceBuilderMode,
  StoryWorldSliceOverrides,
  StoryWorldSliceView,
} from "@ai-novel/shared/types/storyWorldSlice";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { storyWorldSlicePrompt } from "../../../prompting/prompts/storyWorldSlice/storyWorldSlice.prompts";
import {
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  parseWorldStructurePayload,
} from "../../world/worldStructure";
import {
  buildStoryWorldSliceCacheDigest,
  buildStoryWorldSliceView,
  normalizeStoryWorldSlice,
  parseStoryWorldSlice,
  parseStoryWorldSliceOverrides,
  STORY_WORLD_SLICE_SCHEMA_VERSION,
} from "./storyWorldSlicePersistence";
import { NovelWorldInstanceService } from "../worldContext/NovelWorldInstanceService";

interface EnsureStoryWorldSliceOptions {
  storyInput?: string;
  builderMode?: StoryWorldSliceBuilderMode;
}

interface RefreshStoryWorldSliceOptions extends EnsureStoryWorldSliceOptions {
  overrides?: StoryWorldSliceOverrides;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface ActiveWorldSource {
  id: string;
  sliceWorldId: string;
  name: string;
  structureJson: string | null;
  bindingSupportJson: string | null;
  sourceWorldUpdatedAt: string;
  contentRevision: number;
  sourceWorldId: string | null;
  syncBaseVersion: number | null;
  storySliceSchemaVersion: number;
  storySliceBuiltAt: Date | string | null;
  storySliceDigest: string | null;
  storySliceJson: string | null;
  storySliceOverridesJson: string | null;
}

interface NovelWorldSliceRow {
  id: string;
  sourceWorldId: string | null;
  sourceType: string;
  contentRevision: number;
  title: string | null;
  coverSummary: string | null;
  structuredDataJson: string | null;
  bindingContractJson: string | null;
  storySliceJson: string | null;
  storySliceOverridesJson: string | null;
  storySliceSchemaVersion: number;
  storySliceBuiltAt: Date | string | null;
  storySliceDigest: string | null;
  syncBaseVersion: number | null;
  updatedAt: Date | string;
}

function buildStoryInputDigest(storyInput: string): string {
  return createHash("sha256").update(storyInput.trim()).digest("hex");
}

function normalizeOverrides(input: StoryWorldSliceOverrides): StoryWorldSliceOverrides {
  return {
    primaryLocationId: input.primaryLocationId?.trim() || null,
    requiredForceIds: Array.from(new Set((input.requiredForceIds ?? []).map((item) => item.trim()).filter(Boolean))),
    requiredLocationIds: Array.from(new Set((input.requiredLocationIds ?? []).map((item) => item.trim()).filter(Boolean))),
    requiredRuleIds: Array.from(new Set((input.requiredRuleIds ?? []).map((item) => item.trim()).filter(Boolean))),
    scopeNote: input.scopeNote?.trim() || null,
  };
}

export class NovelWorldSliceService {
  private async getNovelContext(novelId: string) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        storyMacroPlan: {
          select: {
            storyInput: true,
          },
        },
        world: true,
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    return novel;
  }

  private async getNovelWorldRow(novelId: string): Promise<NovelWorldSliceRow | null> {
    const rows = await prisma.$queryRaw<NovelWorldSliceRow[]>`
      SELECT
        "id",
        "sourceWorldId",
        "sourceType",
        "contentRevision",
        "title",
        "coverSummary",
        "structuredDataJson",
        "bindingContractJson",
        "storySliceJson",
        "storySliceOverridesJson",
        "storySliceSchemaVersion",
        "storySliceBuiltAt",
        "storySliceDigest",
        "syncBaseVersion",
        "updatedAt"
      FROM "NovelWorld"
      WHERE "novelId" = ${novelId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async getActiveWorldSource(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
  ): Promise<ActiveWorldSource | null> {
    let novelWorld = await this.getNovelWorldRow(novel.id);
    if (!novelWorld) {
      // The instance service owns the one-time legacy import. Do not call it
      // for a novel with neither legacy world id nor legacy slice: that path
      // has an exact zero-write contract.
      if (!novel.worldId && !novel.storyWorldSliceJson) {
        return null;
      }
      const instance = await new NovelWorldInstanceService().ensureFromLegacyNovel(novel.id);
      if (!instance) {
        return null;
      }
      novelWorld = await this.getNovelWorldRow(novel.id);
      if (!novelWorld) {
        return null;
      }
    }

    return this.toActiveWorldSource(novel, novelWorld);
  }

  private toActiveWorldSource(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    novelWorld: NovelWorldSliceRow,
  ): ActiveWorldSource {
    // The instance row is the compatibility snapshot after legacy adoption.
    // Do not let a later source World edit rewrite the metadata of a cached
    // slice merely because the novel context still includes that relation.
    const sourceWorldUpdatedAt = novelWorld.updatedAt;
    return {
      id: novelWorld.id,
      sliceWorldId: novelWorld.sourceWorldId ?? novelWorld.id,
      name: novelWorld.title ?? novelWorld.coverSummary ?? "本书世界",
      structureJson: novelWorld.structuredDataJson,
      bindingSupportJson: novelWorld.bindingContractJson,
      sourceWorldUpdatedAt: new Date(sourceWorldUpdatedAt).toISOString(),
      contentRevision: novelWorld.contentRevision,
      sourceWorldId: novelWorld.sourceWorldId,
      syncBaseVersion: novelWorld.syncBaseVersion,
      storySliceSchemaVersion: novelWorld.storySliceSchemaVersion,
      storySliceBuiltAt: novelWorld.storySliceBuiltAt,
      storySliceDigest: novelWorld.storySliceDigest,
      storySliceJson: novelWorld.storySliceJson,
      storySliceOverridesJson: novelWorld.storySliceOverridesJson,
    };
  }

  private resolveStoryInput(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    explicitStoryInput?: string,
  ): { storyInput: string; source: string | null } {
    if (explicitStoryInput?.trim()) {
      return { storyInput: explicitStoryInput.trim(), source: "explicit" };
    }
    if (novel.storyMacroPlan?.storyInput?.trim()) {
      return { storyInput: novel.storyMacroPlan.storyInput.trim(), source: "story_macro" };
    }
    if (novel.description?.trim()) {
      return { storyInput: novel.description.trim(), source: "novel_description" };
    }
    return { storyInput: "", source: null };
  }

  private buildCacheDigest(input: {
    world: ActiveWorldSource;
    storyInputDigest: string;
  }): string {
    return buildStoryWorldSliceCacheDigest({
      novelWorldId: input.world.id,
      contentRevision: input.world.contentRevision,
      sourceWorldId: input.world.sourceWorldId,
      syncBaseVersion: input.world.syncBaseVersion,
      storyInputDigest: input.storyInputDigest,
      sliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
    });
  }

  private isCurrentSlice(input: {
    world: ActiveWorldSource;
    slice: StoryWorldSlice | null;
    storyInputDigest: string;
  }): boolean {
    return Boolean(
      input.slice
      && input.world.storySliceSchemaVersion === STORY_WORLD_SLICE_SCHEMA_VERSION
      && input.slice.metadata.schemaVersion === STORY_WORLD_SLICE_SCHEMA_VERSION
      && input.world.storySliceDigest === this.buildCacheDigest(input),
    );
  }

  private async invokeSliceModel(input: {
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>;
    activeWorld: ActiveWorldSource;
    storyInput: string;
    overrides: StoryWorldSliceOverrides;
    builderMode: StoryWorldSliceBuilderMode;
  } & Pick<RefreshStoryWorldSliceOptions, "provider" | "model" | "temperature">): Promise<StoryWorldSlice> {
    const world = input.activeWorld;
    const legacyStructure = input.novel.world && input.novel.world.id === world.sourceWorldId
      ? buildWorldStructureFromLegacySource(input.novel.world)
      : null;
    if (!world.structureJson?.trim() && !legacyStructure) {
      throw new Error("当前小说没有可用的本书世界结构。");
    }

    const parsedPayload = world.structureJson?.trim()
      ? parseWorldStructurePayload(world.structureJson, world.bindingSupportJson)
      : null;
    const structure = parsedPayload?.hasStructuredData
      ? parsedPayload.structure
      : legacyStructure;
    if (!structure) {
      throw new Error("当前小说没有可用的本书世界结构。");
    }
    const bindingSupport = world.bindingSupportJson?.trim()
      ? parsedPayload?.bindingSupport ?? buildWorldBindingSupport(structure)
      : buildWorldBindingSupport(structure);
    const storyInputDigest = buildStoryInputDigest(input.storyInput);
    const result = await runStructuredPrompt({
      asset: storyWorldSlicePrompt,
      promptInput: {
        novel: input.novel,
        structure,
        bindingSupport,
        storyInput: input.storyInput,
        overrides: input.overrides,
        builderMode: input.builderMode,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.25,
      },
    });
    const parsed = result.output;

    return normalizeStoryWorldSlice({
      raw: parsed,
      storyId: input.novel.id,
      worldId: world.sliceWorldId,
      sourceWorldUpdatedAt: world.sourceWorldUpdatedAt,
      storyInputDigest,
      builtFromStructuredData: Boolean(parsedPayload?.hasStructuredData),
      builderMode: input.builderMode,
      structure,
      bindingSupport,
      overrides: input.overrides,
    });
  }

  private emptyWorldView(): StoryWorldSliceView {
    return buildStoryWorldSliceView({
      worldId: null,
      worldName: null,
      slice: null,
      overrides: {},
      structure: null,
      isStale: false,
      storyInputSource: null,
    });
  }

  private buildStructure(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    world: ActiveWorldSource,
    allowLegacySourceFallback = true,
  ) {
    const parsedPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    return parsedPayload.hasStructuredData
      ? parsedPayload.structure
      : allowLegacySourceFallback && novel.world && novel.world.id === world.sourceWorldId
        ? buildWorldStructureFromLegacySource(novel.world)
        : null;
  }

  private hasUsableWorldSource(
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    world: ActiveWorldSource,
    slice: StoryWorldSlice | null,
  ): boolean {
    return Boolean(
      slice
      || world.structureJson?.trim()
      || (novel.world && novel.world.id === world.sourceWorldId),
    );
  }

  private buildView(input: {
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>;
    world: ActiveWorldSource;
    slice: StoryWorldSlice | null;
    overrides: StoryWorldSliceOverrides;
    storyInputSource: string | null;
    storyInputDigest: string;
  }): StoryWorldSliceView {
    const isCurrent = this.isCurrentSlice({
      world: input.world,
      slice: input.slice,
      storyInputDigest: input.storyInputDigest,
    });
    return buildStoryWorldSliceView({
      worldId: input.world.sliceWorldId,
      worldName: input.world.name,
      slice: input.slice,
      overrides: input.overrides,
      // A current cache must remain a snapshot of the instance. A legacy
      // source projection is only allowed while inspecting/rebuilding stale
      // data and must not leak later World edits into current state.
      structure: this.buildStructure(input.novel, input.world, !isCurrent),
      isStale: !isCurrent,
      storyInputSource: input.storyInputSource,
    });
  }

  private async persistSlice(input: {
    novelId: string;
    world: ActiveWorldSource;
    slice: StoryWorldSlice | null;
    overrides: StoryWorldSliceOverrides;
    storyInputDigest: string;
  }): Promise<boolean> {
    const sliceJson = input.slice ? JSON.stringify(input.slice) : null;
    const result = await prisma.$executeRaw`
      UPDATE "NovelWorld"
      SET
        "storySliceJson" = ${sliceJson},
        "storySliceOverridesJson" = ${JSON.stringify(input.overrides)},
        "storySliceSchemaVersion" = ${STORY_WORLD_SLICE_SCHEMA_VERSION},
        "storySliceBuiltAt" = ${input.slice?.metadata.builtAt ?? null},
        "storySliceDigest" = ${this.buildCacheDigest({
          world: input.world,
          storyInputDigest: input.storyInputDigest,
        })}
      WHERE "id" = ${input.world.id}
        AND "novelId" = ${input.novelId}
        AND "contentRevision" = ${input.world.contentRevision}
        AND ("sourceWorldId" = ${input.world.sourceWorldId}
          OR ("sourceWorldId" IS NULL AND ${input.world.sourceWorldId} IS NULL))
        AND ("syncBaseVersion" = ${input.world.syncBaseVersion}
          OR ("syncBaseVersion" IS NULL AND ${input.world.syncBaseVersion} IS NULL))
    `;
    return Number(result) > 0;
  }

  private worldAfterCommit(
    world: ActiveWorldSource,
    storyInputDigest: string,
  ): ActiveWorldSource {
    return {
      ...world,
      storySliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
      storySliceDigest: this.buildCacheDigest({ world, storyInputDigest }),
    };
  }

  private async reloadAfterCacheMiss(
    novelId: string,
    novel: Awaited<ReturnType<NovelWorldSliceService["getNovelContext"]>>,
    storyInputDigest: string,
  ): Promise<{ world: ActiveWorldSource; slice: StoryWorldSlice | null } | null> {
    const latest = await this.getNovelWorldRow(novelId);
    if (!latest) {
      return null;
    }
    const world = this.toActiveWorldSource(novel, latest);
    return {
      world,
      slice: parseStoryWorldSlice(world.storySliceJson),
    };
  }

  async getWorldSliceView(novelId: string): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const activeWorld = await this.getActiveWorldSource(novel);
    if (!activeWorld) {
      return this.emptyWorldView();
    }
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(activeWorld.storySliceOverridesJson));
    const { storyInput, source } = this.resolveStoryInput(novel);
    const storyInputDigest = buildStoryInputDigest(storyInput);
    const slice = parseStoryWorldSlice(activeWorld.storySliceJson);
    if (!this.hasUsableWorldSource(novel, activeWorld, slice)) {
      return this.emptyWorldView();
    }
    return this.buildView({
      novel,
      world: activeWorld,
      slice,
      overrides,
      storyInputSource: source,
      storyInputDigest,
    });
  }

  async ensureStoryWorldSlice(
    novelId: string,
    options: EnsureStoryWorldSliceOptions = {},
  ): Promise<StoryWorldSlice | null> {
    const novel = await this.getNovelContext(novelId);
    const activeWorld = await this.getActiveWorldSource(novel);
    if (!activeWorld) {
      return null;
    }
    const overrides = normalizeOverrides(parseStoryWorldSliceOverrides(activeWorld.storySliceOverridesJson));
    const { storyInput } = this.resolveStoryInput(novel, options.storyInput);
    const storyInputDigest = buildStoryInputDigest(storyInput);
    const currentSlice = parseStoryWorldSlice(activeWorld.storySliceJson);
    if (this.isCurrentSlice({ world: activeWorld, slice: currentSlice, storyInputDigest })) {
      return currentSlice;
    }

    // A manual instance created from only an old slice is a compatibility
    // endpoint. Rebind its valid raw slice to the current internal key, but
    // never invoke the model or rewrite its visible content.
    const hasStructure = Boolean(activeWorld.structureJson?.trim())
      || Boolean(novel.world && novel.world.id === activeWorld.sourceWorldId);
    if (!hasStructure) {
      if (!currentSlice) {
        return null;
      }
      const adopted = await this.persistSlice({
        novelId,
        world: activeWorld,
        slice: currentSlice,
        overrides,
        storyInputDigest,
      });
      if (adopted) {
        return currentSlice;
      }
      const latest = await this.reloadAfterCacheMiss(novelId, novel, storyInputDigest);
      return latest && this.isCurrentSlice({
        world: latest.world,
        slice: latest.slice,
        storyInputDigest,
      }) ? latest.slice : null;
    }

    const nextSlice = await this.invokeSliceModel({
      novel,
      activeWorld,
      storyInput,
      overrides,
      builderMode: options.builderMode ?? "runtime",
    });
    const committed = await this.persistSlice({
      novelId,
      world: activeWorld,
      slice: nextSlice,
      overrides,
      storyInputDigest,
    });
    if (committed) {
      return nextSlice;
    }
    const latest = await this.reloadAfterCacheMiss(novelId, novel, storyInputDigest);
    return latest && this.isCurrentSlice({
      world: latest.world,
      slice: latest.slice,
      storyInputDigest,
    }) ? latest.slice : null;
  }

  async refreshWorldSlice(
    novelId: string,
    options: RefreshStoryWorldSliceOptions = {},
  ): Promise<StoryWorldSliceView> {
    const novel = await this.getNovelContext(novelId);
    const activeWorld = await this.getActiveWorldSource(novel);
    if (!activeWorld) {
      return this.emptyWorldView();
    }
    const storedOverrides = parseStoryWorldSliceOverrides(activeWorld.storySliceOverridesJson);
    const requestedOverrides = normalizeOverrides(options.overrides ?? storedOverrides);
    const { storyInput, source } = this.resolveStoryInput(novel, options.storyInput);
    const storyInputDigest = buildStoryInputDigest(storyInput);
    const currentSlice = parseStoryWorldSlice(activeWorld.storySliceJson);
    const hasStructure = Boolean(activeWorld.structureJson?.trim())
      || Boolean(novel.world && novel.world.id === activeWorld.sourceWorldId);
    if (!hasStructure && !currentSlice) {
      return this.emptyWorldView();
    }
    if (!hasStructure && currentSlice) {
      const adopted = await this.persistSlice({
        novelId,
        world: activeWorld,
        slice: currentSlice,
        // The only-slice compatibility path does not have enough structure to
        // apply new overrides; keep the stored override payload unchanged.
        overrides: normalizeOverrides(storedOverrides),
        storyInputDigest,
      });
      if (adopted) {
        return this.buildView({
          novel,
          world: this.worldAfterCommit(activeWorld, storyInputDigest),
          slice: currentSlice,
          overrides: normalizeOverrides(storedOverrides),
          storyInputSource: source,
          storyInputDigest,
        });
      }
      const latest = await this.reloadAfterCacheMiss(novelId, novel, storyInputDigest);
      if (!latest) {
        return this.emptyWorldView();
      }
      const latestOverrides = normalizeOverrides(parseStoryWorldSliceOverrides(latest.world.storySliceOverridesJson));
      return this.buildView({
        novel,
        world: latest.world,
        slice: latest.slice,
        overrides: latestOverrides,
        storyInputSource: source,
        storyInputDigest,
      });
    }
    if (!hasStructure) {
      return this.buildView({
        novel,
        world: activeWorld,
        slice: null,
        overrides: normalizeOverrides(storedOverrides),
        storyInputSource: source,
        storyInputDigest,
      });
    }

    const nextSlice = await this.invokeSliceModel({
      novel,
      activeWorld,
      storyInput,
      overrides: requestedOverrides,
      builderMode: options.builderMode ?? "manual_refresh",
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    const committed = await this.persistSlice({
      novelId,
      world: activeWorld,
      slice: nextSlice,
      overrides: requestedOverrides,
      storyInputDigest,
    });
    if (committed) {
      return this.buildView({
        novel,
        world: this.worldAfterCommit(activeWorld, storyInputDigest),
        slice: nextSlice,
        overrides: requestedOverrides,
        storyInputSource: source,
        storyInputDigest,
      });
    }
    const latest = await this.reloadAfterCacheMiss(novelId, novel, storyInputDigest);
    if (!latest) {
      return this.emptyWorldView();
    }
    const latestOverrides = normalizeOverrides(parseStoryWorldSliceOverrides(latest.world.storySliceOverridesJson));
    return this.buildView({
      novel,
      world: latest.world,
      slice: latest.slice,
      overrides: latestOverrides,
      storyInputSource: source,
      storyInputDigest,
    });
  }

  async updateWorldSliceOverrides(
    novelId: string,
    overridesInput: StoryWorldSliceOverrides,
  ): Promise<StoryWorldSliceView> {
    return this.refreshWorldSlice(novelId, {
      overrides: normalizeOverrides(overridesInput),
      builderMode: "manual_refresh",
    });
  }
}
