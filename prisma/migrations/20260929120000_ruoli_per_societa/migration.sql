-- Ruoli per società: il ruolo passa dall'utente alla coppia (utente, società).
-- Decisione del 23 settembre 2026: un PM per società; Erika CEOO di Fulcro e St'Art.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "legalRepresentative" TEXT,
ADD COLUMN     "pec" TEXT,
ADD COLUMN     "poPrefix" TEXT,
ADD COLUMN     "reaNumber" TEXT,
ADD COLUMN     "sdiCode" TEXT;

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- Dati esistenti: ogni utente mantiene il suo ruolo in tutte le società del proprio tenant.
INSERT INTO "Membership" ("id", "tenantId", "userId", "companyId", "role", "updatedAt")
SELECT 'mb_' || md5(u."id" || ':' || c."id"), u."tenantId", u."id", c."id", u."role", CURRENT_TIMESTAMP
FROM "User" u
JOIN "Company" c ON c."tenantId" = u."tenantId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE INDEX "Membership_companyId_idx" ON "Membership"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_companyId_key" ON "Membership"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un accesso deve collegare utente e società DELLO STESSO tenant (Prisma non lo esprime: vincolo a mano).
CREATE OR REPLACE FUNCTION "membership_same_tenant"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId" AND "tenantId" = NEW."tenantId")
     OR NOT EXISTS (SELECT 1 FROM "Company" WHERE "id" = NEW."companyId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'Membership fra tenant diversi non ammessa';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "membership_same_tenant"
BEFORE INSERT OR UPDATE ON "Membership"
FOR EACH ROW EXECUTE FUNCTION "membership_same_tenant"();
