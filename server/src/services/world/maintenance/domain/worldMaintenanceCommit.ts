import { createHash } from "node:crypto";
import type {
  WorldMaintenanceCandidateAggregate,
  WorldMaintenanceCommitReceipt,
  WorldStructuredData,
} from "@ai-novel/shared/types/world";

export const WORLD_SAMPLE_TARGET_TYPE = "world" as const;
export const WORLD_SAMPLE_COMMIT_OPERATION_TYPE = "commit_world_sample" as const;

export type WorldMaintenanceErrorCode =
  | "REVISION_REQUIRED"
  | "WORLD_TARGET_NOT_FOUND"
  | "CONTENT_REVISION_CONFLICT"
  | "DECISION_REVISION_CONFLICT"
  | "OPERATION_ID_REUSED"
  | "PROPOSAL_INVALID"
  | "REFERENCE_INTEGRITY_VIOLATION"
  | "COMMIT_RESULT_UNKNOWN";

export class WorldMaintenanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: WorldMaintenanceErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorldMaintenanceError";
  }
}

export interface WorldDecisionRevision {
  decisionRevision: number;
  source: "persisted" | "empty_compat";
}

export interface WorldDecisionRevisionPort {
  readWorldDecisionRevision(worldId: string): Promise<WorldDecisionRevision>;
}

export interface WorldRagRefreshPort {
  enqueueWorldRefresh(worldId: string): Promise<void>;
}

export interface PersistWorldSampleCommitInput {
  targetId: string;
  operationId: string;
  requestHash: string;
  expectedContentRevision: number;
  decisionRevision: number;
  candidateAggregate: WorldMaintenanceCandidateAggregate;
  selectedPatchIds: string[];
  afterDigest: string;
}

export type PersistWorldSampleCommitOutcome =
  | { kind: "committed"; receipt: WorldMaintenanceCommitReceipt }
  | { kind: "replayed"; receipt: WorldMaintenanceCommitReceipt }
  | { kind: "target_not_found" }
  | { kind: "content_revision_conflict"; currentContentRevision: number }
  | { kind: "operation_id_reused" }
  | { kind: "commit_result_unknown" };

export type ReadWorldSampleOperationOutcome =
  | { kind: "committed"; receipt: WorldMaintenanceCommitReceipt; requestHash?: string }
  | { kind: "operation_without_receipt"; requestHash?: string }
  | { kind: "not_found" };

export interface WorldSampleCommitPersistencePort {
  commitWorldSample(input: PersistWorldSampleCommitInput): Promise<PersistWorldSampleCommitOutcome>;
  readWorldSampleOperation(
    targetId: string,
    operationId: string,
  ): Promise<ReadWorldSampleOperationOutcome>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) {
          result[key] = canonicalize(item);
        }
        return result;
      }, {});
  }
  return value;
}

export function hashWorldMaintenanceValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", `世界提交缺少有效的 ${path}。`, { path });
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", `世界提交缺少有效的 ${path}。`, { path });
  }
  return value.trim();
}

const REQUIRED_CANDIDATE_FIELDS = [
  "name",
  "description",
  "worldType",
  "templateKey",
  "axioms",
  "background",
  "geography",
  "cultures",
  "magicSystem",
  "politics",
  "races",
  "religions",
  "technology",
  "conflicts",
  "history",
  "economy",
  "factions",
  "status",
  "selectedDimensions",
  "selectedElements",
  "layerStates",
  "overviewSummary",
  "structureJson",
  "bindingSupportJson",
  "structureSchemaVersion",
] as const;

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", `世界提交缺少有效的 ${path}。`, { path });
  }
  return value;
}

function collectIds(items: unknown[], path: string): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const row = requireObject(item, `${path}[${index}]`);
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || ids.has(id)) {
      throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交包含缺失或重复的实体 ID。", {
        path: `${path}[${index}].id`,
        id: id || null,
      });
    }
    ids.add(id);
  });
  return ids;
}

function assertReference(
  value: unknown,
  validIds: Set<string>,
  path: string,
  requiredSections: string[],
): void {
  if (typeof value !== "string" || !validIds.has(value)) {
    throw new WorldMaintenanceError(
      422,
      "REFERENCE_INTEGRITY_VIOLATION",
      "世界提交包含无法解析的实体引用。",
      { path, missingId: typeof value === "string" ? value : null, requiredSections },
    );
  }
}

function assertReferenceArray(
  value: unknown,
  validIds: Set<string>,
  path: string,
  requiredSections: string[],
): void {
  requireArray(value, path).forEach((id, index) => {
    assertReference(id, validIds, `${path}[${index}]`, requiredSections);
  });
}

/**
 * Checks the complete structured source before any normalizer can silently trim
 * dangling references. The command boundary intentionally rejects partial worlds.
 */
export function validateWorldMaintenanceCandidate(
  candidate: WorldMaintenanceCandidateAggregate,
): WorldStructuredData {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交必须包含完整候选内容。");
  }
  for (const field of REQUIRED_CANDIDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
      throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交必须包含完整候选内容。", {
        path: `candidateAggregate.${field}`,
      });
    }
  }
  requireText(candidate.name, "candidateAggregate.name");
  requireText(candidate.status, "candidateAggregate.status");
  if (!Number.isInteger(candidate.structureSchemaVersion) || candidate.structureSchemaVersion < 1) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界结构版本无效。", {
      path: "candidateAggregate.structureSchemaVersion",
    });
  }
  if (typeof candidate.structureJson !== "string" || !candidate.structureJson.trim()) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "安全提交需要完整的结构化世界内容。", {
      path: "candidateAggregate.structureJson",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.structureJson);
  } catch {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界结构 JSON 无法读取。", {
      path: "candidateAggregate.structureJson",
    });
  }

  const structure = requireObject(parsed, "candidateAggregate.structureJson");
  requireObject(structure.profile, "structure.profile");
  requireObject(structure.rules, "structure.rules");
  requireObject(structure.metadata, "structure.metadata");
  const factions = requireArray(structure.factions, "structure.factions");
  const forces = requireArray(structure.forces, "structure.forces");
  const locations = requireArray(structure.locations, "structure.locations");
  const relations = requireObject(structure.relations, "structure.relations");
  const forceRelations = requireArray(relations.forceRelations, "structure.relations.forceRelations");
  const locationControls = requireArray(relations.locationControls, "structure.relations.locationControls");
  const locationConnections = requireArray(
    relations.locationConnections,
    "structure.relations.locationConnections",
  );

  const factionIds = collectIds(factions, "structure.factions");
  const forceIds = collectIds(forces, "structure.forces");
  const locationIds = collectIds(locations, "structure.locations");

  factions.forEach((item, index) => {
    const row = requireObject(item, `structure.factions[${index}]`);
    assertReferenceArray(
      row.representativeForceIds,
      forceIds,
      `structure.factions[${index}].representativeForceIds`,
      ["factions", "forces"],
    );
  });
  forces.forEach((item, index) => {
    const row = requireObject(item, `structure.forces[${index}]`);
    if (row.factionId != null) {
      assertReference(row.factionId, factionIds, `structure.forces[${index}].factionId`, ["factions", "forces"]);
    }
    assertReferenceArray(
      row.controlledLocationIds,
      locationIds,
      `structure.forces[${index}].controlledLocationIds`,
      ["forces", "locations"],
    );
  });
  locations.forEach((item, index) => {
    const row = requireObject(item, `structure.locations[${index}]`);
    assertReferenceArray(
      row.controllingForceIds,
      forceIds,
      `structure.locations[${index}].controllingForceIds`,
      ["forces", "locations"],
    );
  });
  forceRelations.forEach((item, index) => {
    const row = requireObject(item, `structure.relations.forceRelations[${index}]`);
    assertReference(row.sourceForceId, forceIds, `structure.relations.forceRelations[${index}].sourceForceId`, ["forces"]);
    assertReference(row.targetForceId, forceIds, `structure.relations.forceRelations[${index}].targetForceId`, ["forces"]);
    if (row.sourceForceId === row.targetForceId) {
      throw new WorldMaintenanceError(422, "REFERENCE_INTEGRITY_VIOLATION", "势力关系不能指向同一实体。", {
        path: `structure.relations.forceRelations[${index}]`,
        missingId: null,
        requiredSections: ["forces"],
      });
    }
  });
  locationControls.forEach((item, index) => {
    const row = requireObject(item, `structure.relations.locationControls[${index}]`);
    assertReference(row.forceId, forceIds, `structure.relations.locationControls[${index}].forceId`, ["forces"]);
    assertReference(row.locationId, locationIds, `structure.relations.locationControls[${index}].locationId`, ["locations"]);
  });
  locationConnections.forEach((item, index) => {
    const row = requireObject(item, `structure.relations.locationConnections[${index}]`);
    assertReference(
      row.sourceLocationId,
      locationIds,
      `structure.relations.locationConnections[${index}].sourceLocationId`,
      ["locations"],
    );
    assertReference(
      row.targetLocationId,
      locationIds,
      `structure.relations.locationConnections[${index}].targetLocationId`,
      ["locations"],
    );
    if (row.sourceLocationId === row.targetLocationId) {
      throw new WorldMaintenanceError(422, "REFERENCE_INTEGRITY_VIOLATION", "地点连接不能指向同一实体。", {
        path: `structure.relations.locationConnections[${index}]`,
        missingId: null,
        requiredSections: ["locations"],
      });
    }
  });

  if (candidate.bindingSupportJson != null) {
    if (typeof candidate.bindingSupportJson !== "string" || !candidate.bindingSupportJson.trim()) {
      throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交的使用建议 JSON 无法读取。", {
        path: "candidateAggregate.bindingSupportJson",
      });
    }
    let bindingSupport: unknown;
    try {
      bindingSupport = JSON.parse(candidate.bindingSupportJson);
    } catch {
      throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交的使用建议 JSON 无法读取。", {
        path: "candidateAggregate.bindingSupportJson",
      });
    }
    const binding = requireObject(bindingSupport, "candidateAggregate.bindingSupportJson");
    if (binding.suggestedLocationClusters != null) {
      requireArray(binding.suggestedLocationClusters, "bindingSupport.suggestedLocationClusters").forEach(
        (item, index) => {
          const cluster = requireObject(item, `bindingSupport.suggestedLocationClusters[${index}]`);
          assertReferenceArray(
            cluster.locationIds,
            locationIds,
            `bindingSupport.suggestedLocationClusters[${index}].locationIds`,
            ["bindingSupport", "locations"],
          );
        },
      );
    }
  }

  return parsed as WorldStructuredData;
}

export function normalizeSelectedPatchIds(selectedPatchIds: string[]): string[] {
  return Array.from(
    new Set(selectedPatchIds.map((item) => item.trim()).filter(Boolean)),
  ).sort();
}

export function worldSampleSourceRoute(worldId: string): string {
  return `/worlds/${encodeURIComponent(worldId)}/workspace`;
}
