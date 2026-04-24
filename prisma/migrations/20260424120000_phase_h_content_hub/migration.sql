-- Phase H (ADR-010): Content Hub v2 — Asset Registry DB 이관
-- ContentAsset 테이블 신설. Phase G 의 UD_ASSETS 코드 시드는 이후 prisma/seed-content-assets.ts 로 주입.

CREATE TABLE "ContentAsset" (
  "id"                 TEXT          NOT NULL,
  "name"               TEXT          NOT NULL,
  "category"           TEXT          NOT NULL,

  -- 계층 (1단)
  "parentId"           TEXT,

  -- 3중 태그 (Phase G UdAsset 동일)
  "applicableSections" JSONB         NOT NULL,
  "valueChainStage"    TEXT          NOT NULL,
  "evidenceType"       TEXT          NOT NULL,

  -- 매칭 보조
  "keywords"           JSONB,
  "programProfileFit"  JSONB,

  -- 제안서 반영
  "narrativeSnippet"   TEXT          NOT NULL,
  "keyNumbers"         JSONB,

  -- 상태 + 버전
  "status"             TEXT          NOT NULL DEFAULT 'stable',
  "version"            INTEGER       NOT NULL DEFAULT 1,
  "sourceReferences"   JSONB,
  "lastReviewedAt"     TIMESTAMP(3)  NOT NULL,

  -- 감사
  "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)  NOT NULL,
  "createdById"        TEXT,
  "updatedById"        TEXT,

  CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentAsset_category_idx"         ON "ContentAsset"("category");
CREATE INDEX "ContentAsset_valueChainStage_idx"  ON "ContentAsset"("valueChainStage");
CREATE INDEX "ContentAsset_parentId_idx"         ON "ContentAsset"("parentId");
CREATE INDEX "ContentAsset_status_idx"           ON "ContentAsset"("status");

-- 자기 참조 FK (children ↔ parent)
ALTER TABLE "ContentAsset"
  ADD CONSTRAINT "ContentAsset_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ContentAsset"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
