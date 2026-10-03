import type { DiagnosticReadinessReport } from "@ai-novel/shared/types/diagnostics";
import { DiagnosticService } from "./application/DiagnosticService";
import { createDiagnosticSnapshotLoader } from "./infrastructure/diagnosticSnapshotLoader";
import { PrismaDiagnosticStore } from "./infrastructure/PrismaDiagnosticStore";

const diagnosticService = new DiagnosticService(
  new PrismaDiagnosticStore(),
  createDiagnosticSnapshotLoader(),
);

export function getModelRouteReadiness(): Promise<DiagnosticReadinessReport> {
  return diagnosticService.read("model_routes");
}

export function checkModelRouteReadiness(): Promise<DiagnosticReadinessReport> {
  return diagnosticService.check("model_routes");
}

export function getRagReadiness(): Promise<DiagnosticReadinessReport> {
  return diagnosticService.read("rag");
}

export function checkRagReadiness(): Promise<DiagnosticReadinessReport> {
  return diagnosticService.check("rag");
}

export { DiagnosticService } from "./application/DiagnosticService";
export type {
  DiagnosticSnapshot,
  DiagnosticSnapshotLoader,
  DiagnosticStore,
  StoredDiagnosticRun,
} from "./application/diagnosticPorts";
export { ConfigurationFingerprint } from "./infrastructure/configurationFingerprint";
export { PrismaDiagnosticStore } from "./infrastructure/PrismaDiagnosticStore";
