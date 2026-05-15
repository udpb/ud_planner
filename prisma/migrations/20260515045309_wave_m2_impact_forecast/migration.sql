-- CreateTable
CREATE TABLE "ImpactForecast" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "totalSocialValue" DECIMAL(65,30) NOT NULL,
    "beneficiaryCount" INTEGER NOT NULL,
    "breakdownJson" JSONB NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "calibration" TEXT NOT NULL DEFAULT 'auto-conservative',
    "calibrationNote" TEXT,
    "basedOnDraftHash" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImpactForecast_projectId_key" ON "ImpactForecast"("projectId");

-- CreateIndex
CREATE INDEX "ImpactForecast_country_idx" ON "ImpactForecast"("country");

-- CreateIndex
CREATE INDEX "ImpactForecast_generatedAt_idx" ON "ImpactForecast"("generatedAt");

-- AddForeignKey
ALTER TABLE "ImpactForecast" ADD CONSTRAINT "ImpactForecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
