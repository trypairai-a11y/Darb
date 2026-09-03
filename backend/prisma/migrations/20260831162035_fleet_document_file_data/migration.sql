-- Client note 2026-08-31 (edit #5): inline document bytes while R2 is
-- unconfigured, same posture as FleetPayoutInvoice.fileData.
ALTER TABLE "FleetDocument" ADD COLUMN     "fileData" BYTEA;
