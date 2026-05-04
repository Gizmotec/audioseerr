# Audioseerr

A self-hosted, multi-user "Overseerr for music" — discovery-first browse UI for Lidarr.

Design document: [`docs/plans/2026-05-03-audioseerr-design.md`](docs/plans/2026-05-03-audioseerr-design.md)

**Status:** v1 in development. The scaffold (Next.js 16, TypeScript, Tailwind 4, shadcn/ui, Prisma 7 + SQLite, Auth.js v5, node-cron) is in place; feature milestones from §14 of the design doc are not yet built.

## Local development

Requires Node 20+ (tested on 25).

```bash
npm install
cp .env.example .env       # fill in AUTH_SECRET and AUDIOSEERR_SECRET
npx prisma migrate dev     # create dev SQLite db at ./dev.db
npm run dev                # http://localhost:3000
```

Generate dev secrets with `openssl rand -base64 32`.

## Self-hosting with Docker

Audioseerr ships with a `Dockerfile` and `docker-compose.yml`. The flow below builds the image directly on your server — no GitHub Actions or container registry required.

### One-time setup on the server

Run these on your Ubuntu box. Replace `<your-github-user>` with your GitHub username.

```bash
# 1. Install Docker (skip if already installed)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER         # log out / back in for this to take effect

# 2. Clone the repo somewhere persistent
sudo mkdir -p /opt && sudo chown $USER /opt
cd /opt
git clone https://github.com/<your-github-user>/audioseerr.git
cd audioseerr

# 3. Build and start
docker compose up -d --build
```

The first build takes a few minutes (it compiles `better-sqlite3`). When it's done, Audioseerr is at `http://<server-ip>:3000`. The SQLite database lives in `./config/db.sqlite` on the host — back up that folder and you've backed up the app.

On first boot the container generates `AUTH_SECRET` and `AUDIOSEERR_SECRET` automatically and writes them to `./config/secrets.env`. Subsequent restarts reuse the same values, so logins persist and your encrypted Lidarr API key stays decryptable. To override the auto-generated values (rare — usually only when migrating between hosts), create a `.env` next to `docker-compose.yml` with `AUTH_SECRET=...` / `AUDIOSEERR_SECRET=...` lines.

Optional `.env` knobs:

- `AUTH_URL` — set to your real public URL if you put Audioseerr behind a reverse proxy.
- `YOUTUBE_API_KEY` — enables the in-app YouTube player.

### Pushing updates from your laptop

The flow is **commit on your laptop → push to GitHub → pull on the server → rebuild**:

```bash
# On your laptop, after making changes:
git add -A
git commit -m "describe what changed"
git push

# On the server (SSH in):
cd /opt/audioseerr
git pull
docker compose up -d --build
```

`docker compose up -d --build` rebuilds the image and restarts the container. Database migrations apply automatically on startup (the entrypoint runs `prisma migrate deploy`). Your data in `./config` is untouched.

### Useful commands

```bash
docker compose logs -f audioseerr     # live logs
docker compose restart audioseerr     # restart without rebuilding
docker compose down                   # stop the container (data is preserved)
docker compose pull && docker compose up -d --build   # full refresh
```

### Reading music files for in-app playback

If you want Audioseerr to stream files from your Lidarr library, uncomment the `/music` volume in `docker-compose.yml` and point it at the host path Lidarr writes to. Then, in Audioseerr's admin settings, configure a path mapping so the Lidarr-side path (e.g. `/music`) maps to the container-side path (e.g. `/music`).

## Layout

```
prisma/schema.prisma     v1 data model (§6 of the design doc)
prisma.config.ts         Prisma 7 config — DATABASE_URL lives here for CLI commands
src/auth.ts              Auth.js v5 config (credentials + JWT sessions)
src/middleware.ts        Auth.js route protection
src/instrumentation.ts   Boots node-cron jobs at server start
src/lib/db.ts            PrismaClient singleton (better-sqlite3 driver adapter)
src/lib/jobs/index.ts    Scheduled jobs (§10 — handlers are stubs in v1)
src/components/ui/       shadcn/ui components
```

## License

[MIT](LICENSE).
