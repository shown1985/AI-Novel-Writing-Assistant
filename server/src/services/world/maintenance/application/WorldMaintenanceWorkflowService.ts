import type {
  WorldMaintenanceCandidateAggregate,
  WorldMaintenanceCommitCommand,
  WorldMaintenanceCommitResult,
} from "@ai-novel/shared/types/world";
import {
  applyStructuredWorldToLegacyFields,
  normalizeWorldStructuredData,
} from "../../worldStructure";
import {
  hashWorldMaintenanceValue,
  normalizeSelectedPatchIds,
  validateWorldMaintenanceCandidate,
  WorldMaintenanceError,
  type WorldDecisionRevisionPort,
  type WorldRagRefreshPort,
  type WorldSampleCommitPersistencePort,
  worldSampleSourceRoute,
} from "../domain";

function assertCommitCommand(command: WorldMaintenanceCommitCommand): void {
  if (typeof command?.operationId !== "string" || !command.operationId.trim()) {
    throw new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界提交缺少操作标识。", {
      field: "operationId",
    });
  }
  if (!Number.isInteger(command.expectedContentRevision) || command.expectedContentRevision < 0) {
    throw new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界提交缺少内容版本。", {
      field: "expectedContentRevision",
      operationId: command.operationId,
    });
  }
  if (!Number.isInteger(command.expectedDecisionRevision) || command.expectedDecisionRevision < 0) {
    throw new WorldMaintenanceError(428, "REVISION_REQUIRED", "世界提交缺少作者决定版本。", {
      field: "expectedDecisionRevision",
      operationId: command.operationId,
    });
  }
  if (!Array.isArray(command.selectedPatchIds)) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交缺少选中的修改项。", {
      field: "selectedPatchIds",
      operationId: command.operationId,
    });
  }
  if (typeof command.sourceRef !== "string" || !command.sourceRef.trim()) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交缺少来源引用。", {
      field: "sourceRef",
      operationId: command.operationId,
    });
  }
  if (command.selectedPatchIds.some((item) => typeof item !== "string")) {
    throw new WorldMaintenanceError(422, "PROPOSAL_INVALID", "世界提交包含无效的修改项标识。", {
      field: "selectedPatchIds",
      operationId: command.operationId,
    });
  }
}

function buildCommittedCandidate(
  candidate: WorldMaintenanceCandidateAggregate,
): WorldMaintenanceCandidateAggregate {
  const rawStructure = validateWorldMaintenanceCandidate(candidate);
  const structure = normalizeWorldStructuredData(rawStructure);
  const compatibilityProjection = applyStructuredWorldToLegacyFields(structure, candidate);
  return {
    ...candidate,
    ...compatibilityProjection,
  };
}

export class WorldMaintenanceWorkflowService {
  constructor(
    private readonly persistence: WorldSampleCommitPersistencePort,
    private readonly decisionRevisions: WorldDecisionRevisionPort,
    private readonly ragRefresh: WorldRagRefreshPort,
  ) {}

  async commitWorldSample(
    worldId: string,
    command: WorldMaintenanceCommitCommand,
  ): Promise<WorldMaintenanceCommitResult> {
    if (!worldId?.trim()) {
      throw new WorldMaintenanceError(404, "WORLD_TARGET_NOT_FOUND", "世界样本不存在。", {
        targetId: worldId,
      });
    }
    assertCommitCommand(command);

    const candidateAggregate = buildCommittedCandidate(command.candidateAggregate);
    const selectedPatchIds = normalizeSelectedPatchIds(command.selectedPatchIds);
    const requestHash = hashWorldMaintenanceValue({
      targetType: "world",
      targetId: worldId,
      operationType: "commit_world_sample",
      operationId: command.operationId,
      expectedContentRevision: command.expectedContentRevision,
      expectedDecisionRevision: command.expectedDecisionRevision,
      candidateAggregate,
      selectedPatchIds,
      sourceRef: command.sourceRef.trim(),
    });
    const afterDigest = hashWorldMaintenanceValue(candidateAggregate);

    // Resolve an existing operation before reading the current decision set. A
    // response-lost retry must return its durable receipt even if a later author
    // decision changed; re-running the decision check would turn a replay into
    // a false conflict.
    let knownOperation;
    try {
      knownOperation = await this.persistence.readWorldSampleOperation(worldId, command.operationId);
    } catch {
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "暂时无法确认世界内容是否保存，请按操作标识查询。", {
        operationId: command.operationId,
        sourceRoute: worldSampleSourceRoute(worldId),
      });
    }
    if (knownOperation.kind === "committed") {
      if (knownOperation.requestHash && knownOperation.requestHash !== requestHash) {
        throw new WorldMaintenanceError(409, "OPERATION_ID_REUSED", "该操作标识已用于不同的世界提交。", {
          operationId: command.operationId,
        });
      }
      return {
        operationId: command.operationId,
        target: { type: "world", id: worldId },
        state: "replayed",
        contentSaved: true,
        committedRevision: knownOperation.receipt.committedRevision,
        receipt: knownOperation.receipt,
        sourceRoute: worldSampleSourceRoute(worldId),
      };
    }
    if (knownOperation.kind === "operation_without_receipt") {
      if (knownOperation.requestHash && knownOperation.requestHash !== requestHash) {
        throw new WorldMaintenanceError(409, "OPERATION_ID_REUSED", "该操作标识已用于不同的世界提交。", {
          operationId: command.operationId,
        });
      }
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "暂时无法确认世界内容是否保存，请按操作标识查询。", {
        operationId: command.operationId,
        sourceRoute: worldSampleSourceRoute(worldId),
      });
    }

    const decision = await this.decisionRevisions.readWorldDecisionRevision(worldId);
    if (decision.decisionRevision !== command.expectedDecisionRevision) {
      throw new WorldMaintenanceError(409, "DECISION_REVISION_CONFLICT", "作者决定已发生变化，请重新查看改动方案。", {
        operationId: command.operationId,
        expectedDecisionRevision: command.expectedDecisionRevision,
        currentDecisionRevision: decision.decisionRevision,
      });
    }

    const outcome = await this.persistence.commitWorldSample({
      targetId: worldId,
      operationId: command.operationId,
      requestHash,
      expectedContentRevision: command.expectedContentRevision,
      decisionRevision: decision.decisionRevision,
      candidateAggregate,
      selectedPatchIds,
      afterDigest,
    });
    const sourceRoute = worldSampleSourceRoute(worldId);

    switch (outcome.kind) {
      case "committed": {
        let ragRefreshPending = false;
        try {
          await this.ragRefresh.enqueueWorldRefresh(worldId);
        } catch {
          ragRefreshPending = true;
        }
        return {
          operationId: command.operationId,
          target: { type: "world", id: worldId },
          state: "committed",
          contentSaved: true,
          committedRevision: outcome.receipt.committedRevision,
          receipt: outcome.receipt,
          sourceRoute,
          ragRefreshPending,
        };
      }
      case "replayed":
        return {
          operationId: command.operationId,
          target: { type: "world", id: worldId },
          state: "replayed",
          contentSaved: true,
          committedRevision: outcome.receipt.committedRevision,
          receipt: outcome.receipt,
          sourceRoute,
        };
      case "target_not_found":
        throw new WorldMaintenanceError(404, "WORLD_TARGET_NOT_FOUND", "世界样本不存在。", {
          targetId: worldId,
          operationId: command.operationId,
        });
      case "content_revision_conflict":
        throw new WorldMaintenanceError(409, "CONTENT_REVISION_CONFLICT", "世界内容已发生变化，请重新查看改动方案。", {
          operationId: command.operationId,
          expectedContentRevision: command.expectedContentRevision,
          currentContentRevision: outcome.currentContentRevision,
        });
      case "operation_id_reused":
        throw new WorldMaintenanceError(409, "OPERATION_ID_REUSED", "该操作标识已用于不同的世界提交。", {
          operationId: command.operationId,
        });
      case "commit_result_unknown":
        throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "暂时无法确认世界内容是否保存，请按操作标识查询。", {
          operationId: command.operationId,
          sourceRoute,
        });
    }
  }

  async getWorldSampleCommitByOperation(
    worldId: string,
    operationId: string,
  ): Promise<WorldMaintenanceCommitResult> {
    if (!worldId?.trim() || !operationId?.trim()) {
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "缺少可查询的世界操作标识。", {
        targetId: worldId,
        operationId,
      });
    }
    let outcome;
    try {
      outcome = await this.persistence.readWorldSampleOperation(worldId, operationId);
    } catch {
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "暂时无法确认世界内容是否保存，请按原操作标识重试查询。", {
        targetId: worldId,
        operationId,
      });
    }
    if (outcome.kind !== "committed") {
      throw new WorldMaintenanceError(503, "COMMIT_RESULT_UNKNOWN", "暂时无法确认世界内容是否保存，请按原操作标识重试查询。", {
        targetId: worldId,
        operationId,
        operationFound: outcome.kind === "operation_without_receipt",
      });
    }
    return {
      operationId,
      target: { type: "world", id: worldId },
      state: "replayed",
      contentSaved: true,
      committedRevision: outcome.receipt.committedRevision,
      receipt: outcome.receipt,
      sourceRoute: worldSampleSourceRoute(worldId),
    };
  }
}
