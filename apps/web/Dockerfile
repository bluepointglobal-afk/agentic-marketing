# ──────────────────────────────────────────────────────────────────────────
# Web image — Next.js cockpit + API routes, monorepo standalone output.
#
# Build from the REPO ROOT (the build context must include the workspaces):
#   docker build -f apps/web/Dockerfile -t pipeline-web .
#
# In Coolify, set the Dockerfile path to apps/web/Dockerfile and the build
# context / base directory to the repo root.
# ──────────────────────────────────────────────────────────────────────────

FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps: install the whole workspace from the lockfile (cached) ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
COPY worker/package.json worker/package.json
RUN npm ci

# ── build: produce the Next.js standalone server ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace apps/web

# ── runner: minimal standalone runtime ──
FROM base AS runner
ENV NODE_ENV=production
# Standalone server (includes its own traced node_modules + packages/shared),
# plus the static assets and public/ which standalone does not copy itself.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# The monorepo standalone entrypoint lives at apps/web/server.js.
CMD ["node", "apps/web/server.js"]
