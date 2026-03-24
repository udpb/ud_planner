-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PM', 'DIRECTOR', 'CM', 'FM', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "CoachTier" AS ENUM ('TIER1', 'TIER2', 'TIER3');

-- CreateEnum
CREATE TYPE "CoachCategory" AS ENUM ('PARTNER_COACH', 'COACH', 'GLOBAL_COACH', 'CONSULTANT', 'INVESTOR');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('BUSINESS', 'OTHER');

-- CreateEnum
CREATE TYPE "ModuleCategory" AS ENUM ('TECH_EDU', 'STARTUP_EDU', 'CAPSTONE', 'MENTORING', 'NETWORKING', 'EVENT', 'ACTION_WEEK', 'SPECIAL_LECTURE');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('LECTURE', 'WORKSHOP', 'PRACTICE', 'MENTORING', 'MIXED', 'ACTION_WEEK', 'ONLINE');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('INTRO', 'MID', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PROPOSAL', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'LOST');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('B2G', 'B2B');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('MAIN_COACH', 'SUB_COACH', 'LECTURER', 'SUB_LECTURER', 'SPECIAL_LECTURER', 'JUDGE', 'PM_OPS');

-- CreateEnum
CREATE TYPE "BudgetItemType" AS ENUM ('PC', 'AC');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "gender" TEXT,
    "location" TEXT,
    "regions" TEXT[],
    "organization" TEXT,
    "position" TEXT,
    "industries" TEXT[],
    "expertise" TEXT[],
    "roles" TEXT[],
    "overseas" BOOLEAN NOT NULL DEFAULT false,
    "overseasDetail" TEXT,
    "toolsSkills" TEXT,
    "intro" TEXT,
    "careerHistory" TEXT,
    "education" TEXT,
    "underdogsHistory" TEXT,
    "currentWork" TEXT,
    "careerYears" INTEGER,
    "careerYearsRaw" TEXT,
    "photoUrl" TEXT,
    "businessType" TEXT,
    "country" TEXT NOT NULL DEFAULT '한국',
    "language" TEXT[] DEFAULT ARRAY['한국어']::TEXT[],
    "hasStartup" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mainField" TEXT,
    "category" "CoachCategory" NOT NULL DEFAULT 'COACH',
    "tier" "CoachTier" NOT NULL DEFAULT 'TIER2',
    "lectureRateMain" INTEGER,
    "lectureRateSub" INTEGER,
    "coachRateMain" INTEGER,
    "coachRateSub" INTEGER,
    "specialLectureRate" INTEGER,
    "dailyRateCoach" INTEGER,
    "dailyRateLecture" INTEGER,
    "taxType" "TaxType" NOT NULL DEFAULT 'BUSINESS',
    "needTransport" BOOLEAN NOT NULL DEFAULT false,
    "transportEstimate" INTEGER,
    "needAccomm" BOOLEAN NOT NULL DEFAULT false,
    "accommEstimate" INTEGER,
    "satisfactionAvg" DOUBLE PRECISION,
    "collaborationCount" INTEGER NOT NULL DEFAULT 0,
    "impactMethodLevel" TEXT,
    "lectureStyle" TEXT,
    "hasInvestExp" BOOLEAN NOT NULL DEFAULT false,
    "availableDays" TEXT[],
    "blockedPeriods" JSONB,
    "onlineAvailable" BOOLEAN NOT NULL DEFAULT true,
    "minLeadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ModuleCategory" NOT NULL,
    "keywordTags" TEXT[],
    "method" "DeliveryMethod" NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "minParticipants" INTEGER NOT NULL DEFAULT 5,
    "maxParticipants" INTEGER NOT NULL DEFAULT 50,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INTRO',
    "objectives" TEXT[],
    "contents" TEXT[],
    "practices" TEXT[],
    "equipment" TEXT[],
    "outputs" TEXT[],
    "targetStages" TEXT[],
    "targetPresets" TEXT[],
    "impactQ54Mapping" TEXT[],
    "skills5D" TEXT[],
    "acttTargets" TEXT[],
    "aiRatio" INTEGER NOT NULL DEFAULT 0,
    "expertRatio" INTEGER NOT NULL DEFAULT 100,
    "prerequisites" TEXT[],
    "outcomeTypes" TEXT[],
    "conversionRates" JSONB,
    "conversionBasis" TEXT,
    "isTheory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL DEFAULT 'B2G',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBudgetVat" INTEGER,
    "supplyPrice" INTEGER,
    "projectStartDate" TIMESTAMP(3),
    "projectEndDate" TIMESTAMP(3),
    "eduStartDate" TIMESTAMP(3),
    "eduEndDate" TIMESTAMP(3),
    "rfpRaw" TEXT,
    "rfpParsed" JSONB,
    "impactGoal" TEXT,
    "logicModel" JSONB,
    "evalCriteria" JSONB,
    "constraints" JSONB,
    "kpiTargets" JSONB,
    "kpiActuals" JSONB,
    "sroiCountry" TEXT NOT NULL DEFAULT '한국',
    "sroiForecast" JSONB,
    "sroiActual" JSONB,
    "pmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleId" TEXT,
    "sessionNo" INTEGER NOT NULL,
    "track" TEXT,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "venue" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isTheory" BOOLEAN NOT NULL DEFAULT false,
    "isActionWeek" BOOLEAN NOT NULL DEFAULT false,
    "assignedCoachId" TEXT,
    "coachRole" TEXT,
    "order" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 1,
    "hoursPerSession" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "totalHours" DOUBLE PRECISION,
    "agreedRate" INTEGER,
    "totalFee" INTEGER,
    "taxRate" DOUBLE PRECISION,
    "netFee" INTEGER,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pcTotal" INTEGER NOT NULL DEFAULT 0,
    "acTotal" INTEGER NOT NULL DEFAULT 0,
    "margin" INTEGER NOT NULL DEFAULT 0,
    "marginRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "wbsCode" TEXT NOT NULL,
    "type" "BudgetItemType" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "receipt" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "dDay" INTEGER,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "track" TEXT,
    "team" TEXT,
    "stage" TEXT,
    "attendances" JSONB,
    "attendanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "graduated" BOOLEAN NOT NULL DEFAULT false,
    "absenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostStandard" (
    "id" TEXT NOT NULL,
    "wbsCode" TEXT NOT NULL,
    "type" "BudgetItemType" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SroiProxy" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "impactType" TEXT NOT NULL,
    "subType" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "proxyKrw" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "contributionRate" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SroiProxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lectureRatio" INTEGER NOT NULL,
    "workshopRatio" INTEGER NOT NULL,
    "mentoringRatio" INTEGER NOT NULL,
    "practiceRatio" INTEGER NOT NULL,
    "networkingRatio" INTEGER NOT NULL,
    "curriculumBias" JSONB NOT NULL,
    "tone" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "TargetPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionLog" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Coach_githubId_key" ON "Coach"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Module_moduleCode_key" ON "Module"("moduleCode");

-- CreateIndex
CREATE INDEX "CurriculumItem_projectId_sessionNo_idx" ON "CurriculumItem"("projectId", "sessionNo");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAssignment_projectId_coachId_role_key" ON "CoachAssignment"("projectId", "coachId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_projectId_key" ON "Budget"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalSection_projectId_sectionNo_version_key" ON "ProposalSection"("projectId", "sectionNo", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CostStandard_wbsCode_key" ON "CostStandard"("wbsCode");

-- CreateIndex
CREATE UNIQUE INDEX "SroiProxy_country_impactType_subType_key" ON "SroiProxy"("country", "impactType", "subType");

-- CreateIndex
CREATE UNIQUE INDEX "TargetPreset_name_key" ON "TargetPreset"("name");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSection" ADD CONSTRAINT "ProposalSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionLog" ADD CONSTRAINT "SatisfactionLog_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
