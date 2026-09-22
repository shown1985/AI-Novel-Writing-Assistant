import type {
  WorldMaintenanceCandidateAggregate,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  buildWorldStructureOverview,
  buildWorldStructureSeedFromSource,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import {
  worldStructureBackfillPrompt,
  worldStructureSectionPrompt,
} from "../../prompting/prompts/world/world.prompts";
import { buildWorldVisualizationPayload } from "./worldVisualization";
import {
  hashWorldMaintenanceValue,
  WorldMaintenanceError,
  worldMaintenanceWorkflowService,
  worldSampleSourceRoute,
  validateWorldMaintenanceCandidate,
} from "./maintenance";
import {
  type StructureBackfillInput,
  type StructureGenerateInput,
  type StructureUpdateInput,
  buildWorldStructurePromptSource,
  mergeWorldStructureSection,
  nowISO,
} from "./worldServiceShared";

interface WorldStructureCallbacks {
  createSnapshot: (worldId: string, label?: string) => Promise<unknown>;
  queueWorldUpsert: (worldId: string) => void;
}

type StructureWriteProtection = {
  operationId?: string;
  expectedContentRevision?: number;
};

type ProtectedStructureUpdateInput = StructureUpdateInput & StructureWriteProtection;

type StructureSnapshotStatus = "created" | "failed" | "unknown";

function requireStructureWriteProtection(input: StructureWriteProtection): {
  operationId: string;
  expectedContentRevision: number;
} {
  if (typeof input.operationId !== "string" || !input.operationId.trim()) {
    throw new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界结构保存需要操作标识。", {
      field: "operationId",
    });
  }
  if (
    typeof input.expectedContentRevision !== "number"
    || !Number.isInteger(input.expectedContentRevision)
    || input.expectedContentRevision < 0
  ) {
    throw new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界结构保存需要当前内容版本。", {
      field: "expectedContentRevision",
      operationId: input.operationId,
    });
  }
  return {
    operationId: input.operationId.trim(),
    expectedContentRevision: input.expectedContentRevision,
  };
}

function buildStructureCandidate(
  world: NonNullable<Awaited<ReturnType<typeof prisma.world.findUnique>>>,
  structuredFields: Record<string, unknown>,
): WorldMaintenanceCandidateAggregate {
  return {
    name: world.name,
    description: world.description,
    worldType: world.worldType,
    templateKey: world.templateKey,
    axioms: world.axioms,
    background: world.background,
    geography: world.geography,
    cultures: world.cultures,
    magicSystem: world.magicSystem,
    politics: world.politics,
    races: world.races,
    religions: world.religions,
    technology: world.technology,
    conflicts: world.conflicts,
    history: world.history,
    economy: world.economy,
    factions: world.factions,
    status: world.status,
    selectedDimensions: world.selectedDimensions,
    selectedElements: world.selectedElements,
    layerStates: world.layerStates,
    overviewSummary: world.overviewSummary,
    structureJson: world.structureJson,
    bindingSupportJson: world.bindingSupportJson,
    structureSchemaVersion: world.structureSchemaVersion,
    ...structuredFields,
  } as WorldMaintenanceCandidateAggregate;
}

async function getRequiredWorld(worldId: string) {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new Error("World not found.");
  }
  return world;
}

export async function getWorldOverview(
  worldId: string,
  callbacks: Pick<WorldStructureCallbacks, "queueWorldUpsert">,
) {
  const world = await getRequiredWorld(worldId);
  const structuredPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (structuredPayload.hasStructuredData) {
    const structuredOverview = buildWorldStructureOverview(
      structuredPayload.structure,
      structuredPayload.bindingSupport,
    );
    return {
      worldId,
      summary: structuredOverview.summary,
      sections: structuredOverview.sections,
    };
  }

  const sections = [
    { key: "description", title: "Overview", content: world.description ?? "N/A" },
    { key: "background", title: "Background", content: world.background ?? "N/A" },
    { key: "geography", title: "Geography", content: world.geography ?? "N/A" },
    { key: "power", title: "Power System", content: [world.magicSystem, world.technology].filter(Boolean).join("\n\n") || "N/A" },
    { key: "society", title: "Society", content: [world.races, world.politics, world.factions].filter(Boolean).join("\n\n") || "N/A" },
    { key: "culture", title: "Culture", content: [world.cultures, world.religions, world.economy].filter(Boolean).join("\n\n") || "N/A" },
    { key: "history", title: "History", content: world.history ?? "N/A" },
    { key: "conflicts", title: "Conflicts", content: world.conflicts ?? "N/A" },
  ];
  const summary = world.overviewSummary
    ?? `${world.name} is a ${world.worldType ?? "custom"} world centered on ${(world.conflicts ?? "order vs. change").slice(0, 60)}.`;

  if (!world.overviewSummary) {
    await prisma.world.update({
      where: { id: worldId },
      data: { overviewSummary: summary },
    });
    callbacks.queueWorldUpsert(worldId);
  }

  return {
    worldId,
    summary,
    sections,
  };
}

export async function getWorldStructure(worldId: string) {
  const world = await getRequiredWorld(worldId);
  const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (parsed.hasStructuredData) {
    return {
      worldId,
      hasStructuredData: true,
      structure: parsed.structure,
      bindingSupport: parsed.bindingSupport,
    };
  }

  const seededStructure = buildWorldStructureSeedFromSource(world);
  return {
    worldId,
    hasStructuredData: false,
    structure: seededStructure,
    bindingSupport: buildWorldBindingSupport(seededStructure),
  };
}

export async function updateWorldStructure(
  worldId: string,
  input: ProtectedStructureUpdateInput,
  callbacks: WorldStructureCallbacks,
) {
  const protection = requireStructureWriteProtection(input);
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new WorldMaintenanceError(404, "WORLD_TARGET_NOT_FOUND", "世界样本不存在。", {
      targetId: worldId,
    });
  }

  // Validate the raw relation graph before normalization can silently remove
  // dangling references. The maintenance facade validates again after
  // canonicalization, but this first pass must see the author's exact input.
  validateWorldMaintenanceCandidate(buildStructureCandidate(world, {
    structureJson: JSON.stringify(input.structure),
    bindingSupportJson: input.bindingSupport == null ? null : JSON.stringify(input.bindingSupport),
    structureSchemaVersion: world.structureSchemaVersion || WORLD_STRUCTURE_SCHEMA_VERSION,
  }));

  const nextStructure = normalizeWorldStructuredData(input.structure);
  nextStructure.metadata = {
    ...nextStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  };
  const nextBindingSupport = input.bindingSupport
    ? normalizeWorldBindingSupport(input.bindingSupport)
    : buildWorldBindingSupport(nextStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);
  const sourceRef = worldSampleSourceRoute(worldId);
  const candidate = buildStructureCandidate(world, structuredFields);
  const maintenance = await worldMaintenanceWorkflowService.commitWorldSample(worldId, {
    operationId: protection.operationId,
    expectedContentRevision: protection.expectedContentRevision,
    expectedDecisionRevision: 0,
    requestHash: hashWorldMaintenanceValue({
      targetType: "world",
      targetId: worldId,
      operationType: "commit_world_sample",
      operationId: protection.operationId,
      expectedContentRevision: protection.expectedContentRevision,
      sourceRef,
      intent: {
        structure: input.structure,
        bindingSupport: input.bindingSupport,
      },
    }),
    candidateAggregate: candidate,
    selectedPatchIds: [],
    sourceRef,
  });

  let snapshotStatus: StructureSnapshotStatus = "unknown";
  if (maintenance.state === "committed") {
    snapshotStatus = "created";
    try {
      await callbacks.createSnapshot(worldId, "structure-saved");
    } catch {
      snapshotStatus = "failed";
    }
    // The CAS maintenance facade already enqueues the RAG refresh and records
    // a pending debt when that best-effort refresh cannot be queued.
  }

  const updated = await prisma.world.findUnique({ where: { id: worldId } });
  if (!updated) {
    throw new WorldMaintenanceError(404, "WORLD_TARGET_NOT_FOUND", "世界样本不存在。", {
      targetId: worldId,
    });
  }
  return {
    world: updated,
    structure: nextStructure,
    bindingSupport: nextBindingSupport,
    maintenance,
    snapshotStatus,
  };
}

export async function backfillWorldStructure(
  worldId: string,
  options: StructureBackfillInput,
  callbacks: WorldStructureCallbacks,
) {
  const world = await getRequiredWorld(worldId);

  const result = await runStructuredPrompt({
    asset: worldStructureBackfillPrompt,
    promptInput: {
      promptSource: buildWorldStructurePromptSource(world),
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: 0.2,
    },
  });
  const rawStructure = result.output;
  const nextStructure = normalizeWorldStructuredData(rawStructure, buildWorldStructureFromLegacySource(world));
  nextStructure.metadata = {
    ...nextStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    seededFrom: "ai-backfill",
    lastBackfilledAt: nowISO(),
  };
  const nextBindingSupport = buildWorldBindingSupport(nextStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);

  const updated = await prisma.world.update({
    where: { id: worldId },
    data: {
      ...structuredFields,
      version: { increment: 1 },
    },
  });
  await callbacks.createSnapshot(worldId, "structure-backfill");
  callbacks.queueWorldUpsert(worldId);

  return {
    world: updated,
    structure: nextStructure,
    bindingSupport: nextBindingSupport,
    source: "ai-backfill" as const,
  };
}

export async function generateWorldStructure(
  worldId: string,
  input: StructureGenerateInput,
) {
  const world = await getRequiredWorld(worldId);

  const stored = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  const currentStructure = input.structure
    ? normalizeWorldStructuredData(input.structure, stored.structure)
    : (stored.hasStructuredData ? stored.structure : buildWorldStructureSeedFromSource(world));
  const currentBindingSupport = input.bindingSupport
    ? normalizeWorldBindingSupport(input.bindingSupport, stored.bindingSupport)
    : buildWorldBindingSupport(currentStructure);

  const result = await runStructuredPrompt({
    asset: worldStructureSectionPrompt,
    promptInput: {
      section: input.section,
      promptSource: buildWorldStructurePromptSource(world),
      currentStructure,
      currentBindingSupport,
    },
    options: {
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: 0.4,
    },
  });
  const rawSection = result.output;

  const mergedStructure = mergeWorldStructureSection(currentStructure, input.section, rawSection);
  mergedStructure.metadata = {
    ...mergedStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    lastGeneratedAt: nowISO(),
    lastSectionGenerated: input.section,
  };
  const nextBindingSupport = buildWorldBindingSupport(mergedStructure);

  return {
    worldId,
    section: input.section,
    structure: mergedStructure,
    bindingSupport: nextBindingSupport,
  };
}

export async function getWorldVisualization(worldId: string): Promise<WorldVisualizationPayload> {
  const world = await getRequiredWorld(worldId);
  return buildWorldVisualizationPayload(world);
}
