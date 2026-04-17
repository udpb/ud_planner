-- AlterTable
ALTER TABLE "ExtractedItem" ADD COLUMN     "appliedChannelPresetId" TEXT,
ADD COLUMN     "appliedWinningPatternId" TEXT;

-- CreateTable
CREATE TABLE "WinningPattern" (
    "id" TEXT NOT NULL,
    "sourceProject" TEXT NOT NULL,
    "sourceClient" TEXT,
    "ingestionJobId" TEXT,
    "extractedItemId" TEXT,
    "sectionKey" TEXT NOT NULL,
    "channelType" TEXT,
    "outcome" TEXT NOT NULL,
    "techEvalScore" DOUBLE PRECISION,
    "snippet" TEXT NOT NULL,
    "whyItWorks" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedBy" TEXT,
    "embedding" JSONB,

    CONSTRAINT "WinningPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPreset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keyMessages" JSONB NOT NULL,
    "avoidMessages" JSONB NOT NULL,
    "tone" TEXT NOT NULL,
    "evaluatorProfile" TEXT NOT NULL,
    "theoryMaxRatio" DOUBLE PRECISION,
    "actionWeekMinCount" INTEGER,
    "budgetTone" TEXT NOT NULL,
    "directCostMinRatio" DOUBLE PRECISION,
    "proposalStructure" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seed',

    CONSTRAINT "ChannelPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinningPattern_sectionKey_channelType_outcome_idx" ON "WinningPattern"("sectionKey", "channelType", "outcome");

-- CreateIndex
CREATE INDEX "WinningPattern_sourceProject_idx" ON "WinningPattern"("sourceProject");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPreset_code_key" ON "ChannelPreset"("code");
