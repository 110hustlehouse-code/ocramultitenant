-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('BOZZA', 'IN_ELABORAZIONE', 'DA_RIVEDERE', 'CONFERMATO', 'ERRORE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "meetingId" TEXT;

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "audioKey" TEXT,
    "durationSec" INTEGER,
    "transcript" TEXT,
    "minutes" TEXT,
    "proposals" JSONB,
    "status" "MeetingStatus" NOT NULL DEFAULT 'BOZZA',
    "error" TEXT,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_tenantId_companyId_heldAt_idx" ON "Meeting"("tenantId", "companyId", "heldAt");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE INDEX "Task_meetingId_idx" ON "Task"("meetingId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Coerenza fra tenant per le riunioni e per il collegamento task → verbale.
CREATE OR REPLACE FUNCTION "meeting_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company" WHERE "id" = NEW."companyId" AND "tenantId" = NEW."tenantId")
     OR (NEW."projectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = NEW."projectId" AND "tenantId" = NEW."tenantId"))
     OR (NEW."createdById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."createdById" AND "tenantId" = NEW."tenantId")) THEN
    RAISE EXCEPTION 'Riunione con riferimenti a tenant diversi non ammessa';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "meeting_same_tenant"
BEFORE INSERT OR UPDATE ON "Meeting"
FOR EACH ROW EXECUTE FUNCTION "meeting_same_tenant"();

CREATE OR REPLACE FUNCTION "task_meeting_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NEW."meetingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Meeting" WHERE "id" = NEW."meetingId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Task collegato a un verbale di un altro tenant non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "task_meeting_same_tenant"
BEFORE INSERT OR UPDATE ON "Task"
FOR EACH ROW EXECUTE FUNCTION "task_meeting_same_tenant"();
