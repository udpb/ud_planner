-- Phase G (ADR-009): UD Asset Registry
-- Project.acceptedAssetIds JSON 배열 추가 — matchAssetsToRfp 결과 중 PM 이 승인한 자산 ID 목록.
-- 자산 정의 자체는 코드 시드(src/lib/asset-registry.ts) — DB 테이블 없음.

ALTER TABLE "Project"
  ADD COLUMN "acceptedAssetIds" JSONB;

-- 기본값 없음. NULL 허용. 빈 배열([]) 또는 string[] 형태.
-- 예: ["asset-impact-6stages", "asset-alumni-hub", "asset-sroi-proxy-db"]
