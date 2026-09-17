import type { DiagnosticReadinessReport, DiagnosticScope } from "@ai-novel/shared/types/diagnostics";
import { projectReport, type DiagnosticSnapshotLoader, type DiagnosticStore } from "./diagnosticPorts";

/** Reading never claims a run, invokes transport, or writes model configuration. */
export class DiagnosticService {
  private readonly running = new Map<string, Promise<DiagnosticReadinessReport>>();

  constructor(private readonly store: DiagnosticStore, private readonly load: DiagnosticSnapshotLoader) {}

  async read(scope: DiagnosticScope): Promise<DiagnosticReadinessReport> {
    const snapshot = await this.load(scope);
    const runs = await this.store.read(scope);
    const completed = runs.filter((run) => run.completedAt !== null);
    const latest = completed[0];
    const active = runs.find((run) => !run.completedAt && run.configurationFingerprint === snapshot.configurationFingerprint
      && run.leaseExpiresAt && run.leaseExpiresAt.getTime() > Date.now());
    const report: DiagnosticReadinessReport = latest ? projectReport(latest, snapshot.configurationFingerprint) : {
      diagnosticId: null, scope, checkState: "not_checked", checkedAt: null,
      configurationFingerprint: snapshot.configurationFingerprint, targets: snapshot.targets,
    };
    const previousCompleted = latest?.checkState === "failed"
      ? completed.find((run) => run.id !== latest.id)
      : undefined;
    return {
      ...report,
      ...(active ? { pending: { diagnosticId: active.id, startedAt: active.startedAt.toISOString(), expiresAt: active.leaseExpiresAt!.toISOString() } } : {}),
      ...(previousCompleted
        ? { previousReport: projectReport(previousCompleted, snapshot.configurationFingerprint) } : {}),
    };
  }

  async check(scope: DiagnosticScope): Promise<DiagnosticReadinessReport> {
    const snapshot = await this.load(scope);
    const key = `${scope}:${snapshot.configurationFingerprint}`;
    const existing = this.running.get(key);
    if (existing) return existing;
    const operation = (async () => {
      const claim = await this.store.claim(snapshot, new Date(Date.now() + 15 * 60_000));
      if (!claim.acquired) return this.read(scope);
      let targets;
      try {
        targets = await snapshot.probe();
      } catch {
        // Provider errors may embed credentials, URLs, prompts and response bodies.
        targets = snapshot.targets.map((target) => ({ ...target, checkState: "failed" as const,
          checkedAt: new Date().toISOString(), errorSummary: "检测未完成，请检查连接配置后重试。",
          capabilities: target.capabilities.map((capability) => ({ ...capability, checkState: "failed" as const,
            errorSummary: "检测未完成，请检查连接配置后重试。" })),
        }));
      }
      // Persistence errors remain API errors; they must not masquerade as failed probes.
      await this.store.complete(claim.run.id, targets);
      void this.store.prune(scope).catch(() => undefined);
      return this.read(scope);
    })();
    this.running.set(key, operation);
    try { return await operation; } finally { this.running.delete(key); }
  }
}
