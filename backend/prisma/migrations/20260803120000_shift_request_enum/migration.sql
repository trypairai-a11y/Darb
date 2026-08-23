-- CreateEnum
-- Alone in its own migration: Postgres cannot use a new enum value in the same
-- transaction that adds the type.
CREATE TYPE "ShiftRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');
