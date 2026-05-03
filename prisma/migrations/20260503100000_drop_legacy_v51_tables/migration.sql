-- ADR-012 (final): PRD v5.1 잔재 3 테이블 제거 (Phase 4-coach-integration, 2026-05-03)
--
-- 운영 결정 — 시드 데이터가 있었지만 모두 ud-ops 의 다른 모델로 대체됨:
--   TargetPreset (8 rows)       → ProgramProfile.targetSegment 11축 enum 으로 흡수
--   InternalLaborRate (16 rows) → Coach 모델 + CostStandard 가 단가 담당
--   ServiceProduct (14 rows)    → 서비스 카탈로그 미구현, Coach 단가로 대체
--
-- 적용 방법:
--   npx prisma migrate deploy
--
-- Rollback:
--   백업 dump 에서 복원. 본 migration 자체는 reversible 아님.
--
-- 참고: docs/decisions/012-prune-unused-models.md (revision 으로 본 migration 추가).

-- DropTable
DROP TABLE "InternalLaborRate";

-- DropTable
DROP TABLE "ServiceProduct";

-- DropTable
DROP TABLE "TargetPreset";
