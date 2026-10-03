-- CreateTable
CREATE TABLE "ModelAttemptEvidence" (
    "attemptId" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "parentAttemptId" TEXT,
    "attemptIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "routeTier" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finalAdoption" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "structuredStrategy" TEXT,
    "attributionKind" TEXT NOT NULL,
    "attributionSource" TEXT NOT NULL,
    "novelId" TEXT,
    "taskId" TEXT,
    "directorRunId" TEXT,
    "directorStepIdempotencyKey" TEXT,
    "directorNodeKey" TEXT,
    "chapterId" TEXT,
    "entrypoint" TEXT,
    "promptId" TEXT,
    "promptVersion" TEXT,
    "taskType" TEXT,
    "modelRoute" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "failureCode" TEXT,
    "failureCategory" TEXT,
    "failureRetryable" BOOLEAN,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelAttemptEvidence_requestId_attemptIndex_key" ON "ModelAttemptEvidence"("requestId", "attemptIndex");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_requestId_startedAt_idx" ON "ModelAttemptEvidence"("requestId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_parentAttemptId_idx" ON "ModelAttemptEvidence"("parentAttemptId");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_novelId_startedAt_idx" ON "ModelAttemptEvidence"("novelId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_taskId_startedAt_idx" ON "ModelAttemptEvidence"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_directorRunId_startedAt_idx" ON "ModelAttemptEvidence"("directorRunId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_chapterId_startedAt_idx" ON "ModelAttemptEvidence"("chapterId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_status_startedAt_idx" ON "ModelAttemptEvidence"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ModelAttemptEvidence_requestId_finalAdoption_idx" ON "ModelAttemptEvidence"("requestId", "finalAdoption");
