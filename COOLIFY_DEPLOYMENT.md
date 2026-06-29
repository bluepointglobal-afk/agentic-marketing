# Coolify Deployment (Vultr VPS)

Two Docker services from this one monorepo, deployed via Coolify on a Vultr
High-Performance VPS:

| Service | Dockerfile | Port | Process |
| --- | --- | --- | --- |
| **web** | `apps/web/Dockerfile` | **3000** | Next.js cockpit + API (standalone) |
| **worker** | `worker/Dockerfile` | *(none)* | long-running Agent SDK consumer + cron |

Both build from the **repo root** as context. State is fully decoupled:
**MongoDB Atlas** (documents), **Upstash Redis** (BullMQ), **S3/R2** (media).

## Managed prerequisites
- **MongoDB Atlas** cluster → `MONGODB_URI` (`mongodb+srv://…`)
- **Upstash Redis** → `REDIS_URL` (`rediss://…`, TLS)
- **S3-compatible bucket** (AWS S3 / Cloudflare R2 / Vultr Object Storage) →
  `S3_*` (public-read for served assets)
- API keys: Anthropic (required for real runs), OpenAI (images), OpenRouter
  (Kimi), Blotato (publish + analytics)

## Service: web

- **Build pack:** Dockerfile
- **Dockerfile location:** `apps/web/Dockerfile`
- **Base directory / build context:** repo root (`/`)
- **Port:** `3000` (Coolify "Ports Exposes" = `3000`; map a domain to it)
- **Restart policy:** `unless-stopped`
- **Health check (optional):** HTTP `GET /` on `3000`

Environment variables:
```
MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxx.mongodb.net/agentic_marketing?retryWrites=true&w=majority
REDIS_URL=rediss://default:TOKEN@your-db.upstash.io:6379
RUN_QUEUE_NAME=brand-runs

# object storage (absolute asset URLs)
S3_ENDPOINT=https://s3.<region>.amazonaws.com        # or R2/Vultr endpoint
S3_REGION=<region>                                    # "auto" for R2
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://your-bucket.s3.<region>.amazonaws.com

# optional: absolute base the landing pages fetch from (defaults to request host)
NEXT_PUBLIC_API_BASE_URL=
```
The web service only enqueues + reads; it never runs the Agent SDK, so it's safe
to scale horizontally.

## Service: worker

- **Build pack:** Dockerfile
- **Dockerfile location:** `worker/Dockerfile`
- **Base directory / build context:** repo root (`/`)
- **Port:** none — it's a pure worker (no HTTP server)
- **Restart policy:** `unless-stopped` (**required** — this is the always-on engine)
- **Health check:** built into the image (`HEALTHCHECK` runs `healthcheck.mjs`:
  Redis ping + heartbeat freshness). Coolify restarts it on repeated failures.

Environment variables (superset of web, plus model/publish keys):
```
MONGODB_URI=...            # same Atlas as web
REDIS_URL=...              # same Upstash as web
RUN_QUEUE_NAME=brand-runs

PIPELINE_DRIVER=agent      # "stub" for a keyless smoke test
WORKER_CONCURRENCY=2
WORKER_LOCK_DURATION_MS=300000
SCHEDULER_ENABLED=true     # run cron on exactly ONE worker replica

ANTHROPIC_API_KEY=...      # required for real runs
OPENAI_API_KEY=...         # GPT Image 2
OPENROUTER_API_KEY=...     # Kimi bulk variants

# same S3/R2 block as web (worker uploads generated creatives)
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=...

# publishing + analytics
BLOTATO_API_KEY=...
BLOTATO_TIKTOK_ACCOUNT_ID=...        # or set per-brand in the cockpit
BLOTATO_TIKTOK_PRIVACY=SELF_ONLY     # PUBLIC_TO_EVERYONE to go live

# optional metrics
GSC_CLIENT_EMAIL=...
GSC_PRIVATE_KEY=...

# optional funnel push
FUNNEL_WEBHOOK_URL=
```

### Scaling note
If you run **multiple worker replicas**, set `SCHEDULER_ENABLED=true` on **one**
of them only (BullMQ job schedulers are global; one ticker avoids redundant
enqueues). All replicas consume the run queue.

## First deploy

1. Provision Atlas + Upstash + the S3 bucket; collect the env values above.
2. In Coolify, create the **worker** service first (Dockerfile `worker/Dockerfile`,
   context = repo root), paste its env, set restart `unless-stopped`, deploy.
   Watch logs for `mongo connected` → `redis connected` → `worker ready`.
3. Create the **web** service (Dockerfile `apps/web/Dockerfile`, context = repo
   root, port `3000`), paste its env, attach a domain, deploy.
4. Seed brands once (from any machine pointed at the same Atlas):
   `MONGODB_URI=... npm run seed`.
5. Open the cockpit → Run a pipeline → approve at the gate → confirm publish +
   the worker `HEALTHCHECK` shows healthy in Coolify.

## Local parity

`docker compose` (Redis + Mongo) is for local dev only. The production images are
the two Dockerfiles above; build them locally to verify:
```
docker build -f worker/Dockerfile  -t pipeline-worker .
docker build -f apps/web/Dockerfile -t pipeline-web .
```
