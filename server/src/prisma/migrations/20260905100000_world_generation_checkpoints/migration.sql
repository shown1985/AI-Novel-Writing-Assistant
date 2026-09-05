CREATE TABLE "WorldGenerationRun" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "sourceRoute" TEXT NOT NULL DEFAULT '/worlds/new',
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentStage" TEXT,
    "nextStageIndex" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "finalPayloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorldGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorldGenerationCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "structureJson" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldGenerationCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorldGenerationRun_requestHash_status_idx" ON "WorldGenerationRun"("requestHash", "status");
CREATE INDEX "WorldGenerationRun_status_updatedAt_idx" ON "WorldGenerationRun"("status", "updatedAt");
CREATE UNIQUE INDEX "WorldGenerationCheckpoint_runId_sequence_key" ON "WorldGenerationCheckpoint"("runId", "sequence");
CREATE INDEX "WorldGenerationCheckpoint_runId_createdAt_idx" ON "WorldGenerationCheckpoint"("runId", "createdAt");

ALTER TABLE "WorldGenerationCheckpoint" ADD CONSTRAINT "WorldGenerationCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorldGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
