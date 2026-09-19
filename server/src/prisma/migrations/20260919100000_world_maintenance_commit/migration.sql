-- AlterTable
ALTER TABLE "World" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1;

UPDATE "World"
SET "contentRevision" = GREATEST(1, "version");

-- CreateTable
CREATE TABLE "WorldMaintenanceOperation" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMaintenanceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldMaintenanceCommitReceipt" (
    "id" TEXT NOT NULL,
    "operationRecordId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "committedRevision" INTEGER NOT NULL,
    "decisionRevision" INTEGER NOT NULL,
    "selectedPatchIdsJson" TEXT NOT NULL,
    "beforeDigest" TEXT NOT NULL,
    "afterDigest" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldMaintenanceCommitReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldMaintenanceOperation_targetType_targetId_operationType_operationId_key" ON "WorldMaintenanceOperation"("targetType", "targetId", "operationType", "operationId");

-- CreateIndex
CREATE INDEX "WorldMaintenanceOperation_targetType_targetId_updatedAt_idx" ON "WorldMaintenanceOperation"("targetType", "targetId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldMaintenanceCommitReceipt_operationRecordId_key" ON "WorldMaintenanceCommitReceipt"("operationRecordId");

-- AddForeignKey
ALTER TABLE "WorldMaintenanceCommitReceipt" ADD CONSTRAINT "WorldMaintenanceCommitReceipt_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "WorldMaintenanceOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
