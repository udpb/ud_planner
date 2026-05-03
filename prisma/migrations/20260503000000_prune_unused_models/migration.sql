-- ADR-012: 미사용 Prisma 모델 정리 (Phase 2.5, 2026-05-03)
--
-- 제거 대상 8 모델 (시드 데이터 0건 확인):
--   Expense / Task / TaskAssignee / DesignRule / AudienceProfile
--   WeightSuggestion / PMFeedback / ProfileTag
--
-- 보존 (시드 데이터 있음 — TargetPreset 8 / InternalLaborRate 16 / ServiceProduct 14):
--   별도 운영 결정 시 다음 migration 에서 처리.
--
-- 적용 방법:
--   npx prisma migrate deploy  (프로덕션)
--   npx prisma migrate dev      (로컬, schema 와 sync 자동)
--
-- Rollback:
--   백업 dump 에서 복원. 본 migration 자체는 reversible 아님 (DROP TABLE).

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PMFeedback" DROP CONSTRAINT "PMFeedback_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- DropForeignKey
ALTER TABLE "TaskAssignee" DROP CONSTRAINT "TaskAssignee_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskAssignee" DROP CONSTRAINT "TaskAssignee_userId_fkey";

-- DropTable
DROP TABLE "AudienceProfile";

-- DropTable
DROP TABLE "DesignRule";

-- DropTable
DROP TABLE "Expense";

-- DropTable
DROP TABLE "PMFeedback";

-- DropTable
DROP TABLE "ProfileTag";

-- DropTable
DROP TABLE "Task";

-- DropTable
DROP TABLE "TaskAssignee";

-- DropTable
DROP TABLE "WeightSuggestion";

-- DropEnum
DROP TYPE "TaskStatus";
