-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "evalStrategy" JSONB,
ADD COLUMN     "keyPlanningPoints" JSONB,
ADD COLUMN     "predictedScore" DOUBLE PRECISION,
ADD COLUMN     "proposalBackground" TEXT,
ADD COLUMN     "proposalConcept" TEXT;
