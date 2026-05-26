-- AlterTable
ALTER TABLE "AssetUsage" ADD COLUMN     "rejectedByPm" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sourceRef" TEXT,
ADD COLUMN     "sourceTier" TEXT DEFAULT 'medium',
ADD COLUMN     "sourceType" TEXT DEFAULT 'manual',
ADD COLUMN     "winRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "WinningPattern" ADD COLUMN     "contentRefs" TEXT[],
ADD COLUMN     "lessonsLearned" TEXT,
ADD COLUMN     "logicGraph" JSONB,
ADD COLUMN     "logicGraphVector" DOUBLE PRECISION[],
ADD COLUMN     "lossReason" TEXT,
ADD COLUMN     "message" JSONB,
ADD COLUMN     "messageVector" DOUBLE PRECISION[],
ADD COLUMN     "tonePatterns" JSONB;

-- CreateIndex
CREATE INDEX "AssetUsage_rejectedByPm_idx" ON "AssetUsage"("rejectedByPm");
