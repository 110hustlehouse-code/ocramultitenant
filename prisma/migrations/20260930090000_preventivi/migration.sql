-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "nextQuoteNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quoteFooter" TEXT,
ADD COLUMN     "quoteTerms" TEXT,
ADD COLUMN     "quoteValidityDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "shortCode" TEXT;

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "poCode" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'forfait',
    "unitPrice" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BOZZA',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "intro" TEXT,
    "terms" TEXT,
    "vatRate" INTEGER NOT NULL DEFAULT 22,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "vat" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "brief" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "contractSignedAt" TIMESTAMP(3),
    "depositReceivedAt" TIMESTAMP(3),
    "projectId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "plannedCost" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudgetLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quoteLineId" TEXT,
    "serviceItemId" TEXT,
    "description" TEXT NOT NULL,
    "revenue" INTEGER NOT NULL,
    "plannedCost" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceItem_tenantId_companyId_active_idx" ON "ServiceItem"("tenantId", "companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_projectId_key" ON "Quote"("projectId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_companyId_status_idx" ON "Quote"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_companyId_number_key" ON "Quote"("companyId", "number");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBudgetLine_quoteLineId_key" ON "ProjectBudgetLine"("quoteLineId");

-- CreateIndex
CREATE INDEX "ProjectBudgetLine_projectId_idx" ON "ProjectBudgetLine"("projectId");

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

