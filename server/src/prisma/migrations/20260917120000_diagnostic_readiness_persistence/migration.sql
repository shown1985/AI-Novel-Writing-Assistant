-- AlterTable
ALTER TABLE "ModelRouteConfig" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiagnosticRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "configurationFingerprint" TEXT NOT NULL,
    "checkState" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "activeClaimKey" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticTargetResult" (
    "id" TEXT NOT NULL,
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
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticTargetResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticRecommendationApplication" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "selectionHash" TEXT NOT NULL,
    "expectedFingerprint" TEXT NOT NULL,
    "currentFingerprint" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticRecommendationApplication_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "DiagnosticTargetResult" ADD CONSTRAINT "DiagnosticTargetResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticRecommendationApplication" ADD CONSTRAINT "DiagnosticRecommendationApplication_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "DiagnosticRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
