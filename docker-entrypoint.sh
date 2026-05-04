#!/bin/sh
# Bootstrap script: ensures stable secrets exist (auto-generating on first
# boot if needed), applies any pending Prisma migrations, then starts the app.
set -e

CONFIG_DIR="/config"
SECRETS_FILE="${CONFIG_DIR}/secrets.env"

mkdir -p "$CONFIG_DIR"

# Pull a persisted secret out of $SECRETS_FILE only if the var isn't already
# set via the environment (compose-provided values always win).
load_persisted() {
    name="$1"
    eval "current=\${$name:-}"
    [ -n "$current" ] && return 0
    [ ! -f "$SECRETS_FILE" ] && return 0
    value=$(grep "^${name}=" "$SECRETS_FILE" | head -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//')
    if [ -n "$value" ]; then
        eval "export $name=\"\$value\""
    fi
}

generate_if_missing() {
    name="$1"
    eval "current=\${$name:-}"
    if [ -z "$current" ]; then
        new=$(openssl rand -base64 32)
        eval "export $name=\"\$new\""
        printf "%s='%s'\n" "$name" "$new" >> "$SECRETS_FILE"
        echo "[audioseerr] Generated and persisted $name"
    fi
}

load_persisted AUTH_SECRET
load_persisted AUDIOSEERR_SECRET

generate_if_missing AUTH_SECRET
generate_if_missing AUDIOSEERR_SECRET

# Tighten perms on the secrets file (created above if it didn't exist).
[ -f "$SECRETS_FILE" ] && chmod 600 "$SECRETS_FILE"

echo "[audioseerr] Applying database migrations..."
npx prisma migrate deploy

echo "[audioseerr] Starting Next.js..."
exec "$@"
