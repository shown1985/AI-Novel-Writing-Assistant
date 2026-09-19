import type { PrismaClient } from "@prisma/client";
import type {
  WorldMaintenanceCandidateAggregate,
  WorldMaintenanceCommitReceipt,
} from "@ai-novel/shared/types/world";
import { prisma } from "../../../../db/prisma";
import {
  hashWorldMaintenanceValue,
  validateWorldMaintenanceCandidate,
  WORLD_SAMPLE_COMMIT_OPERATION_TYPE,
  WORLD_SAMPLE_TARGET_TYPE,
  type PersistWorldSampleCommitInput,
  type PersistWorldSampleCommitOutcome,
  type ReadWorldSampleOperationOutcome,
  type WorldSampleCommitPersistencePort,
} from "../domain";

const worldContentSelect = {
  name: true,
  description: true,
  worldType: true,
  templateKey: true,
  axioms: true,
  background: true,
  geography: true,
  cultures: true,
  magicSystem: true,
  politics: true,
  races: true,
  religions: true,
  technology: true,
  conflicts: true,
  history: true,
  economy: true,
  factions: true,
  status: true,
  selectedDimensions: true,
  selectedElements: true,
  layerStates: true,
  overviewSummary: true,
  structureJson: true,
  bindingSupportJson: true,
  structureSchemaVersion: true,
  contentRevision: true,
} as const;

type PersistedReceipt = {
  targetType: string;
  targetId: string;
  baseRevision: number;
  committedRevision: number;
  decisionRevision: number;
  selectedPatchIdsJson: string;
  beforeDigest: string;
  afterDigest: string;
  committedAt: Date;
};

class ContentRevisionRace extends Error {}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function parsePatchIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toReceipt(operationId: string, receipt: PersistedReceipt): WorldMaintenanceCommitReceipt {
  return {
    operationId,
    targetType: WORLD_SAMPLE_TARGET_TYPE,
    targetId: receipt.targetId,
    baseRevision: receipt.baseRevision,
    committedRevision: receipt.committedRevision,
    decisionRevision: receipt.decisionRevision,
    selectedPatchIds: parsePatchIds(receipt.selectedPatchIdsJson),
    beforeDigest: receipt.beforeDigest,
    afterDigest: receipt.afterDigest,
    committedAt: receipt.committedAt.toISOString(),
  };
}

function worldUpdateData(candidate: WorldMaintenanceCandidateAggregate) {
  return {
    name: candidate.name,
    description: candidate.description ?? null,
    worldType: candidate.worldType ?? null,
    templateKey: candidate.templateKey ?? null,
    axioms: candidate.axioms ?? null,
    background: candidate.background ?? null,
    geography: candidate.geography ?? null,
    cultures: candidate.cultures ?? null,
    magicSystem: candidate.magicSystem ?? null,
    politics: candidate.politics ?? null,
    races: candidate.races ?? null,
    religions: candidate.religions ?? null,
    technology: candidate.technology ?? null,
    conflicts: candidate.conflicts ?? null,
    history: candidate.history ?? null,
    economy: candidate.economy ?? null,
    factions: candidate.factions ?? null,
    status: candidate.status,
    selectedDimensions: candidate.selectedDimensions ?? null,
    selectedElements: candidate.selectedElements ?? null,
    layerStates: candidate.layerStates ?? null,
    overviewSummary: candidate.overviewSummary ?? null,
    structureJson: candidate.structureJson ?? null,
    bindingSupportJson: candidate.bindingSupportJson ?? null,
    structureSchemaVersion: candidate.structureSchemaVersion,
    contentRevision: { increment: 1 },
  };
}

function withoutRevision<T extends { contentRevision: number }>(world: T): Omit<T, "contentRevision"> {
  const { contentRevision: _contentRevision, ...content } = world;
  return content;
}

export class PrismaWorldSampleCommitStore implements WorldSampleCommitPersistencePort {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async findOperation(targetId: string, operationId: string) {
    return this.client.worldMaintenanceOperation.findUnique({
      where: {
        targetType_targetId_operationType_operationId: {
          targetType: WORLD_SAMPLE_TARGET_TYPE,
          targetId,
          operationType: WORLD_SAMPLE_COMMIT_OPERATION_TYPE,
          operationId,
        },
      },
      include: { receipt: true },
    });
  }

  async readWorldSampleOperation(
    targetId: string,
    operationId: string,
  ): Promise<ReadWorldSampleOperationOutcome> {
    const operation = await this.findOperation(targetId, operationId);
    if (!operation) {
      return { kind: "not_found" };
    }
    if (!operation.receipt) {
      return { kind: "operation_without_receipt", requestHash: operation.requestHash };
    }
    return {
      kind: "committed",
      requestHash: operation.requestHash,
      receipt: toReceipt(operation.operationId, operation.receipt),
    };
  }

  private async resolveExistingOperation(
    input: PersistWorldSampleCommitInput,
  ): Promise<PersistWorldSampleCommitOutcome | undefined> {
    const operation = await this.findOperation(input.targetId, input.operationId);
    if (!operation) {
      return undefined;
    }
    if (operation.requestHash !== input.requestHash) {
      return { kind: "operation_id_reused" };
    }
    if (!operation.receipt) {
      return { kind: "commit_result_unknown" };
    }
    return {
      kind: "replayed",
      receipt: toReceipt(operation.operationId, operation.receipt),
    };
  }

  async commitWorldSample(input: PersistWorldSampleCommitInput): Promise<PersistWorldSampleCommitOutcome> {
    // Keep this adapter safe when used directly by an internal caller: the
    // persistence boundary must never turn an omitted aggregate field into a
    // destructive null update.
    validateWorldMaintenanceCandidate(input.candidateAggregate);
    const existing = await this.resolveExistingOperation(input);
    if (existing) {
      return existing;
    }

    try {
      return await this.client.$transaction(async (tx) => {
        const current = await tx.world.findUnique({
          where: { id: input.targetId },
          select: worldContentSelect,
        });
        if (!current) {
          return { kind: "target_not_found" } as const;
        }
        if (current.contentRevision !== input.expectedContentRevision) {
          return {
            kind: "content_revision_conflict",
            currentContentRevision: current.contentRevision,
          } as const;
        }

        const operation = await tx.worldMaintenanceOperation.create({
          data: {
            targetType: WORLD_SAMPLE_TARGET_TYPE,
            targetId: input.targetId,
            operationType: WORLD_SAMPLE_COMMIT_OPERATION_TYPE,
            operationId: input.operationId,
            requestHash: input.requestHash,
            status: "committing",
          },
        });
        const updated = await tx.world.updateMany({
          where: {
            id: input.targetId,
            contentRevision: input.expectedContentRevision,
          },
          data: worldUpdateData(input.candidateAggregate),
        });
        if (updated.count !== 1) {
          throw new ContentRevisionRace();
        }

        const receipt = await tx.worldMaintenanceCommitReceipt.create({
          data: {
            operationRecordId: operation.id,
            targetType: WORLD_SAMPLE_TARGET_TYPE,
            targetId: input.targetId,
            baseRevision: input.expectedContentRevision,
            committedRevision: input.expectedContentRevision + 1,
            decisionRevision: input.decisionRevision,
            selectedPatchIdsJson: JSON.stringify(input.selectedPatchIds),
            beforeDigest: hashWorldMaintenanceValue(withoutRevision(current)),
            afterDigest: input.afterDigest,
          },
        });
        await tx.worldMaintenanceOperation.update({
          where: { id: operation.id },
          data: { status: "committed" },
        });
        return {
          kind: "committed",
          receipt: toReceipt(input.operationId, receipt),
        } as const;
      });
    } catch (error) {
      if (error instanceof ContentRevisionRace) {
        const current = await this.client.world.findUnique({
          where: { id: input.targetId },
          select: { contentRevision: true },
        });
        if (!current) {
          return { kind: "target_not_found" };
        }
        return {
          kind: "content_revision_conflict",
          currentContentRevision: current.contentRevision,
        };
      }
      if (isUniqueConstraintError(error)) {
        return (await this.resolveExistingOperation(input)) ?? { kind: "commit_result_unknown" };
      }

      // A transport error can happen after the database accepted the transaction.
      // Only a durable receipt is allowed to turn that uncertainty into success.
      try {
        const resolved = await this.resolveExistingOperation(input);
        if (resolved?.kind === "replayed" || resolved?.kind === "operation_id_reused") {
          return resolved;
        }
      } catch {
        return { kind: "commit_result_unknown" };
      }
      throw error;
    }
  }
}
