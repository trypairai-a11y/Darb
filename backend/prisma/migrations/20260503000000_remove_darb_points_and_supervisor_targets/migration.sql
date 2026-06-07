-- Remove Darb Points models and the supervisor bonus-tier configuration
-- column from PlatformSettings. Both surfaces (the /darb-points and
-- /supervisors pages) and their backend routes/services have been deleted.

DROP TABLE IF EXISTS "DarbPointsRecord";
DROP TABLE IF EXISTS "DarbPointsPolicy";

ALTER TABLE "PlatformSettings" DROP COLUMN IF EXISTS "supervisorTargets";
