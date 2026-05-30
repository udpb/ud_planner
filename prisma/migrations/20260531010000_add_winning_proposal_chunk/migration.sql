-- CreateTable: WinningProposalChunk (P11 — 당선 full-text 의미검색 RAG)
CREATE TABLE "WinningProposalChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "channel" TEXT,
    "sectionHint" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinningProposalChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinningProposalChunk_docId_idx" ON "WinningProposalChunk"("docId");
CREATE INDEX "WinningProposalChunk_channel_idx" ON "WinningProposalChunk"("channel");

-- AddForeignKey
ALTER TABLE "WinningProposalChunk" ADD CONSTRAINT "WinningProposalChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "WinningProposalDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
