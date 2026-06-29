# ──────────────────────────────────────────────────────────────────────────
# Worker image — the standalone Agent SDK pipeline consumer.
# This is a LONG-RUNNING process; deploy it to a persistent host
# (Vultr VPS via Coolify / Railway / Render / Fly), NOT a serverless function:
# Agent SDK runs take minutes and would time out on serverless.
#
# Build from the REPO ROOT (the build context must include the workspaces):
#   docker build -f worker/Dockerfile -t pipeline-worker .
#
# Runs as a pure worker (no exposed port). A HEALTHCHECK monitors Redis
# reachability + a freshness heartbeat so Coolify can restart a stalled run.
# ──────────────────────────────────────────────────────────────────────────

FROM node:22-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
# Copy manifests first so dependency install caches across source changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY worker/package.json worker/package.json
COPY apps/web/package.json apps/web/package.json
# Install prod deps for all workspaces from the lockfile.
# (Includes the web workspace's deps too, since npm ci is lockfile-wide; the
# runtime stage only ships the worker + shared source.)
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Agent SDK spawns a bundled CLI; nothing else is needed at the OS level.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
# Source for the two workspaces the worker actually runs.
COPY packages/shared ./packages/shared
COPY worker ./worker

# Run as the unprivileged node user.
USER node
WORKDIR /app/worker

# Liveness: fail if Redis is unreachable OR the worker heartbeat goes stale.
# start-period gives the process time to connect before checks count.
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

# `npm run start` → `tsx src/index.ts` (tsx is a runtime dep and also resolves
# the @pipeline/shared TypeScript source package).
CMD ["npm", "run", "start"]
