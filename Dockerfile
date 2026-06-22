# syntax=docker/dockerfile:1.7

# ---------- builder ----------
# Compiles native deps (better-sqlite3), generates the Prisma client, and
# runs `next build`. Everything heavy lives in this stage.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# ---------- runner ----------
# Slim image with just what's needed at runtime. Native binaries built in the
# builder stage work here because both stages use the same Debian base.
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl ca-certificates tini curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp: extracts ad-free, audio-only YouTube streams for in-app full-song
# previews (see src/lib/youtubeAudio.ts). Self-contained binary — no Python at
# runtime. Pinned to the build arch. Update by rebuilding the image.
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) asset=yt-dlp_linux ;; \
        arm64) asset=yt-dlp_linux_aarch64 ;; \
        *) echo "unsupported arch for yt-dlp" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}" \
        -o /usr/local/bin/yt-dlp; \
    chmod +x /usr/local/bin/yt-dlp; \
    /usr/local/bin/yt-dlp --version

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["npm", "start"]
