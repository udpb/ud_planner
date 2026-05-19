-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "reviewerNote" TEXT,
ADD COLUMN     "submitterNote" TEXT;
