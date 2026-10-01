-- Modulo Collaboratori. Party.kind (scalar singolo) diventa Party.kinds (array, min 1 a
-- livello applicativo): una stessa anagrafica può avere più ruoli sulla stessa riga (es.
-- fornitore e collaboratore esterno insieme), invece di una riga duplicata per ruolo.
--
-- PROMEMORIA (non risolto da questa migrazione, verificato il 2026-10-01 sui dati reali):
-- 11 anagrafiche del tenant "masini" esistono già duplicate come righe CLIENTE + FORNITORE
-- separate con lo stesso CF/P.IVA (stessa società inserita due volte, da due fogli diversi).
-- Non vengono fuse qui: è una pulizia dati deliberata, a parte, da fare quando si decide come
-- gestire eventuali differenze nei campi fra le due righe (indirizzo, referente, ecc.).
--   13565941005  ARTI GRAFICHE VINCERO' S.R.L. / ARTI GRAFICHE VINCERO' SRL
--   15206401000  Associazione Roma BPA.. / Roma Best Practices Award..
--   18051641001  DUIT S.R.L. (CLIENTE) / DUIT S.R.L. (FORNITORE)
--   13949361003  RIFF S.r.l.s. / RIFF S.R.L.S.
--   03743761003  TELESIA S.P.A. / TELESIA S P A
--   08054350965  NONSOLOLOFT S.R.L. / NONSOLOLOFT SRL
--   16633211004  FULCRO LUCEM SRL (CLIENTE) / FULCRO LUCEM SRL (FORNITORE)
--   14980291000  THE MOVEMENT S.R.L.S. / The Movement SRLS
--   12648720964  TRIGGGER S.R.L. (CLIENTE) / TRIGGGER S.R.L. (FORNITORE)
--   12304131001  Legamon Graphic Design srl / LEGAMON GRAPHIC DESIGN SRL
--   13535511003  SICUREZZA ETICA S.R.L. (CLIENTE) / SICUREZZA ETICA S.R.L. (FORNITORE)

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('FATTURA', 'NOTULA', 'CESSIONE_DIRITTI_RITENUTA', 'ALTRO');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'COLLABORATORI';

-- AlterEnum
ALTER TYPE "PartyKind" ADD VALUE 'COLLABORATORE_INTERNO';
ALTER TYPE "PartyKind" ADD VALUE 'COLLABORATORE_ESTERNO';

-- DropIndex
DROP INDEX "Party_tenantId_kind_idx";

-- DropIndex
DROP INDEX "Party_tenantId_kind_vatNumber_key";

-- AlterTable: aggiunge le colonne nuove, incluso "kinds", PRIMA di toccare "kind"
ALTER TABLE "Party"
  ADD COLUMN "kinds" "PartyKind"[] NOT NULL DEFAULT '{}',
  ADD COLUMN "availabilityNote" TEXT,
  ADD COLUMN "fiscalDocumentType" "FiscalDocumentType",
  ADD COLUMN "linkedUserId" TEXT,
  ADD COLUMN "paymentHolder" TEXT,
  ADD COLUMN "paymentIban" TEXT,
  ADD COLUMN "paymentTerms" TEXT;

-- Backfill: ogni riga esistente porta il suo kind attuale nel nuovo array (un elemento).
-- Nessuna riga cambia significato; le 598 righe con "kind" non nullo restano valide.
UPDATE "Party" SET "kinds" = ARRAY["kind"]::"PartyKind"[] WHERE "kind" IS NOT NULL;

-- Ora si può togliere la vecchia colonna: i dati sono già in "kinds".
ALTER TABLE "Party" DROP COLUMN "kind";

-- AlterTable
ALTER TABLE "ProjectCost" ADD COLUMN "partyId" TEXT;

-- CreateTable
CREATE TABLE "CollaboratorEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,
    "evaluatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollaboratorEvaluation_tenantId_partyId_idx" ON "CollaboratorEvaluation"("tenantId", "partyId");

-- CreateIndex
CREATE INDEX "CollaboratorEvaluation_companyId_idx" ON "CollaboratorEvaluation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_linkedUserId_key" ON "Party"("linkedUserId");

-- CreateIndex
CREATE INDEX "Party_tenantId_idx" ON "Party"("tenantId");

-- CreateIndex
CREATE INDEX "ProjectCost_partyId_idx" ON "ProjectCost"("partyId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorEvaluation" ADD CONSTRAINT "CollaboratorEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorEvaluation" ADD CONSTRAINT "CollaboratorEvaluation_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorEvaluation" ADD CONSTRAINT "CollaboratorEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorEvaluation" ADD CONSTRAINT "CollaboratorEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorEvaluation" ADD CONSTRAINT "CollaboratorEvaluation_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
