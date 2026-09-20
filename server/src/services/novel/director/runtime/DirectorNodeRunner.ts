import type {
  DirectorArtifactRef,
  DirectorRuntimeSnapshot,
  DirectorStepRun,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  ModelAttemptAttribution,
  ModelAttemptAttributionIssue,
} from "../../../../platform/llm/provenance/attempts/contracts";
import { runWithLlmUsageTracking } from "../../../../llm/usageTracking";
import { runWithModelAttemptRequestContext } from "../../../../platform/llm/provenance";
import { DirectorPolicyEngine, type DirectorPolicyRequest } from "./DirectorPolicyEngine";
import { DirectorRuntimeStore } from "./DirectorRuntimeStore";

function buildNodeIdempotencyKey(input: {
  taskId: string;
  nodeKey: string;
  targetType?: DirectorStepRun["targetType"];
  targetId?: string | null;
}): string {
  return `${input.taskId}:${input.nodeKey}:${input.targetType ?? "global"}:${input.targetId ?? "global"}`;
}

interface DirectorRuntimeAttributionFrame {
  attribution?: ModelAttemptAttribution;
  attributionIssue?: ModelAttemptAttributionIssue;
}

/**
 * Build one attribution frame from the persisted runtime snapshot. The
 * request input is used only to validate that snapshot identity; it is never
 * merged into a missing snapshot field or used as a run-id fallback.
 */
function buildDirectorRuntimeAttributionFrame(input: {
  taskId: string;
  novelId?: string | null;
  nodeKey: string;
  idempotencyKey: string;
  snapshot: DirectorRuntimeSnapshot | null;
}): DirectorRuntimeAttributionFrame {
  if (!input.snapshot) {
    return { attributionIssue: "director_frame_missing" };
  }

  const snapshotNovelId = input.snapshot.novelId?.trim() || null;
  const snapshotRunId = input.snapshot.runId?.trim() || null;
  const inputNovelId = input.novelId?.trim() || null;
  if (snapshotNovelId && inputNovelId && snapshotNovelId !== inputNovelId) {
    return { attributionIssue: "director_frame_conflict" };
  }

  const attribution: ModelAttemptAttribution = {
    kind: "auto_director",
    source: "director_runtime",
    novelId: snapshotNovelId,
    taskId: input.taskId,
    directorRunId: snapshotRunId,
    directorStepIdempotencyKey: input.idempotencyKey,
    directorNodeKey: input.nodeKey.trim() || null,
    chapterId: null,
    entrypoint: "director_runtime",
  };
  const isComplete = Boolean(
    attribution.novelId
      && attribution.taskId
      && attribution.directorRunId
      && attribution.directorStepIdempotencyKey
      && attribution.directorNodeKey
      && attribution.entrypoint,
  );
  return {
    attribution,
    ...(isComplete ? {} : { attributionIssue: "director_frame_incomplete" as const }),
  };
}

export interface DirectorNodeContract<TInput, TOutput> {
  nodeKey: string;
  label: string;
  reads: string[];
  writes: string[];
  policyAction?: DirectorPolicyRequest["action"];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  run(input: TInput): Promise<TOutput>;
}

export interface DirectorNodeRunInput<TInput> {
  taskId?: string | null;
  novelId?: string | null;
  targetType?: DirectorStepRun["targetType"];
  targetId?: string | null;
  input: TInput;
  policy?: Omit<Partial<DirectorPolicyRequest>, "action">;
  reuseCompletedStep?: boolean;
}

export interface DirectorNodeRunResult<TOutput> {
  status: "completed" | "needs_approval" | "blocked_scope" | "failed";
  output?: TOutput;
  runtimeSnapshot?: DirectorRuntimeSnapshot | null;
  producedArtifacts: DirectorArtifactRef[];
  reason?: string;
}

export class DirectorNodeRunner {
  constructor(
    private readonly runtimeStore = new DirectorRuntimeStore(),
    private readonly policyEngine = new DirectorPolicyEngine(),
  ) {}

  async run<TInput, TOutput>(
    contract: DirectorNodeContract<TInput, TOutput>,
    input: DirectorNodeRunInput<TInput>,
    collectArtifacts?: (output: TOutput) => DirectorArtifactRef[],
  ): Promise<DirectorNodeRunResult<TOutput>> {
    const snapshot = input.taskId?.trim()
      ? await this.runtimeStore.getSnapshot(input.taskId.trim())
      : null;
    const idempotencyKey = input.taskId?.trim()
      ? buildNodeIdempotencyKey({
        taskId: input.taskId.trim(),
        nodeKey: contract.nodeKey,
        targetType: input.targetType,
        targetId: input.targetId,
      })
      : null;
    const policyDecision = this.policyEngine.decide({
      reads: contract.reads,
      writes: contract.writes,
      targetType: input.targetType,
      targetId: input.targetId,
      mayOverwriteUserContent: contract.mayModifyUserContent,
      requiresApprovalByDefault: contract.requiresApprovalByDefault,
      ...input.policy,
      action: contract.policyAction ?? "run_node",
      policy: input.policy?.policy ?? snapshot?.policy ?? null,
    });
    const completedStep = (
      input.reuseCompletedStep !== false
      && idempotencyKey
      ? snapshot?.steps.find((step) => (
        step.idempotencyKey === idempotencyKey
        && step.status === "succeeded"
      )) ?? null
      : null
    );
    if (completedStep) {
      return {
        status: "completed",
        runtimeSnapshot: snapshot ?? null,
        producedArtifacts: completedStep.producedArtifacts ?? [],
      };
    }
    if (!policyDecision.canRun || policyDecision.requiresApproval) {
      let runtimeSnapshot: DirectorRuntimeSnapshot | null = snapshot;
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordNodeGate({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          status: policyDecision.gateType === "blocked_scope" ? "blocked_scope" : "waiting_approval",
          decision: policyDecision,
        });
        runtimeSnapshot = await this.runtimeStore.getSnapshot(input.taskId.trim());
      }
      return {
        status: policyDecision.gateType === "blocked_scope" ? "blocked_scope" : "needs_approval",
        runtimeSnapshot,
        producedArtifacts: [],
        reason: policyDecision.reason,
      };
    }

    if (input.taskId?.trim()) {
      await this.runtimeStore.recordStepStarted({
        taskId: input.taskId.trim(),
        novelId: input.novelId,
        nodeKey: contract.nodeKey,
        label: contract.label,
        targetType: input.targetType,
        targetId: input.targetId,
      });
    }

    try {
      const runtimeFrame: DirectorRuntimeAttributionFrame = input.taskId?.trim()
        ? buildDirectorRuntimeAttributionFrame({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          idempotencyKey: idempotencyKey as string,
          snapshot,
        })
        : {};
      const runContract = () => input.taskId?.trim()
        ? runWithLlmUsageTracking({
          workflowTaskId: input.taskId.trim(),
          directorTelemetry: true,
          novelId: runtimeFrame.attribution?.novelId ?? null,
          directorRunId: runtimeFrame.attribution?.directorRunId ?? null,
          directorStepIdempotencyKey: idempotencyKey,
          directorNodeKey: contract.nodeKey,
        }, () => contract.run(input.input))
        : contract.run(input.input);
      const output = input.taskId?.trim()
        ? await runWithModelAttemptRequestContext({
          mode: "invoke",
          attribution: runtimeFrame.attribution,
          attributionIssue: runtimeFrame.attributionIssue,
        }, runContract)
        : await runContract();
      const producedArtifacts = collectArtifacts?.(output) ?? [];
      let runtimeSnapshot: DirectorRuntimeSnapshot | null = null;
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordStepCompleted({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          producedArtifacts,
        });
        runtimeSnapshot = await this.runtimeStore.getSnapshot(input.taskId.trim());
      }
      return {
        status: "completed",
        output,
        runtimeSnapshot,
        producedArtifacts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordStepFailed({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          error: message,
        });
      }
      throw error;
    }
  }
}
