-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "contextBlurb" TEXT,
ADD COLUMN     "decayRate" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "workstreamType" TEXT;

-- AlterTable
ALTER TABLE "WinningProposalChunk" ADD COLUMN     "contextBlurb" TEXT,
ADD COLUMN     "workstreamType" TEXT;

-- CreateTable
CREATE TABLE "Workstream" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scoringCategory" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "budgetSliceKrw" INTEGER,
    "autoFillRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkstreamAsset" (
    "id" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "contentAssetId" TEXT,
    "winningChunkId" TEXT,
    "relevance" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WorkstreamAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinTheme" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "discriminator" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "quantified" TEXT,
    "proof" JSONB NOT NULL,
    "hotButton" TEXT,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "WinTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyPoint" (
    "id" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "winThemeId" TEXT,
    "text" TEXT NOT NULL,
    "proof" JSONB NOT NULL,

    CONSTRAINT "KeyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "scoringWeight" INTEGER,
    "mappedSection" TEXT,
    "coverage" TEXT NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricScore" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "weakest" JSONB NOT NULL,
    "panelScores" JSONB,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubricScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalOutcome" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "awardScore" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ProposalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditDiff" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "aiText" TEXT NOT NULL,
    "shippedText" TEXT NOT NULL,
    "diffKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditDiff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workstream_projectId_idx" ON "Workstream"("projectId");

-- CreateIndex
CREATE INDEX "WorkstreamAsset_workstreamId_idx" ON "WorkstreamAsset"("workstreamId");

-- CreateIndex
CREATE INDEX "WinTheme_projectId_idx" ON "WinTheme"("projectId");

-- CreateIndex
CREATE INDEX "KeyPoint_workstreamId_idx" ON "KeyPoint"("workstreamId");

-- CreateIndex
CREATE INDEX "ComplianceItem_projectId_idx" ON "ComplianceItem"("projectId");

-- CreateIndex
CREATE INDEX "RubricScore_projectId_draftVersion_idx" ON "RubricScore"("projectId", "draftVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalOutcome_projectId_key" ON "ProposalOutcome"("projectId");

-- CreateIndex
CREATE INDEX "EditDiff_projectId_idx" ON "EditDiff"("projectId");

-- AddForeignKey
ALTER TABLE "Workstream" ADD CONSTRAINT "Workstream_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamAsset" ADD CONSTRAINT "WorkstreamAsset_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinTheme" ADD CONSTRAINT "WinTheme_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyPoint" ADD CONSTRAINT "KeyPoint_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalOutcome" ADD CONSTRAINT "ProposalOutcome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditDiff" ADD CONSTRAINT "EditDiff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
