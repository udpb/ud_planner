-- Phase L Wave L2 (ADR-011): Express Track 1차본 데이터 모델
-- 자세한 설계: docs/architecture/express-mode.md §1.3

ALTER TABLE "Project"
  ADD COLUMN "expressDraft" JSONB,
  ADD COLUMN "expressActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expressTurnsCache" JSONB;
