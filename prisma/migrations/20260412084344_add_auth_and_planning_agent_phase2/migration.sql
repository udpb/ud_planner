-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('IDLE', 'PREPROCESSING', 'INTERVIEWING', 'SYNTHESIZING', 'COMPLETED', 'PAUSED');

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "pmId" TEXT,
    "channel" TEXT NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'IDLE',
    "stateJson" JSONB NOT NULL,
    "turnsCompleted" INTEGER NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningIntentRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT,
    "intentJson" JSONB NOT NULL,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningIntentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PMFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pmId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetField" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "correction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PMFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_projectId_idx" ON "AgentSession"("projectId");

-- CreateIndex
CREATE INDEX "AgentSession_pmId_idx" ON "AgentSession"("pmId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningIntentRecord_sessionId_key" ON "PlanningIntentRecord"("sessionId");

-- CreateIndex
CREATE INDEX "PlanningIntentRecord_projectId_idx" ON "PlanningIntentRecord"("projectId");

-- CreateIndex
CREATE INDEX "PMFeedback_sessionId_idx" ON "PMFeedback"("sessionId");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningIntentRecord" ADD CONSTRAINT "PlanningIntentRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PMFeedback" ADD CONSTRAINT "PMFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
