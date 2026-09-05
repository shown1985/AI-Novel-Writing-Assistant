import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  WorldBindingSupport,
  WorldForce,
  WorldStructureSectionKey,
  WorldStructuredData,
} from "@ai-novel/shared/types/world";
import type {
  WorldGenerationBlueprint,
  WorldReferenceContext,
  WorldSkeletonGenerationCheckpointSummary,
  WorldSkeletonGenerationPayload,
  WorldSkeletonGenerationOptions,
} from "@ai-novel/shared/types/worldWizard";
import { normalizeWorldSkeletonGenerationOptions } from "@ai-novel/shared/types/worldWizard";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  worldSkeletonGenerationPrompt,
  worldSkeletonPresentationPrompt,
} from "../../prompting/prompts/world/worldDraft.prompts";
import { worldStructureSectionPrompt } from "../../prompting/prompts/world/world.prompts";
import { extractStructuredOutputErrorCategory } from "../../llm/structuredOutput";
import {
  buildWorldBindingSupport,
  createEmptyWorldStructure,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import { buildStructureSectionInstructions, mergeWorldStructureSection } from "./worldServiceShared";
import { worldStructuredDataSchema } from "./worldSchemas";

const WORLD_SKELETON_GENERATION_TIMEOUT_MS = 120_000;
const WORLD_SKELETON_GENERATION_MAX_TOKENS = 6_000;
// Soft policy for telemetry only. The exact provider context window is
// resolved by the provider adapter; this value should not reject a request.
const WORLD_SKELETON_INPUT_TOKEN_LIMIT = 12_000;
const WORLD_SKELETON_INPUT_SAFETY_MARGIN_TOKENS = 512;

const WORLD_SKELETON_STAGE_MAX_TOKENS: Record<WorldStructureSectionKey | "presentation", number> = {
  profile: 1_200,
  rules: 2_200,
  factions: 3_200,
  locations: 3_000,
  relations: 2_800,
  presentation: 2_200,
};

const WORLD_SKELETON_STAGE_ORDER: WorldStructureSectionKey[] = [
  "profile",
  "rules",
  "factions",
  "locations",
  "relations",
];

const WORLD_SKELETON_REQUEST_BUDGET = {
  inputTokenLimit: WORLD_SKELETON_INPUT_TOKEN_LIMIT,
  safetyMarginTokens: WORLD_SKELETON_INPUT_SAFETY_MARGIN_TOKENS,
  mode: "observe" as const,
};

export interface WorldSkeletonCheckpointResumeState {
  runId: string;
  request: WorldSkeletonGenerateInput;
  structure: WorldStructuredData;
  nextStageIndex: number;
  status: "running" | "failed" | "succeeded";
  finalPayload?: WorldSkeletonGenerationPayload;
}

export interface WorldSkeletonCheckpointStore {
  startOrResume(input: {
    runId?: string;
    request: WorldSkeletonGenerateInput;
    sourceRoute: string;
  }): Promise<WorldSkeletonCheckpointResumeState>;
  saveStage(input: {
    runId: string;
    sequence: number;
    stage: WorldStructureSectionKey | "presentation";
    structure: WorldStructuredData;
  }): Promise<void>;
  complete(input: {
    runId: string;
    sequence: number;
    payload: WorldSkeletonGenerationPayload;
  }): Promise<void>;
  fail(input: {
    runId: string;
    stage: WorldStructureSectionKey | "presentation";
    error: unknown;
  }): Promise<void>;
  getSummary(runId: string): Promise<WorldSkeletonGenerationCheckpointSummary | null>;
}

interface WorldSkeletonPromptStructureContext {
  forces: Array<{ id: string; [key: string]: unknown }>;
  locations: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface WorldSkeletonPresentationPromptStructureContext {
  profile: {
    summary: string;
    identity: string;
    coreConflict: string;
  };
  forces: Array<{
    id: string;
    name: string;
    currentObjective: string;
    narrativeRole: string;
  }>;
  locations: Array<{
    id: string;
    name: string;
    narrativeFunction: string;
  }>;
  [key: string]: unknown;
}

export interface WorldSkeletonGenerateInput {
  idea: string;
  worldType?: string;
  template?: string;
  referenceContext?: WorldReferenceContext | null;
  blueprint?: WorldGenerationBlueprint | null;
  options?: Partial<WorldSkeletonGenerationOptions>;
  provider?: LLMProvider;
  model?: string;
  checkpointRunId?: string;
  sourceRoute?: string;
  checkpointStore?: WorldSkeletonCheckpointStore;
}

function compactText(value: unknown, maxChars = 240): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const suffixLength = Math.min(48, Math.floor(maxChars / 4));
  return `${normalized.slice(0, maxChars - suffixLength - 1)}…${normalized.slice(-suffixLength)}`;
}

function compactList(value: unknown, maxItems = 6, itemMaxChars = 120): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => compactText(item, itemMaxChars));
}

function compactJson(value: unknown, maxChars = 3_200): string {
  try {
    const serialized = JSON.stringify(value, null, 2) ?? "";
    return serialized.length > maxChars
      ? `${compactText(serialized, maxChars)}\n[内容已压缩]`
      : serialized;
  } catch {
    return "无";
  }
}

/**
 * Build the smallest useful continuity snapshot for a world-generation stage.
 * The persisted structure remains unchanged; only the prompt representation is
 * projected so descriptions cannot grow every subsequent request.
 */
export function buildWorldSkeletonPromptContext(
  structure: WorldStructuredData,
  section: WorldStructureSectionKey | "presentation",
): WorldSkeletonPromptStructureContext {
  const stageIndex = section === "presentation"
    ? WORLD_SKELETON_STAGE_ORDER.length
    : WORLD_SKELETON_STAGE_ORDER.indexOf(section);
  const context: WorldSkeletonPromptStructureContext = {
    forces: [],
    locations: [],
  };

  if (stageIndex >= 1) {
    context.profile = {
      summary: compactText(structure.profile.summary, 360),
      identity: compactText(structure.profile.identity, 220),
      tone: compactText(structure.profile.tone, 160),
      themes: compactList(structure.profile.themes, 5, 80),
      coreConflict: compactText(structure.profile.coreConflict, 280),
    };
    context.rules = {
      summary: compactText(structure.rules.summary, 240),
      axioms: structure.rules.axioms.slice(0, 12).map((rule) => ({
        id: rule.id,
        name: compactText(rule.name, 80),
        summary: compactText(rule.summary, 160),
        cost: compactText(rule.cost, 120),
        boundary: compactText(rule.boundary, 120),
        enforcement: compactText(rule.enforcement, 120),
      })),
      taboo: compactList(structure.rules.taboo, 6, 100),
      sharedConsequences: compactList(structure.rules.sharedConsequences, 6, 100),
    };
  }

  if (stageIndex >= 2) {
    context.factions = structure.factions.slice(0, 12).map((faction) => ({
      id: faction.id,
      name: compactText(faction.name, 80),
      position: compactText(faction.position, 120),
      doctrine: compactText(faction.doctrine, 120),
      goals: compactList(faction.goals, 4, 100),
      methods: compactList(faction.methods, 4, 100),
      representativeForceIds: faction.representativeForceIds.slice(0, 8),
    }));
    context.forces = structure.forces.slice(0, 16).map((force) => ({
      id: force.id,
      name: compactText(force.name, 80),
      type: compactText(force.type, 80),
      factionId: force.factionId ?? null,
      role: compactText(force.role, 100),
      resources: compactList(force.resources, 5, 100),
      controlledLocationIds: (force.controlledLocationIds ?? []).slice(0, 12),
      summary: compactText(force.summary, 180),
      baseOfPower: compactText(force.baseOfPower, 120),
      currentObjective: compactText(force.currentObjective, 160),
      pressure: compactText(force.pressure, 160),
      narrativeRole: compactText(force.narrativeRole, 120),
    }));
  }

  if (stageIndex >= 3) {
    context.locations = structure.locations.slice(0, 20).map((location) => ({
      id: location.id,
      name: compactText(location.name, 80),
      type: compactText(location.type, 80),
      region: compactText(location.region, 80),
      x: location.x,
      y: location.y,
      directionHint: location.directionHint,
      terrain: compactText(location.terrain, 100),
      summary: compactText(location.summary, 180),
      narrativeFunction: compactText(location.narrativeFunction, 140),
      risk: compactText(location.risk, 120),
      entryConstraint: compactText(location.entryConstraint, 120),
      exitCost: compactText(location.exitCost, 120),
      controllingForceIds: location.controllingForceIds.slice(0, 8),
    }));
  }

  if (stageIndex >= 4) {
    context.relations = {
      forceRelations: structure.relations.forceRelations.slice(0, 24).map((relation) => ({
        id: relation.id,
        sourceForceId: relation.sourceForceId,
        targetForceId: relation.targetForceId,
        relation: compactText(relation.relation, 80),
        tension: compactText(relation.tension, 120),
        detail: compactText(relation.detail, 140),
      })),
      locationControls: structure.relations.locationControls.slice(0, 32).map((relation) => ({
        id: relation.id,
        forceId: relation.forceId,
        locationId: relation.locationId,
        relation: compactText(relation.relation, 80),
        detail: compactText(relation.detail, 120),
      })),
      locationConnections: (structure.relations.locationConnections ?? []).slice(0, 32).map((relation) => ({
        id: relation.id,
        sourceLocationId: relation.sourceLocationId,
        targetLocationId: relation.targetLocationId,
        connectionType: compactText(relation.connectionType, 80),
        distanceHint: compactText(relation.distanceHint, 80),
        narrativeUse: compactText(relation.narrativeUse, 120),
      })),
    };
  }

  return context;
}

/**
 * Build the minimal context needed to write opening-entry suggestions.
 * Presentation does not need factions, relations, or full field prose; keeping
 * only concrete force/location IDs prevents invalid faction references and
 * avoids making the final call slower than the generation stages themselves.
 */
export function buildWorldSkeletonPresentationPromptContext(
  structure: WorldStructuredData,
): WorldSkeletonPresentationPromptStructureContext {
  return {
    profile: {
      summary: compactText(structure.profile.summary, 360),
      identity: compactText(structure.profile.identity, 220),
      coreConflict: compactText(structure.profile.coreConflict, 280),
    },
    forces: structure.forces.slice(0, 16).map((force) => ({
      id: force.id,
      name: compactText(force.name, 80),
      currentObjective: compactText(force.currentObjective, 160),
      narrativeRole: compactText(force.narrativeRole, 120),
    })),
    locations: structure.locations.slice(0, 20).map((location) => ({
      id: location.id,
      name: compactText(location.name, 80),
      narrativeFunction: compactText(location.narrativeFunction, 140),
    })),
  };
}

function buildWorldSkeletonBindingPromptContext(
  bindingSupport: ReturnType<typeof buildWorldBindingSupport>,
): WorldBindingSupport {
  return {
    recommendedEntryPoints: compactList(bindingSupport.recommendedEntryPoints, 8, 160),
    highPressureForces: compactList(bindingSupport.highPressureForces, 8, 120),
    suggestedLocationClusters: bindingSupport.suggestedLocationClusters.slice(0, 8).map((cluster) => ({
      id: cluster.id,
      label: compactText(cluster.label, 100),
      locationIds: cluster.locationIds.slice(0, 12),
      reason: compactText(cluster.reason, 160),
    })),
    compatibleConflicts: compactList(bindingSupport.compatibleConflicts, 8, 140),
    forbiddenCombinations: compactList(bindingSupport.forbiddenCombinations, 8, 140),
  };
}

function stageConstraints(section: WorldStructureSectionKey, options: WorldSkeletonGenerationOptions): string {
  const { counts } = options;
  switch (section) {
    case "profile":
      return "只生成 profile 五个字段，保持每个字段为短句，不要输出其他 section。";
    case "rules":
      return `rules.axioms 必须正好 ${counts.rules} 条；每条都要有唯一 id、边界、代价和执行方式。`;
    case "factions":
      return [
        `factions 必须正好 ${counts.factionGroups} 个，forces 必须正好 ${counts.forces} 个。`,
        "每个 force 都必须是可行动的组织或机构，并填写 resources、currentObjective、pressure。",
        "faction 的 representativeForceIds 只能引用本阶段生成的 force id。",
      ].join("\n");
    case "locations":
      return [
        `locations 必须正好 ${counts.locations} 个。`,
        "每个地点都必须提供 0-100 的 x/y、directionHint、terrain、narrativeFunction、risk、entryConstraint、exitCost。",
        "controllingForceIds 只能引用当前结构中已经存在的 force id。",
      ].join("\n");
    case "relations":
      return [
        `forceRelations 至少 ${Math.max(1, counts.conflicts)} 条，并且只能连接已存在的 force id。`,
        "locationControls 应覆盖关键地点与其控制势力。",
        "locationConnections 至少生成 locations 数量减一条可行动路径，只连接已存在的地点 id。",
      ].join("\n");
    default:
      return buildStructureSectionInstructions(section);
  }
}

function buildStagePromptSource(
  input: WorldSkeletonGenerateInput,
  options: WorldSkeletonGenerationOptions,
  section: WorldStructureSectionKey,
  retryReason?: string,
): string {
  const { counts } = options;
  return [
    "这是世界骨架的分阶段生成任务。",
    `当前阶段：${section}`,
    `世界意图：${compactText(input.idea, 6_000)}`,
    `世界类型：${input.worldType || "自定义"}`,
    `模板：${input.template || "自定义"}`,
    `规模预设：${options.preset}`,
    `目标数量：规则 ${counts.rules}、阵营 ${counts.factionGroups}、势力 ${counts.forces}、地点 ${counts.locations}、冲突 ${counts.conflicts}、故事入口 ${counts.storyEntrySuggestions}`,
    input.blueprint ? `用户蓝图：${compactJson(input.blueprint)}` : "用户蓝图：无",
    input.referenceContext ? `参考约束：${compactJson(input.referenceContext)}` : "参考约束：无",
    "文本约束：短字段不超过 16 个汉字，说明不超过 28 个汉字；总输出保持紧凑。",
    `阶段硬约束：\n${stageConstraints(section, options)}`,
    retryReason ? `上一次本阶段结果未通过装配校验，请只修正以下问题：${retryReason}` : "",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

function isReasoningBudgetExhausted(error: unknown): boolean {
  if (error && typeof error === "object" && "category" in error) {
    const category = (error as { category?: unknown }).category;
    if (category === "reasoning_budget_exhausted") {
      return true;
    }
  }
  return extractStructuredOutputErrorCategory(errorMessage(error)) === "reasoning_budget_exhausted";
}

function annotateCheckpointError(
  error: unknown,
  runId: string,
  stage: WorldStructureSectionKey | "presentation",
): unknown {
  const target = error && typeof error === "object" ? error : new Error(errorMessage(error));
  try {
    Object.defineProperty(target, "worldGenerationRunId", { value: runId, configurable: true });
    Object.defineProperty(target, "worldGenerationStage", { value: stage, configurable: true });
  } catch {
    // Preserve the original error when a provider returns a frozen object.
  }
  return target;
}

function uniqueIds(items: Array<{ id: string }>, label: string): void {
  const ids = items.map((item) => item.id).filter(Boolean);
  if (ids.length !== new Set(ids).size) {
    throw new Error(`世界骨架 ${label} 存在重复 id。`);
  }
}

function assertReferences(
  structure: WorldStructuredData,
  section: WorldStructureSectionKey,
  options: WorldSkeletonGenerationOptions,
): void {
  const schemaResult = worldStructuredDataSchema.safeParse(structure);
  if (!schemaResult.success) {
    throw new Error(`世界骨架 ${section} 阶段的结构未通过 JSON Schema 校验。`);
  }
  const forceIds = new Set(structure.forces.map((item) => item.id));
  const locationIds = new Set(structure.locations.map((item) => item.id));
  if (section === "profile") {
    const fields = [structure.profile.summary, structure.profile.identity, structure.profile.tone, structure.profile.coreConflict];
    if (fields.some((value) => !value.trim())) {
      throw new Error("世界骨架 profile 阶段缺少必要字段。");
    }
    return;
  }
  if (section === "rules") {
    uniqueIds(structure.rules.axioms, "核心规则");
    if (structure.rules.axioms.length !== options.counts.rules) {
      throw new Error(`世界骨架核心规则数量不符合要求，期望 ${options.counts.rules} 条。`);
    }
    return;
  }
  if (section === "factions") {
    uniqueIds(structure.factions, "阵营");
    uniqueIds(structure.forces, "势力");
    if (structure.factions.length !== options.counts.factionGroups || structure.forces.length !== options.counts.forces) {
      throw new Error("世界骨架势力阶段的阵营或势力数量不符合要求。");
    }
    for (const faction of structure.factions) {
      if (faction.representativeForceIds.some((id) => !forceIds.has(id))) {
        throw new Error(`世界骨架阵营 ${faction.name} 引用了不存在的势力 id。`);
      }
    }
    const weakForce = structure.forces.find((force) =>
      (force.resources ?? []).length === 0 || !force.currentObjective.trim() || !force.pressure.trim(),
    );
    if (weakForce) {
      throw new Error(`世界骨架势力 ${weakForce.name} 缺少资源、目标或施压方式。`);
    }
    return;
  }
  if (section === "locations") {
    uniqueIds(structure.locations, "地点");
    if (structure.locations.length !== options.counts.locations) {
      throw new Error(`世界骨架地点数量不符合要求，期望 ${options.counts.locations} 个。`);
    }
    const missingMapData = structure.locations.find((location) =>
      typeof location.x !== "number"
      || typeof location.y !== "number"
      || !location.directionHint
      || !location.narrativeFunction.trim()
      || !location.entryConstraint.trim()
      || !location.exitCost.trim(),
    );
    if (missingMapData) {
      throw new Error(`世界骨架地点 ${missingMapData.name} 缺少地图或行动字段。`);
    }
    const invalidController = structure.locations
      .flatMap((location) => location.controllingForceIds)
      .find((id) => !forceIds.has(id));
    if (invalidController) {
      throw new Error(`世界骨架地点引用了不存在的势力 id：${invalidController}。`);
    }
    return;
  }
  uniqueIds(structure.relations.forceRelations, "势力关系");
  uniqueIds(structure.relations.locationControls, "地点控制关系");
  uniqueIds(structure.relations.locationConnections ?? [], "地点连接关系");
  if (structure.relations.forceRelations.length < Math.max(1, options.counts.conflicts)) {
    throw new Error(`世界骨架势力关系不足，至少需要 ${Math.max(1, options.counts.conflicts)} 条。`);
  }
  const invalidForceRelation = structure.relations.forceRelations.find(
    (item) => !forceIds.has(item.sourceForceId) || !forceIds.has(item.targetForceId),
  );
  if (invalidForceRelation) {
    throw new Error("世界骨架势力关系引用了不存在的势力 id。");
  }
  const invalidLocationRelation = structure.relations.locationControls.find(
    (item) => !forceIds.has(item.forceId) || !locationIds.has(item.locationId),
  );
  if (invalidLocationRelation) {
    throw new Error("世界骨架地点控制关系引用了不存在的实体 id。");
  }
  const invalidForceLocation = structure.forces
    .flatMap((force) => force.controlledLocationIds ?? [])
    .find((id) => !locationIds.has(id));
  if (invalidForceLocation) {
    throw new Error(`世界骨架势力引用了不存在的地点 id：${invalidForceLocation}。`);
  }
  const invalidConnection = (structure.relations.locationConnections ?? []).find(
    (item) => !locationIds.has(item.sourceLocationId) || !locationIds.has(item.targetLocationId),
  );
  if (invalidConnection) {
    throw new Error("世界骨架地点连接关系引用了不存在的地点 id。");
  }
}

function synchronizeForceLocationLinks(structure: WorldStructuredData): WorldStructuredData {
  const locationsByForce = new Map<string, string[]>();
  for (const location of structure.locations) {
    for (const forceId of location.controllingForceIds) {
      const locationIds = locationsByForce.get(forceId) ?? [];
      locationIds.push(location.id);
      locationsByForce.set(forceId, locationIds);
    }
  }
  const forces = structure.forces.map((force: WorldForce) => ({
    ...force,
    controlledLocationIds: Array.from(new Set([
      ...(force.controlledLocationIds ?? []),
      ...(locationsByForce.get(force.id) ?? []),
    ])),
  }));
  return normalizeWorldStructuredData({ ...structure, forces }, structure);
}

async function runWorldStructureStage(
  input: WorldSkeletonGenerateInput,
  options: WorldSkeletonGenerationOptions,
  section: WorldStructureSectionKey,
  current: WorldStructuredData,
): Promise<WorldStructuredData> {
  let retryReason = "";
  let disableReasoningOnRetry = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await runStructuredPrompt({
        asset: worldStructureSectionPrompt,
        promptInput: {
          section,
          promptSource: buildStagePromptSource(input, options, section, retryReason),
          currentStructure: buildWorldSkeletonPromptContext(current, section),
          currentBindingSupport: buildWorldSkeletonBindingPromptContext(buildWorldBindingSupport(current)),
          stageConstraints: stageConstraints(section, options),
        },
        options: {
          provider: input.provider ?? "deepseek",
          model: input.model,
          temperature: 0.4,
          ...(disableReasoningOnRetry ? { reasoningEnabled: false } : {}),
          reasoningEffort: "low",
          maxTokens: WORLD_SKELETON_STAGE_MAX_TOKENS[section],
          timeoutMs: WORLD_SKELETON_GENERATION_TIMEOUT_MS,
          requestBudget: WORLD_SKELETON_REQUEST_BUDGET,
        },
      });
      let next = mergeWorldStructureSection(current, section, result.output);
      if (section === "locations") {
        next = synchronizeForceLocationLinks(next);
      }
      assertReferences(next, section, options);
      return next;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      disableReasoningOnRetry = isReasoningBudgetExhausted(error);
      retryReason = errorMessage(error);
    }
  }
  throw new Error(`世界骨架阶段 ${section} 未完成。`);
}

async function startCheckpoint(
  input: WorldSkeletonGenerateInput,
): Promise<WorldSkeletonCheckpointResumeState | null> {
  if (!input.checkpointStore) {
    return null;
  }
  return input.checkpointStore.startOrResume({
    runId: input.checkpointRunId,
    request: input,
    sourceRoute: input.sourceRoute ?? "/worlds/new",
  });
}

async function generateWorldSkeletonOneShot(
  input: WorldSkeletonGenerateInput,
  options: WorldSkeletonGenerationOptions,
): Promise<WorldSkeletonGenerationPayload> {
  const checkpoint = await startCheckpoint(input);
  if (checkpoint?.status === "succeeded" && checkpoint.finalPayload) {
    return {
      ...checkpoint.finalPayload,
      generationRunId: checkpoint.runId,
    };
  }
  const runId = checkpoint?.runId;
  const effectiveInput = checkpoint
    ? { ...checkpoint.request, checkpointStore: input.checkpointStore, checkpointRunId: checkpoint.runId }
    : input;
  const effectiveOptions = normalizeWorldSkeletonGenerationOptions(effectiveInput.options);
  try {
    const result = await runStructuredPrompt({
      asset: worldSkeletonGenerationPrompt,
      promptInput: {
        idea: effectiveInput.idea,
        worldType: effectiveInput.worldType,
        template: effectiveInput.template,
        referenceContext: effectiveInput.referenceContext ?? null,
        blueprint: effectiveInput.blueprint ?? null,
        options: effectiveOptions,
      },
      options: {
        provider: effectiveInput.provider ?? "deepseek",
        model: effectiveInput.model,
        temperature: 0.7,
        reasoningEffort: "low",
        maxTokens: WORLD_SKELETON_GENERATION_MAX_TOKENS,
        timeoutMs: WORLD_SKELETON_GENERATION_TIMEOUT_MS,
        requestBudget: WORLD_SKELETON_REQUEST_BUDGET,
      },
    });
    const payload = assembleWorldSkeleton(result.output, "world-skeleton", runId);
    if (runId && input.checkpointStore) {
      await input.checkpointStore.complete({ runId, sequence: 1, payload });
    }
    return payload;
  } catch (error) {
    if (runId && input.checkpointStore) {
      await input.checkpointStore.fail({ runId, stage: "presentation", error }).catch(() => undefined);
      throw annotateCheckpointError(error, runId, "presentation");
    }
    throw error;
  }
}

async function generateWorldSkeletonStaged(
  input: WorldSkeletonGenerateInput,
  options: WorldSkeletonGenerationOptions,
): Promise<WorldSkeletonGenerationPayload> {
  const checkpoint = await startCheckpoint(input);
  if (checkpoint?.status === "succeeded" && checkpoint.finalPayload) {
    return {
      ...checkpoint.finalPayload,
      generationRunId: checkpoint.runId,
    };
  }
  const runId = checkpoint?.runId;
  const effectiveInput = checkpoint
    ? { ...checkpoint.request, checkpointStore: input.checkpointStore, checkpointRunId: checkpoint.runId }
    : input;
  const effectiveOptions = normalizeWorldSkeletonGenerationOptions(effectiveInput.options);
  let structure = checkpoint?.structure ?? createEmptyWorldStructure();
  const startIndex = Math.min(Math.max(0, checkpoint?.nextStageIndex ?? 0), WORLD_SKELETON_STAGE_ORDER.length);
  for (let index = startIndex; index < WORLD_SKELETON_STAGE_ORDER.length; index += 1) {
    const section = WORLD_SKELETON_STAGE_ORDER[index];
    try {
      structure = await runWorldStructureStage(effectiveInput, effectiveOptions, section, structure);
      if (runId && input.checkpointStore) {
        await input.checkpointStore.saveStage({
          runId,
          sequence: index + 1,
          stage: section,
          structure,
        });
      }
    } catch (error) {
      if (runId && input.checkpointStore) {
        await input.checkpointStore.fail({ runId, stage: section, error }).catch(() => undefined);
        throw annotateCheckpointError(error, runId, section);
      }
      throw error;
    }
  }

  const bindingSupport = buildWorldBindingSupport(structure);
  try {
    const presentation = await runStructuredPrompt({
      asset: worldSkeletonPresentationPrompt,
      promptInput: {
        idea: effectiveInput.idea,
        worldType: effectiveInput.worldType,
        template: effectiveInput.template,
        storyEntryCount: effectiveOptions.counts.storyEntrySuggestions,
        currentStructure: buildWorldSkeletonPresentationPromptContext(structure),
        currentBindingSupport: buildWorldSkeletonBindingPromptContext(bindingSupport),
      },
      options: {
        provider: effectiveInput.provider ?? "deepseek",
        model: effectiveInput.model,
        temperature: 0.3,
        reasoningEffort: "low",
        maxTokens: WORLD_SKELETON_STAGE_MAX_TOKENS.presentation,
        timeoutMs: WORLD_SKELETON_GENERATION_TIMEOUT_MS,
        requestBudget: WORLD_SKELETON_REQUEST_BUDGET,
      },
    });
    const output = presentation.output;
    const finalStructure = normalizeWorldStructuredData({
      ...structure,
      metadata: {
        ...structure.metadata,
        schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
        seededFrom: "world-skeleton-staged",
        lastGeneratedAt: new Date().toISOString(),
        lastSectionGenerated: "relations",
      },
    });
    const generatedBindingSupport = buildWorldBindingSupport(finalStructure);
    const payload: WorldSkeletonGenerationPayload = {
      generationRunId: runId,
      concept: output.concept,
      structuredData: finalStructure,
      bindingSupport: normalizeWorldBindingSupport(null, {
        ...generatedBindingSupport,
        recommendedEntryPoints: [
          ...output.storyEntrySuggestions.map((item) => `${item.title}：${item.description}`),
          ...generatedBindingSupport.recommendedEntryPoints,
        ].slice(0, 6),
      }),
      storyEntrySuggestions: output.storyEntrySuggestions,
      assessment: output.assessment,
    };
    if (runId && input.checkpointStore) {
      await input.checkpointStore.saveStage({
        runId,
        sequence: WORLD_SKELETON_STAGE_ORDER.length + 1,
        stage: "presentation",
        structure: finalStructure,
      });
      await input.checkpointStore.complete({
        runId,
        sequence: WORLD_SKELETON_STAGE_ORDER.length + 1,
        payload,
      });
    }
    return payload;
  } catch (error) {
    if (runId && input.checkpointStore) {
      await input.checkpointStore.fail({ runId, stage: "presentation", error }).catch(() => undefined);
      throw annotateCheckpointError(error, runId, "presentation");
    }
    throw error;
  }
}

function assembleWorldSkeleton(
  output: {
    generationRunId?: string;
    concept: WorldSkeletonGenerationPayload["concept"];
    structuredData: unknown;
    bindingSupport?: unknown;
    storyEntrySuggestions: WorldSkeletonGenerationPayload["storyEntrySuggestions"];
    assessment: WorldSkeletonGenerationPayload["assessment"];
  },
  seededFrom: string,
  generationRunId?: string,
): WorldSkeletonGenerationPayload {
  const source = output.structuredData && typeof output.structuredData === "object" && !Array.isArray(output.structuredData)
    ? output.structuredData as Record<string, unknown>
    : {};
  const sourceMetadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
    ? source.metadata as Record<string, unknown>
    : {};
  const structuredData = normalizeWorldStructuredData({
    ...source,
    metadata: {
      ...sourceMetadata,
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom,
      lastGeneratedAt: new Date().toISOString(),
    },
  });
  const generatedBindingSupport = buildWorldBindingSupport(structuredData);
  const bindingSupport = normalizeWorldBindingSupport(output.bindingSupport, {
    ...generatedBindingSupport,
    recommendedEntryPoints: [
      ...output.storyEntrySuggestions.map((item) => `${item.title}：${item.description}`),
      ...generatedBindingSupport.recommendedEntryPoints,
    ].slice(0, 6),
  });
  return {
    generationRunId: generationRunId ?? output.generationRunId,
    concept: output.concept,
    structuredData,
    bindingSupport,
    storyEntrySuggestions: output.storyEntrySuggestions,
    assessment: output.assessment,
  };
}

export async function generateWorldSkeleton(
  input: WorldSkeletonGenerateInput,
): Promise<WorldSkeletonGenerationPayload> {
  const options = normalizeWorldSkeletonGenerationOptions(input.options);
  return options.preset === "light"
    ? generateWorldSkeletonOneShot(input, options)
    : generateWorldSkeletonStaged(input, options);
}
