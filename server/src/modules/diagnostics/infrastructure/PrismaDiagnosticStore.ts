import { Prisma, type PrismaClient } from "@prisma/client";
import { diagnosticTargetResultSchema, type DiagnosticScope, type DiagnosticTargetResult } from "@ai-novel/shared/types/diagnostics";
import { prisma } from "../../../db/prisma";
import type { DiagnosticSnapshot, DiagnosticStore, StoredDiagnosticRun } from "../application/diagnosticPorts";
import { sanitizeDiagnosticError, sanitizeDiagnosticTarget } from "./diagnosticSanitization";

const RETAINED_COMPLETED_RUNS = 20;

type DiagnosticPrisma = Pick<PrismaClient,
  "$transaction" | "diagnosticRun" | "diagnosticTargetResult" | "diagnosticRecommendationApplication"
>;

type StoredRunRow = Prisma.DiagnosticRunGetPayload<{ include: { targets: true } }>;

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function toStoredTarget(row: StoredRunRow["targets"][number]): DiagnosticTargetResult {
  return diagnosticTargetResultSchema.parse({
    targetId: row.targetId,
    targetKind: row.targetKind,
    taskType: row.taskType,
    provider: row.provider,
    model: row.model,
    checkState: row.checkState,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary,
    capabilities: parseJson(row.capabilitiesJson),
    recommendation: row.recommendationJson ? parseJson(row.recommendationJson) : null,
    revision: row.revision,
  });
}

function toStoredRun(row: StoredRunRow): StoredDiagnosticRun {
  if (row.scope !== "model_routes" && row.scope !== "rag") {
    throw new Error("Unsupported persisted diagnostic scope.");
  }
  if (row.checkState !== "not_checked" && row.checkState !== "healthy" && row.checkState !== "failed") {
    throw new Error("Unsupported persisted diagnostic state.");
  }
  return {
    id: row.id,
    scope: row.scope,
    configurationFingerprint: row.configurationFingerprint,
    checkState: row.checkState,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    leaseExpiresAt: row.leaseExpiresAt,
    targets: row.targets.map(toStoredTarget),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaDiagnosticStore implements DiagnosticStore {
  constructor(private readonly client: DiagnosticPrisma = prisma) {}

  async read(scope: DiagnosticScope): Promise<StoredDiagnosticRun[]> {
    const rows = await this.client.diagnosticRun.findMany({
      where: { scope },
      include: { targets: { orderBy: { targetId: "asc" } } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toStoredRun);
  }

  async claim(snapshot: DiagnosticSnapshot, expiresAt: Date): Promise<{ acquired: boolean; run: StoredDiagnosticRun }> {
    const activeClaimKey = `${snapshot.scope}:${snapshot.configurationFingerprint}`;
    const now = new Date();
    try {
      return await this.client.$transaction(async (tx) => {
        await tx.diagnosticRun.updateMany({
          where: {
            activeClaimKey,
            completedAt: null,
            leaseExpiresAt: { lte: now },
          },
          data: {
            checkState: "failed",
            errorSummary: sanitizeDiagnosticError("lease_expired"),
            completedAt: now,
            activeClaimKey: null,
            leaseExpiresAt: null,
          },
        });
        const active = await tx.diagnosticRun.findUnique({
          where: { activeClaimKey },
          include: { targets: true },
        });
        if (active) {
          return { acquired: false, run: toStoredRun(active) };
        }
        const created = await tx.diagnosticRun.create({
          data: {
            scope: snapshot.scope,
            configurationFingerprint: snapshot.configurationFingerprint,
            checkState: "not_checked",
            startedAt: now,
            activeClaimKey,
            leaseExpiresAt: expiresAt,
          },
          include: { targets: true },
        });
        return { acquired: true, run: toStoredRun(created) };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await this.client.diagnosticRun.findFirst({
        where: {
          scope: snapshot.scope,
          configurationFingerprint: snapshot.configurationFingerprint,
        },
        orderBy: { createdAt: "desc" },
        include: { targets: true },
      });
      if (!winner) throw error;
      return { acquired: false, run: toStoredRun(winner) };
    }
  }

  async complete(id: string, targets: DiagnosticTargetResult[]): Promise<void> {
    const sanitizedTargets = targets.map(sanitizeDiagnosticTarget);
    const completedAt = new Date();
    const checkState = sanitizedTargets.length > 0
      && sanitizedTargets.every((target) => target.checkState === "healthy")
      ? "healthy"
      : "failed";
    await this.client.$transaction(async (tx) => {
      const completed = await tx.diagnosticRun.updateMany({
        where: { id, completedAt: null, activeClaimKey: { not: null } },
        data: {
          checkState,
          completedAt,
          errorSummary: checkState === "failed" ? sanitizeDiagnosticError("probe_failed") : null,
          activeClaimKey: null,
          leaseExpiresAt: null,
        },
      });
      if (completed.count !== 1) {
        throw new Error("Diagnostic claim expired before completion.");
      }
      if (sanitizedTargets.length > 0) {
        await tx.diagnosticTargetResult.createMany({
          data: sanitizedTargets.map((target) => ({
            runId: id,
            targetId: target.targetId,
            targetKind: target.targetKind,
            taskType: target.taskType,
            provider: target.provider,
            model: target.model,
            checkState: target.checkState,
            capabilitiesJson: JSON.stringify(target.capabilities),
            errorSummary: target.errorSummary,
            recommendationJson: target.recommendation ? JSON.stringify(target.recommendation) : null,
            revision: target.revision,
            checkedAt: target.checkedAt ? new Date(target.checkedAt) : completedAt,
          })),
        });
      }
    });
  }

  async prune(scope: DiagnosticScope): Promise<void> {
    const now = new Date();
    await this.client.diagnosticRun.updateMany({
      where: {
        scope,
        completedAt: null,
        leaseExpiresAt: { lte: now },
      },
      data: {
        checkState: "failed",
        errorSummary: sanitizeDiagnosticError("lease_expired"),
        completedAt: now,
        activeClaimKey: null,
        leaseExpiresAt: null,
      },
    });
    const [recent, latestHealthy, latestFailed, active, applied, unconsumedRecommendations] = await Promise.all([
      this.client.diagnosticRun.findMany({
        where: { scope, completedAt: { not: null } },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        take: RETAINED_COMPLETED_RUNS,
        select: { id: true },
      }),
      this.client.diagnosticRun.findFirst({
        where: { scope, checkState: "healthy", completedAt: { not: null } },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      }),
      this.client.diagnosticRun.findFirst({
        where: { scope, checkState: "failed", completedAt: { not: null } },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      }),
      this.client.diagnosticRun.findMany({
        where: { scope, completedAt: null },
        select: { id: true },
      }),
      this.client.diagnosticRecommendationApplication.findMany({
        where: { run: { scope } },
        select: { diagnosticId: true },
      }),
      this.client.diagnosticRun.findMany({
        where: {
          scope,
          targets: { some: { recommendationJson: { not: null } } },
          recommendationApplications: { none: {} },
        },
        select: { id: true },
      }),
    ]);
    const protectedIds = new Set([
      ...recent.map(({ id }) => id),
      ...active.map(({ id }) => id),
      ...applied.map(({ diagnosticId }) => diagnosticId),
      ...unconsumedRecommendations.map(({ id }) => id),
      ...(latestHealthy ? [latestHealthy.id] : []),
      ...(latestFailed ? [latestFailed.id] : []),
    ]);
    await this.client.diagnosticRun.deleteMany({
      where: {
        scope,
        completedAt: { not: null },
        ...(protectedIds.size > 0 ? { id: { notIn: [...protectedIds] } } : {}),
      },
    });
  }
}
