-- CreateEnum
CREATE TYPE "FleetDocumentStatus" AS ENUM ('PENDING_REVIEW', 'VALID', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FleetChangeRequestType" AS ENUM ('DRIVER_ONBOARD', 'DRIVER_STATUS', 'DRIVER_PROFILE', 'DRIVER_DOCUMENT', 'COMPANY_DOCUMENT');

-- CreateEnum
CREATE TYPE "FleetChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FleetIssueType" AS ENUM ('LATE_LOGIN', 'NO_ORDERS', 'RATING_DROP', 'DOC_EXPIRING', 'ACCEPTANCE_LOW');

-- CreateEnum
CREATE TYPE "FleetIssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "FleetIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- NOTE: `prisma migrate diff` proposed dropping ChatMessage.contentTsv and its
-- index here. Both were deleted by hand, as every diff against this database
-- requires. That column is a Postgres tsvector maintained outside Prisma, so
-- the datamodel cannot describe it and the diff reads it as drift. Dropping it
-- takes chat search with it. See CLAUDE.md > Migrations.

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "fleetPartnerId" TEXT,
ALTER COLUMN "vendorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FleetDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "driverId" TEXT,
    "type" TEXT NOT NULL,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "expiryDate" TIMESTAMP(3),
    "status" "FleetDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "uploadedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "type" "FleetChangeRequestType" NOT NULL,
    "driverId" TEXT,
    "payload" JSONB NOT NULL,
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "FleetChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fleetPartnerId" TEXT NOT NULL,
    "driverId" TEXT,
    "type" "FleetIssueType" NOT NULL,
    "severity" "FleetIssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "data" JSONB,
    "status" "FleetIssueStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleetDocument_tenantId_fleetPartnerId_status_idx" ON "FleetDocument"("tenantId", "fleetPartnerId", "status");

-- CreateIndex
CREATE INDEX "FleetDocument_tenantId_driverId_type_idx" ON "FleetDocument"("tenantId", "driverId", "type");

-- CreateIndex
CREATE INDEX "FleetDocument_tenantId_status_expiryDate_idx" ON "FleetDocument"("tenantId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "FleetChangeRequest_tenantId_fleetPartnerId_status_idx" ON "FleetChangeRequest"("tenantId", "fleetPartnerId", "status");

-- CreateIndex
CREATE INDEX "FleetChangeRequest_tenantId_status_createdAt_idx" ON "FleetChangeRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FleetIssue_tenantId_fleetPartnerId_status_idx" ON "FleetIssue"("tenantId", "fleetPartnerId", "status");

-- CreateIndex
CREATE INDEX "FleetIssue_tenantId_status_openedAt_idx" ON "FleetIssue"("tenantId", "status", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FleetIssue_tenantId_dedupeKey_key" ON "FleetIssue"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_fleetPartnerId_status_idx" ON "SupportTicket"("tenantId", "fleetPartnerId", "status");

-- AddForeignKey
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetChangeRequest" ADD CONSTRAINT "FleetChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetChangeRequest" ADD CONSTRAINT "FleetChangeRequest_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetChangeRequest" ADD CONSTRAINT "FleetChangeRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetChangeRequest" ADD CONSTRAINT "FleetChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetChangeRequest" ADD CONSTRAINT "FleetChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetIssue" ADD CONSTRAINT "FleetIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetIssue" ADD CONSTRAINT "FleetIssue_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetIssue" ADD CONSTRAINT "FleetIssue_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetIssue" ADD CONSTRAINT "FleetIssue_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetIssue" ADD CONSTRAINT "FleetIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_fleetPartnerId_fkey" FOREIGN KEY ("fleetPartnerId") REFERENCES "FleetPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

