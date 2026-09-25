import { promptSlotOverrideService } from "../../slots/PromptSlotOverrideService";
import { selectContextBlocks } from "../contextSelection";
import type { PromptAsset, PromptExecutionOptions } from "../promptTypes";

export async function resolvePromptOverlaysForAsset(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<{
  blocks: Parameters<typeof selectContextBlocks>[0];
  resolvedSlots?: import("../../slots/slotTypes").ResolvedSlots;
}> {
  const baseBlocks = input.contextBlocks ?? [];
  const slotDefs = input.asset.slots;
  if (!slotDefs || slotDefs.length === 0) {
    return { blocks: baseBlocks };
  }

  const overlays = await promptSlotOverrideService.resolveForRuntime({
    promptId: input.asset.id,
    novelId: input.options?.novelId,
  });

  const allBlocks = overlays.appendBlocks.length > 0
    ? [...baseBlocks, ...overlays.appendBlocks]
    : baseBlocks;

  return { blocks: allBlocks, resolvedSlots: overlays.inlineSlots };
}
