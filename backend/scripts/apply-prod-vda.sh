#!/usr/bin/env bash
# Applies the additive VehicleDriverAssignment table to the PRODUCTION database.
# Pulls DATABASE_URL from Vercel (prod) so no secret is typed by hand.
# Idempotent and non-destructive: only CREATE TABLE/INDEX/FK IF NOT EXISTS.
set -euo pipefail

cd /Users/mac/Documents/Darb/backend
NPX=/opt/homebrew/opt/node@20/bin/npx

TMP="$(mktemp -t vda_prod_env)"
trap 'rm -f "$TMP"' EXIT

echo "==> Pulling production env from Vercel..."
"$NPX" vercel env pull "$TMP" --environment=production --yes

# shellcheck disable=SC1090
set -a; . "$TMP"; set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not found in pulled prod env." >&2
  exit 1
fi

echo "==> Applying VehicleDriverAssignment to prod DB..."
"$NPX" prisma db execute --file prisma/sql/vehicle_driver_assignment.sql --url "$DATABASE_URL"

echo "==> Verifying table exists in prod..."
printf 'SELECT 1 FROM "VehicleDriverAssignment" LIMIT 1;\n' > "$TMP.check.sql"
"$NPX" prisma db execute --file "$TMP.check.sql" --url "$DATABASE_URL" && rm -f "$TMP.check.sql"

echo "DONE: VehicleDriverAssignment is present in production."
