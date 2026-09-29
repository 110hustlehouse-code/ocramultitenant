-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('ATTIVO', 'RISOLTO', 'ANNULLATO');

-- CreateEnum
CREATE TYPE "ClientMessageKind" AS ENUM ('PRIMO', 'PROMEMORIA');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'SOLLECITI';

-- CreateTable
CREATE TABLE "ClientFollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partyId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "waitingFor" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'ATTIVO',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "everyWorkdays" INTEGER NOT NULL DEFAULT 3,
    "maxReminders" INTEGER NOT NULL DEFAULT 2,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "nextReminderAt" TIMESTAMP(3),
    "managerNotifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "kind" "ClientMessageKind" NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'EMAIL',
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageId" TEXT,
    "sentById" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientFollowUp_tenantId_status_nextReminderAt_idx" ON "ClientFollowUp"("tenantId", "status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "ClientFollowUp_projectId_status_idx" ON "ClientFollowUp"("projectId", "status");

-- CreateIndex
CREATE INDEX "ClientFollowUp_taskId_idx" ON "ClientFollowUp"("taskId");

-- CreateIndex
CREATE INDEX "ClientMessage_followUpId_idx" ON "ClientMessage"("followUpId");

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFollowUp" ADD CONSTRAINT "ClientFollowUp_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMessage" ADD CONSTRAINT "ClientMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMessage" ADD CONSTRAINT "ClientMessage_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "ClientFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMessage" ADD CONSTRAINT "ClientMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

