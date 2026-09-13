# Deployment (portable)

GameFlex builds to a plain Node server and runs anywhere: Dokploy, Coolify,
Docker Compose, a bare VPS, Kubernetes, Fly.io or Render. Nothing in the build
or runtime path depends on a specific hosting vendor.

## What the build produces

```
dist/client        static assets (hashed, immutable, cacheable by any CDN)
dist/server        Node SSR server, entry: dist/server/index.mjs
```

The server target is environment driven:

| Variable        | Default       | Notes                                        |
| --------------- | ------------- | -------------------------------------------- |
| `SERVER_PRESET` | `node-server` | any nitro preset (`node-server`, `bun`, ...) |
| `PORT`          | `3000`        | HTTP port at runtime                         |
| `HOST`          | `0.0.0.0`     | bind address                                 |

`vite.config.ts` uses the Lovable config wrapper when it is installed and
otherwise assembles the same plugin set itself, so `bun install && bun run build`
works in any CI without that package.

## Build-time vs runtime variables

- `VITE_*` variables are **compiled into the browser bundle** → must be passed
  as build args / build-time env (see `Dockerfile`, `docker-compose.yml`).
- Everything else (`SUPABASE_*`, `STORAGE_*`, `DEFAULT_ADMIN_EMAIL`, ...) is read
  at **runtime** from the process environment. Never bake secrets into the image.

Start from `.env.example`; it lists every supported variable.

## Docker

```bash
cp .env.example .env      # fill in real values
docker compose up -d --build
```

Or directly:

```bash
docker build \
  --build-arg VITE_SITE_URL=https://your-domain \
  --build-arg VITE_SUPABASE_URL=https://your-backend \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  -t gameflex .

docker run -d -p 3000:3000 --env-file .env gameflex
```

## Dokploy

1. Create an **Application** → source: this Git repository.
2. Build type: **Dockerfile** (`./Dockerfile`).
3. Add the `VITE_*` values as **build arguments** and the server-only values as
   **environment variables**.
4. Port: `3000`. Health check path: `/healthz` (readiness: `/readyz`).
5. Attach your domain; Dokploy terminates TLS, the app needs no TLS config.
6. Deploy. Subsequent pushes redeploy the same way.

## Health endpoints

| Path       | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `/healthz` | liveness — dependency free, stays green during backend hiccups   |
| `/readyz`  | readiness — verifies configuration and that the backend responds |

Use `/healthz` for restart policies and `/readyz` for load-balancer routing.

## Reverse proxy notes

- Serve `dist/client/assets/*` with long-lived immutable caching.
- Forward `X-Forwarded-Proto` / `X-Forwarded-Host` so canonical and share links
  resolve to the public origin (both are derived from the request).
- WebSockets must be allowed for realtime (chat, feed and notification updates).

## Environments

Development, staging and production differ only by environment values —
`VITE_SITE_URL`, backend URL/keys and storage provider settings. No code change
is needed to move between them, and each capability (data, auth, storage,
realtime) can point at a different provider; see `docs/backend-providers.md`.

## Database migrations

Migrations under `supabase/migrations/` are ordered, additive and applied
manually to production after review. Never point a fresh deployment at the
production database without applying pending migrations first.
