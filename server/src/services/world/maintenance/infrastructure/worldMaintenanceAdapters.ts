import { ragServices } from "../../../rag";
import type {
  WorldDecisionRevisionPort,
  WorldRagRefreshPort,
} from "../domain";

export class EmptyWorldDecisionRevisionPort implements WorldDecisionRevisionPort {
  async readWorldDecisionRevision(): Promise<{ decisionRevision: 0; source: "empty_compat" }> {
    return {
      decisionRevision: 0,
      source: "empty_compat",
    };
  }
}

export class WorldRagRefreshAdapter implements WorldRagRefreshPort {
  async enqueueWorldRefresh(worldId: string): Promise<void> {
    await ragServices.ragIndexService.enqueueUpsert("world", worldId);
  }
}
