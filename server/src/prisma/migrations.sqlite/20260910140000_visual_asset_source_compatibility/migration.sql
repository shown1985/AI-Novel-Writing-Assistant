ALTER TABLE "DramaCharacter" ADD COLUMN "portraitData" TEXT;
ALTER TABLE "DramaCharacter" ADD COLUMN "threeViewData" TEXT;

ALTER TABLE "ComicCharacter" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "ComicPanel" ADD COLUMN "sceneRef" TEXT;

CREATE TABLE "ComicCharacterAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComicCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ComicCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComicCharacterAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ComicCharacterAsset_characterId_idx" ON "ComicCharacterAsset"("characterId");
CREATE INDEX "ComicCharacterAsset_projectId_idx" ON "ComicCharacterAsset"("projectId");

CREATE TABLE "ComicScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'interior',
    "bible" TEXT,
    "sheetData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComicScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ComicScene_projectId_idx" ON "ComicScene"("projectId");
