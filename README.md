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
