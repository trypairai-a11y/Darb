-- Add ACCIDENT_REPORT category for driver-uploaded accident tickets.
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ACCIDENT_REPORT';
