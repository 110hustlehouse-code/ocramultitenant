-- CreateEnum
CREATE TYPE "MeetingSource" AS ENUM ('REGISTRAZIONE', 'AUDIO', 'TESTO', 'WEBHOOK');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "integrationId" TEXT,
ADD COLUMN     "source" "MeetingSource";

-- CreateTable
CREATE TABLE "MeetingIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingIntegration_tokenHash_key" ON "MeetingIntegration"("tokenHash");

-- CreateIndex
CREATE INDEX "MeetingIntegration_tenantId_companyId_idx" ON "MeetingIntegration"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_integrationId_externalId_key" ON "Meeting"("integrationId", "externalId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "MeetingIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingIntegration" ADD CONSTRAINT "MeetingIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingIntegration" ADD CONSTRAINT "MeetingIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingIntegration" ADD CONSTRAINT "MeetingIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingIntegration" ADD CONSTRAINT "MeetingIntegration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: le riunioni già elaborate prendono la fonte dai dati che hanno.
-- «registrazione.*» è il nome che dà il tasto «ascolto»; gli altri audio sono caricati.
UPDATE "Meeting" SET "source" = CASE
    WHEN "audioKey" ~ '/[0-9]+-registrazione\.[a-z0-9]+$' THEN 'REGISTRAZIONE'::"MeetingSource"
    WHEN "audioKey" IS NOT NULL THEN 'AUDIO'::"MeetingSource"
    ELSE 'TESTO'::"MeetingSource"
  END
WHERE "status" <> 'BOZZA' OR "audioKey" IS NOT NULL OR "transcript" IS NOT NULL;
