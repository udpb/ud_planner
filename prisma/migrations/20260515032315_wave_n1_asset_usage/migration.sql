-- CreateTable
CREATE TABLE "AssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionKey" TEXT,
    "channel" TEXT,
    "surface" TEXT NOT NULL DEFAULT 'express',
    "wonProject" BOOLEAN,
    "techScore" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetUsage_assetId_idx" ON "AssetUsage"("assetId");

-- CreateIndex
CREATE INDEX "AssetUsage_projectId_idx" ON "AssetUsage"("projectId");

-- CreateIndex
CREATE INDEX "AssetUsage_wonProject_idx" ON "AssetUsage"("wonProject");

-- CreateIndex
CREATE INDEX "AssetUsage_channel_idx" ON "AssetUsage"("channel");

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
