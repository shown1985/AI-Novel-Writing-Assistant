import { WorldMaintenanceWorkflowService } from "./application";
import {
  EmptyWorldDecisionRevisionPort,
  PrismaWorldSampleCommitStore,
  WorldRagRefreshAdapter,
} from "./infrastructure";

export * from "./application";
export * from "./domain";

export const worldMaintenanceWorkflowService = new WorldMaintenanceWorkflowService(
  new PrismaWorldSampleCommitStore(),
  new EmptyWorldDecisionRevisionPort(),
  new WorldRagRefreshAdapter(),
);
