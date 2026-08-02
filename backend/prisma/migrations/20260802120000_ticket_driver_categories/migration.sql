-- The driver app's ticket kinds (2026-08-02).
--
-- The agent route validated SHIFT_REQUEST, ORDER_ISSUE and DRIVER_ISSUE as
-- strings against its own allow-list, but Ticket.category is this enum, so the
-- create failed after validation had already passed. A driver pressing Send
-- request on the Shifts screen, or filing a support ticket under Order or
-- Driver, got an error and nothing was recorded.
--
-- Enum values only, so no table in this migration can use them yet: Postgres
-- cannot use a new value in the transaction that adds it.

ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SHIFT_REQUEST';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ORDER_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'DRIVER_ISSUE';
