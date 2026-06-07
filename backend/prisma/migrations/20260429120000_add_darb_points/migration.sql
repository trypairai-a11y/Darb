-- CreateTable
CREATE TABLE "DarbPointsPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weightAttendance" INTEGER NOT NULL DEFAULT 30,
    "weightOrders" INTEGER NOT NULL DEFAULT 30,
    "weightHours" INTEGER NOT NULL DEFAULT 20,
    "weightViolations" INTEGER NOT NULL DEFAULT 20,
    "targetAttendancePct" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "targetOrdersMonthly" INTEGER NOT NULL DEFAULT 400,
    "targetHoursMonthly" INTEGER NOT NULL DEFAULT 180,
    "violationPenaltyPoints" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DarbPointsPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DarbPointsRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "attendanceScore" DOUBLE PRECISION NOT NULL,
    "ordersScore" DOUBLE PRECISION NOT NULL,
    "hoursScore" DOUBLE PRECISION NOT NULL,
    "violationsScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "onTimePct" DOUBLE PRECISION NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "violationsCount" INTEGER NOT NULL,
    "perPlatform" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DarbPointsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DarbPointsPolicy_tenantId_key" ON "DarbPointsPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "DarbPointsRecord_tenantId_periodYear_periodMonth_idx" ON "DarbPointsRecord"("tenantId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "DarbPointsRecord_tenantId_totalScore_idx" ON "DarbPointsRecord"("tenantId", "totalScore");

-- CreateIndex
CREATE UNIQUE INDEX "DarbPointsRecord_driverId_periodYear_periodMonth_key" ON "DarbPointsRecord"("driverId", "periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "DarbPointsPolicy" ADD CONSTRAINT "DarbPointsPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarbPointsRecord" ADD CONSTRAINT "DarbPointsRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarbPointsRecord" ADD CONSTRAINT "DarbPointsRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
