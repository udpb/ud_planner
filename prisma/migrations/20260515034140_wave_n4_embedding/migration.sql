-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embedding" DOUBLE PRECISION[],
ADD COLUMN     "embeddingModel" TEXT;
