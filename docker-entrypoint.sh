#!/bin/sh
# Apply any new Prisma migrations against the mounted SQLite database, then
# hand control to whatever the container's CMD is (`npm start` by default).
set -e

echo "[audioseerr] Applying database migrations..."
npx prisma migrate deploy

echo "[audioseerr] Starting Next.js..."
exec "$@"
