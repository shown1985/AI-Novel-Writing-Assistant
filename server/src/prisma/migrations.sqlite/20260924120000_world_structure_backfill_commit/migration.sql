CREATE TABLE "WorldStructureBackfillCommitReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationRecordId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "resultDigest" TEXT NOT NULL,
    "baseContentRevision" INTEGER NOT NULL,
    "committedRevision" INTEGER NOT NULL,
    "beforeDigest" TEXT NOT NULL,
    "afterDigest" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldStructureBackfillCommitReceipt_operationRecordId_fkey"
        FOREIGN KEY ("operationRecordId") REFERENCES "WorldStructureBackfillOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorldStructureBackfillCommitReceipt_operationRecordId_key"
    ON "WorldStructureBackfillCommitReceipt"("operationRecordId");
