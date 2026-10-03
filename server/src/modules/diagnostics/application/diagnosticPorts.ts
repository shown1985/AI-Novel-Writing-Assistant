import type { DiagnosticReadinessReport, DiagnosticScope, DiagnosticTargetResult } from "@ai-novel/shared/types/diagnostics";

export interface DiagnosticSnapshot {
  scope: DiagnosticScope;
  configurationFingerprint: string;
  targets: DiagnosticTargetResult[];
  probe(): Promise<DiagnosticTargetResult[]>;
}

export interface StoredDiagnosticRun {
  id: string;
  scope: DiagnosticScope;
  configurationFingerprint: string;
  checkState: "not_checked" | "healthy" | "failed";
  startedAt: Date;
  completedAt: Date | null;
  leaseExpiresAt: Date | null;
  targets: DiagnosticTargetResult[];
}

export interface DiagnosticStore {
  read(scope: DiagnosticScope): Promise<StoredDiagnosticRun[]>;
  claim(snapshot: DiagnosticSnapshot, expiresAt: Date): Promise<{ acquired: boolean; run: StoredDiagnosticRun }>;
  complete(id: string, targets: DiagnosticTargetResult[]): Promise<void>;
  prune(scope: DiagnosticScope): Promise<void>;
}

export type DiagnosticSnapshotLoader = (scope: DiagnosticScope) => Promise<DiagnosticSnapshot>;

export function projectReport(run: StoredDiagnosticRun, fingerprint: string): DiagnosticReadinessReport {
  const stale = run.configurationFingerprint !== fingerprint;
  return {
    diagnosticId: run.id,
    scope: run.scope,
    checkState: stale ? "stale" : run.checkState,
    checkedAt: run.completedAt?.toISOString() ?? null,
    configurationFingerprint: run.configurationFingerprint,
    targets: run.targets.map((target) => stale ? {
      ...target, checkState: "stale",
      capabilities: target.capabilities.map((capability) => ({ ...capability, checkState: "stale" })),
    } : target),
  };
}
