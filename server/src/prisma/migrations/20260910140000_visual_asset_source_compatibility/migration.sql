ALTER TABLE "DramaCharacter" ADD COLUMN "portraitData" TEXT;
ALTER TABLE "DramaCharacter" ADD COLUMN "threeViewData" TEXT;

ALTER TABLE "ComicCharacter" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "ComicPanel" ADD COLUMN "sceneRef" TEXT;

CREATE TABLE "ComicCharacterAsset" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicCharacterAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicScene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'interior',
    "bible" TEXT,
    "sheetData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicScene_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComicCharacterAsset_characterId_idx" ON "ComicCharacterAsset"("characterId");
CREATE INDEX "ComicCharacterAsset_projectId_idx" ON "ComicCharacterAsset"("projectId");
CREATE INDEX "ComicScene_projectId_idx" ON "ComicScene"("projectId");

ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ComicCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicScene" ADD CONSTRAINT "ComicScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
