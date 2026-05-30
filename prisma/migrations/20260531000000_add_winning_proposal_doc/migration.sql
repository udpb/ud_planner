-- CreateTable: WinningProposalDoc (P9 — 당선 제안서 full-text 영구 학습)
CREATE TABLE "WinningProposalDoc" (
    "id" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT NOT NULL,
    "client" TEXT,
    "channel" TEXT,
    "year" INTEGER,
    "sourceTab" TEXT,
    "won" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fullText" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "parseBy" TEXT,
    "lowText" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinningProposalDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WinningProposalDoc_sourceFileId_key" ON "WinningProposalDoc"("sourceFileId");
CREATE INDEX "WinningProposalDoc_projectName_idx" ON "WinningProposalDoc"("projectName");
CREATE INDEX "WinningProposalDoc_channel_idx" ON "WinningProposalDoc"("channel");
CREATE INDEX "WinningProposalDoc_won_idx" ON "WinningProposalDoc"("won");
