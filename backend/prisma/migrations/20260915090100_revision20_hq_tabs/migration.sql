-- Revision 20 — the HQ portal's four tabs (client note, 2026-09-15).

-- ── Driver: the training flag and the compliance freeze trail ──────────────
ALTER TABLE "Driver" ADD COLUMN "inTraining" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Driver" ADD COLUMN "complianceFrozenAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "complianceFreezeReason" TEXT;

-- ── Vendor: the compliance freeze, and one wallet or one per branch ────────
ALTER TABLE "Vendor" ADD COLUMN "complianceFrozenAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "complianceFreezeReason" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "walletMode" TEXT NOT NULL DEFAULT 'SINGLE';

-- ── FleetPartner: the compliance freeze ────────────────────────────────────
ALTER TABLE "FleetPartner" ADD COLUMN "complianceFrozenAt" TIMESTAMP(3);
ALTER TABLE "FleetPartner" ADD COLUMN "complianceFreezeReason" TEXT;

-- ── FleetDocument: merchant paper, the automatic first pass, and the ask ───
-- fleetPartnerId becomes nullable so a merchant's own documents live here too.
-- Relaxing NOT NULL is safe on a populated table; every existing row keeps its
-- partner id and no row has a vendorId.
ALTER TABLE "FleetDocument" ALTER COLUMN "fleetPartnerId" DROP NOT NULL;
ALTER TABLE "FleetDocument" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "FleetDocument" ADD COLUMN "autoCheck" TEXT;
ALTER TABLE "FleetDocument" ADD COLUMN "autoCheckNotes" JSONB;
ALTER TABLE "FleetDocument" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "FleetDocument" ADD COLUMN "requestNote" TEXT;

ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FleetDocument" ADD CONSTRAINT "FleetDocument_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FleetDocument_tenantId_vendorId_status_idx" ON "FleetDocument"("tenantId", "vendorId", "status");

-- ── DeliveryOrder: the practice order ──────────────────────────────────────
ALTER TABLE "DeliveryOrder" ADD COLUMN "isTraining" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryOrder" ADD COLUMN "trainingSessionId" TEXT;

-- ── DriverTrainingSession ──────────────────────────────────────────────────
CREATE TABLE "DriverTrainingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverTrainingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "periodDays" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "coachId" TEXT,
    "reason" TEXT,
    "outcomeNote" TEXT,
    "scorecard" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DriverTrainingSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DriverTrainingSession_tenantId_status_startsAt_idx" ON "DriverTrainingSession"("tenantId", "status", "startsAt");
CREATE INDEX "DriverTrainingSession_tenantId_driverId_createdAt_idx" ON "DriverTrainingSession"("tenantId", "driverId", "createdAt");
ALTER TABLE "DriverTrainingSession" ADD CONSTRAINT "DriverTrainingSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverTrainingSession" ADD CONSTRAINT "DriverTrainingSession_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverTrainingSession" ADD CONSTRAINT "DriverTrainingSession_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_trainingSessionId_fkey"
  FOREIGN KEY ("trainingSessionId") REFERENCES "DriverTrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DeliveryOrder_tenantId_trainingSessionId_idx" ON "DeliveryOrder"("tenantId", "trainingSessionId");

-- ── OnboardingRequest ──────────────────────────────────────────────────────
CREATE TABLE "OnboardingRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "OnboardingRequestType" NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyNameAr" TEXT,
    "code" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "details" JSONB,
    "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "vendorId" TEXT,
    "fleetPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnboardingRequest_tenantId_status_createdAt_idx" ON "OnboardingRequest"("tenantId", "status", "createdAt");
CREATE INDEX "OnboardingRequest_tenantId_type_status_idx" ON "OnboardingRequest"("tenantId", "type", "status");
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ShiftPlan + ShiftPlanEntry ─────────────────────────────────────────────
CREATE TABLE "ShiftPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" "ShiftPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "basis" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftPlan_tenantId_weekStart_key" ON "ShiftPlan"("tenantId", "weekStart");
CREATE INDEX "ShiftPlan_tenantId_status_weekStart_idx" ON "ShiftPlan"("tenantId", "status", "weekStart");
ALTER TABLE "ShiftPlan" ADD CONSTRAINT "ShiftPlan_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftPlan" ADD CONSTRAINT "ShiftPlan_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ShiftPlanEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "proposedDrivers" INTEGER NOT NULL,
    "approvedDrivers" INTEGER NOT NULL,
    "suggestedDriverIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demandOrders" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShiftPlanEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftPlanEntry_planId_zoneId_dayOfWeek_startTime_key" ON "ShiftPlanEntry"("planId", "zoneId", "dayOfWeek", "startTime");
CREATE INDEX "ShiftPlanEntry_tenantId_planId_idx" ON "ShiftPlanEntry"("tenantId", "planId");
ALTER TABLE "ShiftPlanEntry" ADD CONSTRAINT "ShiftPlanEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftPlanEntry" ADD CONSTRAINT "ShiftPlanEntry_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "ShiftPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── VendorBranchAllocation ─────────────────────────────────────────────────
CREATE TABLE "VendorBranchAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amountKwd" DECIMAL(10,3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorBranchAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorBranchAllocation_tenantId_vendorId_createdAt_idx" ON "VendorBranchAllocation"("tenantId", "vendorId", "createdAt");
CREATE INDEX "VendorBranchAllocation_tenantId_branchId_createdAt_idx" ON "VendorBranchAllocation"("tenantId", "branchId", "createdAt");
ALTER TABLE "VendorBranchAllocation" ADD CONSTRAINT "VendorBranchAllocation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBranchAllocation" ADD CONSTRAINT "VendorBranchAllocation_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBranchAllocation" ADD CONSTRAINT "VendorBranchAllocation_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "VendorBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBranchAllocation" ADD CONSTRAINT "VendorBranchAllocation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
