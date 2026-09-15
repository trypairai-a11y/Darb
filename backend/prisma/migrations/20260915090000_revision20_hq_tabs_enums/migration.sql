-- Revision 20 — the HQ portal's four tabs.
--
-- Enum values ship in their own migration: Postgres cannot use a value in the
-- same transaction that adds it, so the tables that reference these live in
-- the migration that follows this one.

ALTER TYPE "AppSurface" ADD VALUE IF NOT EXISTS 'COMPLIANCE';
ALTER TYPE "FleetDocumentStatus" ADD VALUE IF NOT EXISTS 'REQUESTED' BEFORE 'PENDING_REVIEW';

CREATE TYPE "DriverTrainingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED');
CREATE TYPE "OnboardingRequestType" AS ENUM ('VENDOR', 'FLEET');
CREATE TYPE "OnboardingRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "ShiftPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'DISCARDED');
