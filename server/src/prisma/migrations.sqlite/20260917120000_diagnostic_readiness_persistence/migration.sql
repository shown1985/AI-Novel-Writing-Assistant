-- AlterTable
ALTER TABLE "ModelRouteConfig" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiagnosticRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "configurationFingerprint" TEXT NOT NULL,
    "checkState" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "errorSummary" TEXT,
    "activeClaimKey" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiagnosticTargetResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "taskType" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "checkState" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "errorSummary" TEXT,
    "recommendationJson" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticTargetResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticRecommendationApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "selectionHash" TEXT NOT NULL,
    "expectedFingerprint" TEXT NOT NULL,
    "currentFingerprint" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticRecommendationApplication_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "DiagnosticRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticRun_activeClaimKey_key" ON "DiagnosticRun"("activeClaimKey");

-- CreateIndex
CREATE INDEX "DiagnosticRun_scope_createdAt_idx" ON "DiagnosticRun"("scope", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticTargetResult_runId_targetId_key" ON "DiagnosticTargetResult"("runId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticRecommendationApplication_operationId_key" ON "DiagnosticRecommendationApplication"("operationId");

-- CreateIndex
CREATE INDEX "DiagnosticRecommendationApplication_diagnosticId_createdAt_idx" ON "DiagnosticRecommendationApplication"("diagnosticId", "createdAt");
