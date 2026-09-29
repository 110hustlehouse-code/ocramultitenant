-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('CLIENTE', 'FORNITORE');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'ANAGRAFICHE';

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "PartyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT,
    "taxCode" TEXT,
    "pec" TEXT,
    "sdiCode" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyCompany" (
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "PartyCompany_pkey" PRIMARY KEY ("partyId","companyId")
);

-- CreateIndex
CREATE INDEX "Party_tenantId_kind_idx" ON "Party"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Party_tenantId_kind_vatNumber_key" ON "Party"("tenantId", "kind", "vatNumber");

-- CreateIndex
CREATE INDEX "PartyCompany_tenantId_idx" ON "PartyCompany"("tenantId");

-- CreateIndex
CREATE INDEX "PartyCompany_companyId_idx" ON "PartyCompany"("companyId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyCompany" ADD CONSTRAINT "PartyCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyCompany" ADD CONSTRAINT "PartyCompany_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyCompany" ADD CONSTRAINT "PartyCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Anagrafica e società devono appartenere allo stesso tenant del collegamento.
CREATE OR REPLACE FUNCTION "party_company_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Party" WHERE "id" = NEW."partyId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "Company" WHERE "id" = NEW."companyId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Collegamento anagrafica-società fra tenant diversi non ammesso';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "party_company_same_tenant"
BEFORE INSERT OR UPDATE ON "PartyCompany"
FOR EACH ROW EXECUTE FUNCTION "party_company_same_tenant"();
