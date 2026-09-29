-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ATTIVO', 'IN_PAUSA', 'CHIUSO', 'ANNULLATO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DA_FARE', 'FATTO');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('NORMALE', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUALE', 'VERBALE');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "service" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ATTIVO',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "managerId" TEXT,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMALE',
    "status" "TaskStatus" NOT NULL DEFAULT 'DA_FARE',
    "source" "TaskSource" NOT NULL DEFAULT 'MANUALE',
    "proof" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_tenantId_companyId_status_idx" ON "Project"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_code_key" ON "Project"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ProjectMember_tenantId_idx" ON "ProjectMember"("tenantId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "Task_tenantId_projectId_idx" ON "Task"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Task_tenantId_assigneeId_status_idx" ON "Task"("tenantId", "assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Coerenza fra tenant: ogni riferimento deve stare nel tenant della riga.
CREATE OR REPLACE FUNCTION "project_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company" WHERE "id" = NEW."companyId" AND "tenantId" = NEW."tenantId")
     OR (NEW."clientId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Party" WHERE "id" = NEW."clientId" AND "tenantId" = NEW."tenantId"))
     OR (NEW."managerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."managerId" AND "tenantId" = NEW."tenantId")) THEN
    RAISE EXCEPTION 'Progetto con riferimenti a tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_same_tenant"
BEFORE INSERT OR UPDATE ON "Project"
FOR EACH ROW EXECUTE FUNCTION "project_same_tenant"();

CREATE OR REPLACE FUNCTION "project_member_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = NEW."projectId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Membro di progetto fra tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_member_same_tenant"
BEFORE INSERT OR UPDATE ON "ProjectMember"
FOR EACH ROW EXECUTE FUNCTION "project_member_same_tenant"();

CREATE OR REPLACE FUNCTION "task_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = NEW."projectId" AND "tenantId" = NEW."tenantId")
     OR (NEW."assigneeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."assigneeId" AND "tenantId" = NEW."tenantId"))
     OR (NEW."completedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."completedById" AND "tenantId" = NEW."tenantId")) THEN
    RAISE EXCEPTION 'Task con riferimenti a tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "task_same_tenant"
BEFORE INSERT OR UPDATE ON "Task"
FOR EACH ROW EXECUTE FUNCTION "task_same_tenant"();
