-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceFile" TEXT,
    "sourceUrl" TEXT,
    "metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "error" TEXT,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "targetAsset" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNotes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedId" TEXT,

    CONSTRAINT "ExtractedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionJob_kind_status_idx" ON "IngestionJob"("kind", "status");

-- CreateIndex
CREATE INDEX "IngestionJob_uploadedBy_idx" ON "IngestionJob"("uploadedBy");

-- CreateIndex
CREATE INDEX "ExtractedItem_jobId_idx" ON "ExtractedItem"("jobId");

-- CreateIndex
CREATE INDEX "ExtractedItem_targetAsset_status_idx" ON "ExtractedItem"("targetAsset", "status");

-- AddForeignKey
ALTER TABLE "ExtractedItem" ADD CONSTRAINT "ExtractedItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
