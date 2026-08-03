-- Revision 14 (#2): the delivery company proposes its own per-order rate.
--
-- Enum value alone, in its own migration: Postgres cannot use a new enum value
-- in the same transaction that adds it, so the code that writes a RATE_CHANGE
-- row can only ship after this has landed.

ALTER TYPE "FleetChangeRequestType" ADD VALUE IF NOT EXISTS 'RATE_CHANGE';
