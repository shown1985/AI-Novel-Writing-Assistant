import { hasRegisteredPromptAsset } from "../../registry";
import { CUSTOM_SLOT_CONTEXT_GROUP } from "../../slots/slotResolution";
import { selectContextBlocks } from "../contextSelection";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptInvocationMeta,
  PromptRenderContext,
} from "../promptTypes";

export function buildRenderContext(
  asset: PromptAsset<unknown, unknown, unknown>,
  rawBlocks: Parameters<typeof selectContextBlocks>[0],
  resolvedSlots?: import("../../slots/slotTypes").ResolvedSlots,
): PromptRenderContext {
  const selection = selectContextBlocks(rawBlocks, asset.contextPolicy);
  return {
    blocks: selection.selectedBlocks,
    selectedBlockIds: selection.selectedBlocks.map((block) => block.id),
    droppedBlockIds: selection.droppedBlockIds,
    summarizedBlockIds: selection.summarizedBlockIds,
    estimatedInputTokens: selection.estimatedTokens,
    slots: resolvedSlots,
  };
}

export function assertRegistered(asset: PromptAsset<unknown, unknown, unknown>): void {
  if (!hasRegisteredPromptAsset(asset.id, asset.version)) {
    throw new Error(`Prompt asset is not registered: ${asset.id}@${asset.version}`);
  }
}

export function buildPromptInvocationMeta(
  asset: PromptAsset<unknown, unknown, unknown>,
  context: PromptRenderContext,
  repairUsed: boolean,
  repairAttempts: number,
  semanticRetryUsed: boolean,
  semanticRetryAttempts: number,
  options?: PromptExecutionOptions,
): PromptInvocationMeta {
  return {
    promptId: asset.id,
    promptVersion: asset.version,
    taskType: asset.taskType,
    novelId: options?.novelId,
    chapterId: options?.chapterId,
    volumeId: options?.volumeId,
    taskId: options?.taskId,
    stage: options?.stage,
    itemKey: options?.itemKey,
    scope: options?.scope,
    entrypoint: options?.entrypoint,
    sceneIndex: options?.sceneIndex,
    roundIndex: options?.roundIndex,
    triggerReason: options?.triggerReason,
    contextBlockIds: context.selectedBlockIds,
    droppedContextBlockIds: context.droppedBlockIds,
    summarizedContextBlockIds: context.summarizedBlockIds,
    customAddendumBlockIds: context.selectedBlockIds.filter((id) => id.startsWith(`${CUSTOM_SLOT_CONTEXT_GROUP}:`)),
    estimatedInputTokens: context.estimatedInputTokens,
    repairUsed,
    repairAttempts,
    semanticRetryUsed,
    semanticRetryAttempts,
  };
}
