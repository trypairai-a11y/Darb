-- Revision 9 (#6): what a support request is about.
--
-- Written by hand rather than from `migrate diff`, which proposes dropping
-- ChatMessage.contentTsv and its GIN index every time (raw SQL from
-- 20260513120000, deliberately unmodelled). The enum and the column are split
-- because Postgres will not use a new enum value in the transaction that
-- creates the type.
CREATE TYPE "SupportTicketType" AS ENUM ('ORDER', 'WALLET', 'TECHNICAL', 'OTHER');
ALTER TABLE "SupportTicket" ADD COLUMN "type" "SupportTicketType" NOT NULL DEFAULT 'OTHER';
