-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('AUTOMATICO', 'AL_PM', 'SOLLECITO', 'AL_CEO', 'NON_POSSO');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "blockerAt" TIMESTAMP(3),
ADD COLUMN     "blockerNote" TEXT,
ADD COLUMN     "escalation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "level" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'EMAIL',
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "blockedById" TEXT NOT NULL,
    "reason" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_tenantId_createdAt_idx" ON "Reminder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_taskId_idx" ON "Reminder"("taskId");

-- CreateIndex
CREATE INDEX "AccountBlock_tenantId_userId_releasedAt_idx" ON "AccountBlock"("tenantId", "userId", "releasedAt");

-- CreateIndex
CREATE INDEX "AccountBlock_taskId_idx" ON "AccountBlock"("taskId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coerenza fra tenant per richiami e blocchi.
CREATE OR REPLACE FUNCTION "reminder_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Task" WHERE "id" = NEW."taskId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."recipientId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Richiamo con riferimenti a tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reminder_same_tenant"
BEFORE INSERT OR UPDATE ON "Reminder"
FOR EACH ROW EXECUTE FUNCTION "reminder_same_tenant"();

CREATE OR REPLACE FUNCTION "account_block_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Task" WHERE "id" = NEW."taskId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."blockedById" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Blocco con riferimenti a tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "account_block_same_tenant"
BEFORE INSERT OR UPDATE ON "AccountBlock"
FOR EACH ROW EXECUTE FUNCTION "account_block_same_tenant"();
