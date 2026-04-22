-- Phase E (ADR-006): ProgramProfile v1.0 schema additions
-- Source of truth: src/lib/program-profile.ts (TypeScript types)
-- Manual migration (DB unavailable during generation — apply via `prisma migrate deploy` when DB is connected)

-- 1. Project: add programProfile + renewalContext
ALTER TABLE "Project" ADD COLUMN "programProfile" JSONB;
ALTER TABLE "Project" ADD COLUMN "renewalContext" JSONB;

-- 2. WinningPattern: add sourceProfile + profileVector
ALTER TABLE "WinningPattern" ADD COLUMN "sourceProfile" JSONB;
ALTER TABLE "WinningPattern" ADD COLUMN "profileVector" JSONB;

-- 3. ProfileTag: new table for auto-complete + reuse tracking
CREATE TABLE "ProfileTag" (
    "id" TEXT NOT NULL,
    "axis" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileTag_axis_value_key" ON "ProfileTag"("axis", "value");
CREATE INDEX "ProfileTag_axis_idx" ON "ProfileTag"("axis");
