CREATE TABLE "WorldStructureBackfillOperation" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "baseContentRevision" INTEGER NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "generationPolicyVersion" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'model_not_called',
    "leaseExpiresAt" TIMESTAMP(3),
    "modelRequestId" TEXT,
    "modelAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorldStructureBackfillOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorldStructureBackfillOperation_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorldStructureBackfillResult" (
    "id" TEXT NOT NULL,
    "operationRecordId" TEXT NOT NULL,
    "normalizedStructureJson" TEXT NOT NULL,
    "bindingSupportJson" TEXT NOT NULL,
    "baseContentRevision" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "generationPolicyVersion" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "modelRequestId" TEXT,
    "modelAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldStructureBackfillResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorldStructureBackfillResult_operationRecordId_fkey" FOREIGN KEY ("operationRecordId") REFERENCES "WorldStructureBackfillOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorldStructureBackfillOperation_worldId_operationId_key" ON "WorldStructureBackfillOperation"("worldId", "operationId");
CREATE INDEX "WorldStructureBackfillOperation_worldId_updatedAt_idx" ON "WorldStructureBackfillOperation"("worldId", "updatedAt");
CREATE UNIQUE INDEX "WorldStructureBackfillResult_operationRecordId_key" ON "WorldStructureBackfillResult"("operationRecordId");
