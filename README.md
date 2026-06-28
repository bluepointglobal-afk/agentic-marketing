# Agentic Marketing — multi-brand content pipeline

A deployable system that runs a per-brand content pipeline server-side on a
schedule. You onboard a brand in the cockpit, hit **Run**, and the pipeline
executes as a Claude Agent SDK orchestration inside a persistent worker
process — through measure → SEO → brief → create → **brand-voice gate** →
publish, pausing at the gate for human approval.

## Architecture

```
┌─────────────────┐      enqueue run        ┌──────────────┐
│  Next.js app    │ ─── POST /api/runs ───▶ │   Redis      │
│  (cockpit + API)│                          │  (BullMQ)    │
│                 │ ◀── poll GET /api/runs ─ └──────┬───────┘
└────────┬────────┘                                 │ job
         │ read/write                                ▼
         │                                  ┌──────────────────┐
         ▼                                  │  Worker process  │
   ┌──────────┐                             │  (Agent SDK)     │
   │ MongoDB  │ ◀───────── read/write ───── │  seo · brief ·   │
   │ brands,  │                             │  create · gate · │
   │ runs     │                             │  publish         │
   └──────────┘                             └──────────────────┘
```

- **Next.js (TypeScript)** — serves the cockpit (`apps/web/app/BrandPipeline.jsx`,
  a client component) and the API routes. Producer for the run queue.
- **Standalone Node worker** (`worker/`) — separate process, **not** serverless.
  Agent SDK runs take minutes; it deploys to a persistent host. Consumer of the
  run queue.
- **BullMQ + Redis (ioredis)** — the job queue connecting app and worker.
- **MongoDB + Mongoose** — brands, runs, drafts.
- **Cron scheduler** — enqueues runs per brand cadence (step 6).
- **`@pipeline/shared`** — canonical domain types derived field-for-field from
  the cockpit. Imported by both app and worker so the schemas can't drift.

All model/API keys live in worker/server env vars only — never exposed to the client.

## Repository layout

```
apps/web/          Next.js app: cockpit + API routes
worker/            Standalone Agent SDK worker (own process, own Dockerfile)
packages/shared/   Canonical types shared by app + worker
docker-compose.yml MongoDB + Redis for local dev
.env.example       Every key, annotated by the build step that needs it
```

## Local development

Prerequisites: Node 20+, Docker (for Redis + Mongo).

```bash
# 1. Install all workspaces
npm install

# 2. Configure env
cp .env.example .env      # defaults already point at the docker-compose services

# 3. Start infrastructure (MongoDB + Redis)
npm run infra:up          # docker compose up -d

# 4. Run the app (terminal A)
npm run dev:web           # http://localhost:3000

# 5. Run the worker (terminal B)
npm run dev:worker
```

Stop infrastructure with `npm run infra:down`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev:web` | Next.js cockpit + API on :3000 |
| `npm run dev:worker` | Worker process (tsx watch) |
| `npm run typecheck` | Strict TS check across all workspaces |
| `npm run infra:up` / `infra:down` | Start/stop Redis + Mongo |

## Worker deployment

The worker is a long-running process and must deploy to a **persistent host**
(Railway / Render / Fly / Azure Container App), not a serverless function —
Agent SDK runs take minutes and would time out on serverless. A Dockerfile and
deploy notes land in step 7.

## Build status

This repo is being built incrementally. Current step:

- [x] **1. Scaffold** — Next.js app + worker package + docker-compose (Redis/Mongo)
- [ ] 2. Mongoose models + brand CRUD API, wired to the cockpit
- [ ] 3. Queue + worker skeleton (timed no-op stages), run/poll/approve seams wired
- [ ] 4. Real Agent SDK subagents (seo, brief, create) + gate scoring + approval pause
- [ ] 5. Image generation (one provider) + publish (`draft` target)
- [ ] 6. Cron scheduler per cadence
- [ ] 7. Worker Dockerfile + deploy notes
