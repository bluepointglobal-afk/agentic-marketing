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
   │ MongoDB  │ ◀───────── read/write ───── │  measure · seo · │
   │ brands,  │                             │  brief · create ·│
   │ runs     │                             │  gate · publish  │
   └──────────┘                             └──────────────────┘
```

- **Next.js (TypeScript)** — serves the cockpit (`apps/web/app/BrandPipeline.jsx`,
  a client component) and the API routes. Producer for the run queue.
- **Standalone Node worker** (`worker/`) — separate process, **not** serverless.
  Agent SDK runs take minutes; it deploys to a persistent host. Consumer of the
  run queue + the cron scheduler.
- **BullMQ + Redis (ioredis)** — the job queue connecting app and worker.
- **MongoDB + Mongoose** — brands, runs, drafts.
- **`@pipeline/shared`** — canonical domain types + Mongoose models + queue
  config, imported by both app and worker so schemas can't drift.

All model/API keys live in worker/server env vars only — never exposed to the client.

## The pipeline (the worker job)

Each run is a BullMQ job. Stages run in order, each delegating to one Agent SDK
subagent via `query()` + the `agents` option (Agent tool enabled):

| Stage | What it does | Subagent · model |
| --- | --- | --- |
| `measure` | GSC/GA4/social metrics | *(placeholder — integration pending)* |
| `seo` | search intent, winning angle, 5–8 keywords | `seo-researcher` · sonnet (WebSearch/WebFetch) |
| `brief` | synthesize metrics + SEO into a brief | `brief-writer` · opus |
| `create` | draft the post + creative | `brand-writer` · sonnet + image API |
| `gate` | score draft vs brand voice (0–100) | `brand-qa` · opus |
| `publish` | push to the brand's target | *(no agent)* |

- **Gate:** if `score < brand.gateThreshold` the run is **rejected** (nothing
  publishes). If `score >= gateThreshold` the run goes **awaiting_approval** and
  the job stops with the draft + score persisted.
- **Approval:** `POST /api/runs/:id/approve` resumes the job into `publish`;
  `POST /api/runs/:id/reject` ends it.
- **Cost:** the SDK result's `total_cost_usd` is accumulated onto the run.
- **Image generation:** `generateImage(brand, prompt)` switches on
  `brand.imageModel` — **GPT Image 2** is wired; **Nano Banana** (Gemini) is a
  marked TODO.
- **Swap points** (clearly commented in code):
  - `seo-researcher` uses built-in web search → swap to DataForSEO MCP + GSC MCP.
  - `brand-writer` can route **bulk** variants (captions/meta/alt text) to
    **Kimi K2.6** via OpenRouter, wrapped as an in-process MCP tool
    (`worker/src/mcp/openrouter.ts`).

### Pipeline drivers

`PIPELINE_DRIVER` selects how stages execute:

- `agent` (default) — the real Claude Agent SDK pipeline. Requires `ANTHROPIC_API_KEY`.
- `stub` — timed no-op stages that update real run/stage state in Mongo. Lets the
  cockpit rail animate end-to-end with **zero API keys** — ideal for a first
  local smoke test of the plumbing.

## Repository layout

```
apps/web/              Next.js app: cockpit + API routes
  app/BrandPipeline.jsx  the cockpit (client component); 3 backend seams wired
  app/api/...            brands + runs REST endpoints
  app/api-client.js      cockpit ↔ API client + server→rail run mapper
worker/                Standalone Agent SDK worker (own process, own Dockerfile)
  src/pipeline/          stages, agents, sdk wrapper, image, publish, runner
  src/mcp/openrouter.ts  Kimi K2.6 in-process MCP tool (bulk-variant swap point)
  src/scheduler.ts       cron scheduler (per-cadence runs)
  src/scripts/seed.ts    seed the demo "NoorStudio" brand
packages/shared/       Canonical types + Mongoose models + queue config
docker-compose.yml     MongoDB + Redis for local dev
worker/Dockerfile      Worker image for a persistent host
.env.example           Every key, annotated by the build step that needs it
```

## API

| Method · path | Purpose |
| --- | --- |
| `POST /api/brands` | create a brand (onboarding) |
| `GET /api/brands` | list brands (dashboard) |
| `GET /api/brands/:id` | one brand (refresh run history) |
| `POST /api/runs` `{ brandId }` | enqueue a run → `{ runId }` |
| `GET /api/runs/:id` | run status + stage statuses + draft (polling) |
| `POST /api/runs/:id/approve` | approve the gated draft → resumes publish |
| `POST /api/runs/:id/reject` | reject the gated draft → ends the run |

## Local development

Prerequisites: Node 20+, Docker (for Redis + Mongo).

```bash
# 1. Install all workspaces
npm install

# 2. Configure env (defaults already point at the docker-compose services)
cp .env.example .env

# 3. Start infrastructure (MongoDB + Redis)
npm run infra:up

# 4. (optional) Seed the demo brand
npm run seed --workspace worker

# 5. App (terminal A)
npm run dev:web        # http://localhost:3000

# 6. Worker (terminal B)
#    Driverless first run — no API keys needed:
PIPELINE_DRIVER=stub npm run dev:worker
#    Real pipeline (needs ANTHROPIC_API_KEY in .env):
npm run dev:worker
```

Open the cockpit, onboard a brand (or use the seeded one), hit **Run pipeline**,
and watch the rail animate from real worker state. At the gate, the draft + score
appear; **Approve** publishes, **Reject** ends the run.

Stop infrastructure with `npm run infra:down`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:web` | Next.js cockpit + API on :3000 |
| `npm run dev:worker` | Worker (tsx watch): queue consumer + scheduler |
| `npm run typecheck` | Strict TS check across all workspaces |
| `npm run infra:up` / `infra:down` | Start/stop Redis + Mongo |
| `npm run seed --workspace worker` | Seed the demo brand |

## Deployment

Two deployables: the **Next.js app** and the **worker**. They share MongoDB +
Redis (use managed instances in production, e.g. MongoDB Atlas + Upstash/managed Redis).

### App

Deploy `apps/web` anywhere that runs Next.js (Vercel, a container, etc.). Set
`MONGODB_URI`, `REDIS_URL`, `RUN_QUEUE_NAME`. The app only *enqueues* and reads —
it never runs the Agent SDK, so serverless is fine for it.

### Worker (persistent host required)

The worker is long-running and **must not** run on serverless (Agent SDK runs
take minutes). Deploy the image to **Railway / Render / Fly / Azure Container App**.

```bash
# Build from the repo root (context must include the workspaces):
docker build -f worker/Dockerfile -t pipeline-worker .
docker run --env-file .env pipeline-worker
```

Per-host notes:

- **Railway / Render** — point the service at this repo, set the Dockerfile path
  to `worker/Dockerfile` and the build context to the repo root. Add the env vars
  below. No public port is needed (the worker exposes none).
- **Fly.io** — `fly launch --dockerfile worker/Dockerfile`, set
  `[processes] worker = "npm run start"`, scale to ≥1 always-on machine, and
  `fly secrets set` the env vars.
- **Azure Container App** — deploy the image with **min replicas = 1** (so it
  never scales to zero) and configure secrets as env vars.

Required worker env vars (see `.env.example` for the full annotated list):

```
MONGODB_URI=         # managed Mongo
REDIS_URL=           # managed Redis (same instance as the app)
RUN_QUEUE_NAME=brand-runs
ANTHROPIC_API_KEY=   # required when PIPELINE_DRIVER=agent
PIPELINE_DRIVER=agent
WORKER_CONCURRENCY=2
SCHEDULER_ENABLED=true        # run the cron scheduler in this instance
# providers, as you enable them:
OPENAI_API_KEY=      # GPT Image 2
GEMINI_API_KEY=      # Nano Banana (when wired)
OPENROUTER_API_KEY=  # Kimi K2.6 bulk variants
BLOTATO_API_KEY=     # publishTarget=blotato
CMS_API_URL= CMS_API_TOKEN=   # publishTarget=cms
```

If you run **multiple** worker replicas, set `SCHEDULER_ENABLED=true` on exactly
one of them (BullMQ job schedulers are global, but keeping it on one instance
avoids redundant tick processing). The cron cadences are configurable via
`SCHEDULE_DAILY_CRON` / `SCHEDULE_WEEKLY_CRON`.

> The worker image installs the full workspace from the lockfile (including the
> web app's deps) because `npm ci` is lockfile-wide; only the worker + shared
> source ships in the runtime layer. Trim later with a focused install if image
> size matters.

## Standards

TypeScript strict across all workspaces. Jobs are idempotent and resumable
(stage outputs persist to `run.context`; retries skip completed stages). Each run
and stage emits structured logs (pino, `runId`/`brandId`/`stage` bound). A failed
stage marks the run `errored` and never hangs.

## Build status

- [x] **1. Scaffold** — Next.js app + worker package + docker-compose (Redis/Mongo)
- [x] **2. Models + brand CRUD API** — wired to the cockpit's list/create
- [x] **3. Queue + worker** — stage status drives the cockpit rail; run/poll/approve/reject wired
- [x] **4. Agent SDK subagents** — seo/brief/create + gate scoring + approval pause
- [x] **5. Image generation + publish** — GPT Image 2 wired; `draft` publish wired
- [x] **6. Cron scheduler** — per-cadence runs (daily/weekly)
- [x] **7. Worker Dockerfile + deploy notes**

### Closed-loop extensions (in progress)

- [x] **Brand DNA + assets** — upload a logo + long-form brand DNA per brand
  (stored in MongoDB GridFS). DNA is injected into every agent prompt; the logo
  is composited onto every generated image (sharp). TikTok/IG/X publishing via
  Blotato with per-brand account ids set in the cockpit.
- [ ] **Closed-loop measure** — ingest real KPIs for prior posts and feed them
  back into seo/brief so each cycle improves on what performed.
- [ ] **Funnel** — post-publish landing page + email sequence via a pluggable
  connector (Kartra / ConvertKit / Mailchimp).
