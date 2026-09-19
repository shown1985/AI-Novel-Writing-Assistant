-- AlterTable
ALTER TABLE "World" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1;

UPDATE "World"
SET "contentRevision" = MAX(1, "version");

-- CreateTable
CREATE TABLE "WorldMaintenanceOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorldMaintenanceCommitReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationRecordId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "committedRevision" INTEGER NOT NULL,
    "decisionRevision" INTEGER NOT NULL,
    "selectedPatchIdsJson" TEXT NOT NULL,
    "beforeDigest" TEXT NOT NULL,
    "afterDigest" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldMaintenanceCommitReceipt_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "WorldMaintenanceOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldMaintenanceOperation_targetType_targetId_operationType_operationId_key" ON "WorldMaintenanceOperation"("targetType", "targetId", "operationType", "operationId");

-- CreateIndex
CREATE INDEX "WorldMaintenanceOperation_targetType_targetId_updatedAt_idx" ON "WorldMaintenanceOperation"("targetType", "targetId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldMaintenanceCommitReceipt_operationRecordId_key" ON "WorldMaintenanceCommitReceipt"("operationRecordId");
