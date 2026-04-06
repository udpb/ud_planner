-- AlterTable
ALTER TABLE "CurriculumItem" ADD COLUMN     "isCoaching1on1" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lectureMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "practiceMinutes" INTEGER NOT NULL DEFAULT 35;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "bidNotes" TEXT,
ADD COLUMN     "feedbackApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBidWon" BOOLEAN,
ADD COLUMN     "techEvalScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SroiProxy" ADD COLUMN     "isRate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "methodology" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "ImpactModule" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "moduleOrder" INTEGER NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "coreQuestion" TEXT NOT NULL,
    "workshopOutputs" TEXT[],
    "durationMinutes" INTEGER NOT NULL DEFAULT 50,
    "sixRolesTarget" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ImpactModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "legacyCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetAudience" TEXT[],
    "businessField" TEXT[],
    "startupStage" TEXT[],
    "deliveryMethod" TEXT,
    "sixRolesTarget" TEXT[],
    "learningType" TEXT,
    "impactExpect" TEXT,
    "prerequisites" INTEGER[],
    "pptUrl" TEXT,
    "vodUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMapping" (
    "id" TEXT NOT NULL,
    "impactModuleId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,

    CONSTRAINT "ContentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignRule" (
    "id" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAudience" TEXT[],
    "businessFields" TEXT[],
    "startupStages" TEXT[],
    "formatWeights" JSONB NOT NULL,
    "impactStageWeights" JSONB NOT NULL,
    "fieldWeights" JSONB NOT NULL,
    "recommendedPattern" TEXT,
    "notes" TEXT,

    CONSTRAINT "AudienceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightSuggestion" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "suggestedValue" DOUBLE PRECISION NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WeightSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalLaborRate" (
    "id" TEXT NOT NULL,
    "gradeCode" TEXT NOT NULL,
    "gradeName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "hourlyRate" INTEGER NOT NULL,
    "dailyRate" INTEGER NOT NULL,
    "monthlyRate" INTEGER NOT NULL,
    "source" TEXT,

    CONSTRAINT "InternalLaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "discountTiers" JSONB,
    "description" TEXT,

    CONSTRAINT "ServiceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "gender" TEXT,
    "nationality" TEXT DEFAULT '대한민국',
    "residence" TEXT,
    "birthDate" TIMESTAMP(3),
    "affiliation" TEXT,
    "jobMajor" TEXT,
    "education" TEXT,
    "orgType" TEXT,
    "companyName" TEXT,
    "industry" TEXT,
    "problemToSolve" TEXT,
    "itemIntro" TEXT,
    "businessLocation" TEXT,
    "startupStage" TEXT,
    "teamSize" INTEGER,
    "teamMembers" TEXT,
    "certifications" TEXT[],
    "currentRevenue" DOUBLE PRECISION,
    "lastYearRevenue" DOUBLE PRECISION,
    "motivation" TEXT,
    "referralSource" TEXT[],
    "evaluationScores" JSONB,
    "selectionResult" TEXT,
    "graduated" BOOLEAN NOT NULL DEFAULT false,
    "participantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DogsResult" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dogsType" TEXT,
    "answers" JSONB NOT NULL,
    "scores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DogsResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActtResult" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "domainScores" JSONB,
    "totalScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActtResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartupStatusRecord" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "orgType" TEXT,
    "cumulativeRevenue" DOUBLE PRECISION,
    "bepAchieved" BOOLEAN,
    "teamSize" INTEGER,
    "patents" TEXT,
    "investorName" TEXT,
    "investAmount" DOUBLE PRECISION,
    "govSupport" TEXT,
    "privateSupport" TEXT,
    "needs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StartupStatusRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartupDiagnosis" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "consultingNeeds" TEXT[],
    "biggestChallenge" TEXT,
    "programGoal" TEXT,
    "coachRequest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StartupDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionResponse" (
    "id" TEXT NOT NULL,
    "participantId" TEXT,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "timing" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "coachName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingJournal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "participantId" TEXT,
    "coachName" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "goals" TEXT,
    "activities" TEXT,
    "diagnosis" TEXT,
    "actionPlan" TEXT,
    "stage" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlumniRecord" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "surveyYear" INTEGER NOT NULL,
    "activityStatus" TEXT,
    "startupIntent" TEXT,
    "dropoutReasons" TEXT[],
    "cumulativeRevenue" DOUBLE PRECISION,
    "bepAchieved" BOOLEAN,
    "teamSize" INTEGER,
    "patents" TEXT,
    "investStatus" TEXT,
    "supportPrograms" TEXT,
    "alumniNeeds" TEXT[],
    "concerns" TEXT[],
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlumniRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImpactModule_moduleCode_key" ON "ImpactModule"("moduleCode");

-- CreateIndex
CREATE UNIQUE INDEX "Content_legacyCode_key" ON "Content"("legacyCode");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMapping_impactModuleId_contentId_key" ON "ContentMapping"("impactModuleId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignRule_ruleCode_key" ON "DesignRule"("ruleCode");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceProfile_name_key" ON "AudienceProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLaborRate_gradeCode_key" ON "InternalLaborRate"("gradeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProduct_code_key" ON "ServiceProduct"("code");

-- CreateIndex
CREATE INDEX "Applicant_projectId_idx" ON "Applicant"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DogsResult_participantId_projectId_key" ON "DogsResult"("participantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ActtResult_participantId_projectId_timing_key" ON "ActtResult"("participantId", "projectId", "timing");

-- CreateIndex
CREATE UNIQUE INDEX "StartupStatusRecord_participantId_projectId_timing_key" ON "StartupStatusRecord"("participantId", "projectId", "timing");

-- CreateIndex
CREATE UNIQUE INDEX "StartupDiagnosis_participantId_projectId_key" ON "StartupDiagnosis"("participantId", "projectId");

-- CreateIndex
CREATE INDEX "SatisfactionResponse_projectId_timing_idx" ON "SatisfactionResponse"("projectId", "timing");

-- CreateIndex
CREATE UNIQUE INDEX "AlumniRecord_participantId_surveyYear_key" ON "AlumniRecord"("participantId", "surveyYear");

-- AddForeignKey
ALTER TABLE "ContentMapping" ADD CONSTRAINT "ContentMapping_impactModuleId_fkey" FOREIGN KEY ("impactModuleId") REFERENCES "ImpactModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMapping" ADD CONSTRAINT "ContentMapping_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogsResult" ADD CONSTRAINT "DogsResult_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActtResult" ADD CONSTRAINT "ActtResult_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartupStatusRecord" ADD CONSTRAINT "StartupStatusRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartupDiagnosis" ADD CONSTRAINT "StartupDiagnosis_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingJournal" ADD CONSTRAINT "CoachingJournal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingJournal" ADD CONSTRAINT "CoachingJournal_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniRecord" ADD CONSTRAINT "AlumniRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
