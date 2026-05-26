-- Brain models migration — W8 자산 분류 + W14-W17 Ontology + W6 ProposalBudgetItem

-- ──────────────────────────────────────────────────────────
-- 1. ContentAsset 확장 (W8 — assetType + parentId 계층)
-- ──────────────────────────────────────────────────────────

ALTER TABLE "ContentAsset"
  ADD COLUMN IF NOT EXISTS "assetType" TEXT NOT NULL DEFAULT 'proposal',
  ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- FK self-relation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentAsset_parentId_fkey'
  ) THEN
    ALTER TABLE "ContentAsset"
      ADD CONSTRAINT "ContentAsset_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "ContentAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ContentAsset_parentId_idx" ON "ContentAsset"("parentId");
CREATE INDEX IF NOT EXISTS "ContentAsset_status_idx" ON "ContentAsset"("status");

-- ──────────────────────────────────────────────────────────
-- 2. ProposalBudgetItem (W6 — 산출내역서 학습 자산)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProposalBudgetItem" (
  "id"            TEXT NOT NULL,
  "sourceProject" TEXT NOT NULL,
  "sourceRef"     TEXT,
  "driveFileId"   TEXT,
  "channelType"   TEXT,
  "category"      TEXT NOT NULL,
  "itemName"      TEXT NOT NULL,
  "description"   TEXT,
  "unit"          TEXT,
  "quantity"      DOUBLE PRECISION,
  "unitPrice"     DOUBLE PRECISION,
  "amount"        DOUBLE PRECISION NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProposalBudgetItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalBudgetItem_sourceProject_idx" ON "ProposalBudgetItem"("sourceProject");
CREATE INDEX IF NOT EXISTS "ProposalBudgetItem_category_idx"      ON "ProposalBudgetItem"("category");
CREATE INDEX IF NOT EXISTS "ProposalBudgetItem_channelType_category_idx" ON "ProposalBudgetItem"("channelType", "category");

-- ──────────────────────────────────────────────────────────
-- 3. Concept (W14 — Ontology 핵심 entity)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Concept" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "description"    TEXT,
  "aliases"        TEXT[],
  "embedding"      DOUBLE PRECISION[],
  "embeddingModel" TEXT,
  "embeddedAt"     TIMESTAMP(3),
  "parentId"       TEXT,
  "assetCount"     INTEGER NOT NULL DEFAULT 0,
  "patternCount"   INTEGER NOT NULL DEFAULT 0,
  "usageCount"     INTEGER NOT NULL DEFAULT 0,
  "winRate"        DOUBLE PRECISION,
  "lastUsedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Concept_name_key" ON "Concept"("name");
CREATE INDEX IF NOT EXISTS "Concept_type_idx" ON "Concept"("type");
CREATE INDEX IF NOT EXISTS "Concept_name_idx" ON "Concept"("name");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Concept_parentId_fkey') THEN
    ALTER TABLE "Concept"
      ADD CONSTRAINT "Concept_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Concept"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 4. AssetConcept (W14 — m2m ContentAsset × Concept)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AssetConcept" (
  "assetId"   TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "weight"    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "isCore"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetConcept_pkey" PRIMARY KEY ("assetId", "conceptId")
);

CREATE INDEX IF NOT EXISTS "AssetConcept_conceptId_idx" ON "AssetConcept"("conceptId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetConcept_assetId_fkey') THEN
    ALTER TABLE "AssetConcept"
      ADD CONSTRAINT "AssetConcept_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "ContentAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetConcept_conceptId_fkey') THEN
    ALTER TABLE "AssetConcept"
      ADD CONSTRAINT "AssetConcept_conceptId_fkey"
      FOREIGN KEY ("conceptId") REFERENCES "Concept"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 5. PatternConcept (W16 — m2m WinningPattern × Concept)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PatternConcept" (
  "patternId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "weight"    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "isCore"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternConcept_pkey" PRIMARY KEY ("patternId", "conceptId")
);

CREATE INDEX IF NOT EXISTS "PatternConcept_conceptId_idx" ON "PatternConcept"("conceptId");
CREATE INDEX IF NOT EXISTS "PatternConcept_patternId_idx" ON "PatternConcept"("patternId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatternConcept_conceptId_fkey') THEN
    ALTER TABLE "PatternConcept"
      ADD CONSTRAINT "PatternConcept_conceptId_fkey"
      FOREIGN KEY ("conceptId") REFERENCES "Concept"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 6. ConceptRelation (W17 — RDF triple graph)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ConceptRelation" (
  "id"           TEXT NOT NULL,
  "fromId"       TEXT NOT NULL,
  "toId"         TEXT NOT NULL,
  "type"         TEXT NOT NULL DEFAULT 'co-occurs',
  "strength"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "coOccurCount" INTEGER NOT NULL DEFAULT 0,
  "reason"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConceptRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConceptRelation_fromId_toId_type_key"
  ON "ConceptRelation"("fromId", "toId", "type");
CREATE INDEX IF NOT EXISTS "ConceptRelation_fromId_idx"   ON "ConceptRelation"("fromId");
CREATE INDEX IF NOT EXISTS "ConceptRelation_toId_idx"     ON "ConceptRelation"("toId");
CREATE INDEX IF NOT EXISTS "ConceptRelation_strength_idx" ON "ConceptRelation"("strength");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConceptRelation_fromId_fkey') THEN
    ALTER TABLE "ConceptRelation"
      ADD CONSTRAINT "ConceptRelation_fromId_fkey"
      FOREIGN KEY ("fromId") REFERENCES "Concept"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConceptRelation_toId_fkey') THEN
    ALTER TABLE "ConceptRelation"
      ADD CONSTRAINT "ConceptRelation_toId_fkey"
      FOREIGN KEY ("toId") REFERENCES "Concept"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
