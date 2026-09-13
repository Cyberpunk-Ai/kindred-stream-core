# ---------------------------------------------------------------------------
# GameFlex production image — portable (Dokploy, Coolify, Docker Compose, K8s).
#
# Build args starting with VITE_ are compiled into the browser bundle, so they
# must be provided at BUILD time. Server-only values (SUPABASE_SERVICE_ROLE_KEY,
# STORAGE_*, ...) are read at RUNTIME from the container environment.
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# Client-visible configuration (build-time)
ARG VITE_APP_NAME
ARG VITE_APP_DESCRIPTION
ARG VITE_SITE_URL
ARG VITE_CURRENCY
ARG VITE_SUPPORT_EMAIL
ARG VITE_DEFAULT_LOBBY_SIZE
ARG VITE_BACKEND_PROVIDER
ARG VITE_AUTH_PROVIDER
ARG VITE_STORAGE_PROVIDER
ARG VITE_REALTIME_PROVIDER
ARG VITE_BACKEND_REST_URL
ARG VITE_BACKEND_REST_KEY
ARG VITE_AUTH_API_URL
ARG VITE_STORAGE_API_URL
ARG VITE_STORAGE_PUBLIC_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_OAUTH_PROVIDERS
ARG VITE_ANALYTICS_ENABLED
ARG VITE_ERROR_REPORTING_URL

# Self-hosted Node output instead of an edge/worker bundle.
ENV SERVER_PRESET=node-server
ENV NODE_ENV=production

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.mjs"]
