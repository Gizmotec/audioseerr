# Contributing to Audioseerr

Thanks for your interest in contributing! Audioseerr is a self-hosted, multi-user "Overseerr for music" — and contributions of all kinds are welcome: bug reports, features, design polish, docs, and tests.

## Development environment

Requires Node 20+ (tested on 25).

```bash
npm install
cp .env.example .env       # fill in AUTH_SECRET and AUDIOSEERR_SECRET
npx prisma migrate dev     # create dev SQLite db at ./dev.db
npm run dev                # http://localhost:3000
```

Generate dev secrets with `openssl rand -base64 32`.

## Before you open a PR

Please make sure all four verification commands pass:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Pull request conventions

- **Small, milestone-shaped PRs.** Per §14 of the [design doc](docs/plans/2026-05-03-audioseerr-design.md), each change should be its own PR-shaped chunk so the codebase stays reviewable in pieces. One feature or fix per PR beats a mega-PR every time.
- **Commit subjects:** short, imperative, and specific — match the existing git log style, e.g. `Add per-track download buttons to artist top tracks`, `Fix silent preview playback: resolve expiring Deezer URLs at play time`.
- **Screenshots for UI changes.** Drop before/after shots in the PR description — the design system matters here.

## Design docs

Larger features start life as a design doc in [`docs/plans/`](docs/plans/), named with a date prefix: `YYYY-MM-DD-<feature>-design.md`. Browse existing examples like [`2026-06-18-daily-mix-discover-weekly-design.md`](docs/plans/2026-06-18-daily-mix-discover-weekly-design.md) or [`2026-07-18-soft-neo-brutalism-redesign.md`](docs/plans/2026-07-18-soft-neo-brutalism-redesign.md) to see the shape. If your change is big enough to need one, open the doc (or a discussion issue) before writing lots of code.

## ⚠️ A note for AI coding agents (and their humans)

This project pins a Next.js version with **breaking changes relative to most training data** — APIs, conventions, and file structure may all differ from what you (or your agent) expect. Per [`AGENTS.md`](AGENTS.md): **read the relevant guide in `node_modules/next/dist/docs/` before writing any code**, and heed deprecation notices. Don't rely on memorized Next.js patterns; verify against the bundled docs first.

## AI-assisted contributions are normal here

Audioseerr is built by a non-developer working with AI coding agents — that's the workflow, not a dirty secret. PRs written with AI assistance are completely welcome. All we ask is that *you* understand what your PR does, that it follows the conventions above, and that all four verification commands pass. Review happens on the code, not on how it was typed.

## Questions?

Open an issue — bug reports and feature requests both use the templates, and blank issues are enabled if none of them fit.
