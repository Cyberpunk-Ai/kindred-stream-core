# GameFlex

A gaming ecosystem: tournaments, game rooms, marketplace, squads, messaging and a
full social feed (posts, stories, reels, follows, comments and notifications).

## Stack

- TanStack Start (SSR) + React + TypeScript
- Tailwind CSS
- Supabase-compatible backend (data, auth, realtime) behind an abstraction layer
- Pluggable object storage: Supabase, S3, Cloudflare R2 or a VPS gateway

## Development

Requires [Bun](https://bun.sh) (or Node.js 22+ with npm).

```sh
git clone <this-repository-url>
cd <repository-name>
cp .env.example .env   # fill in your backend values
bun install
bun run dev            # http://localhost:8080
```

Useful scripts:

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `bun run dev`       | dev server with HMR                      |
| `bun run build`     | production build                         |
| `bun run build:node`| production build targeting a Node server |
| `bun run start`     | run the built server (`dist/server`)     |
| `bun run typecheck` | TypeScript check                         |
| `bun run lint`      | ESLint                                   |

## Deployment

The build is vendor neutral and runs on Dokploy, Coolify, Docker Compose, a VPS,
Kubernetes or any Node host. See **[docs/deployment.md](docs/deployment.md)** for
Docker/Dokploy setup, build-time vs runtime variables and health endpoints
(`/healthz`, `/readyz`).

```sh
cp .env.example .env
docker compose up -d --build
```

## Configuration

Every environment-specific value comes from environment variables — nothing is
hardcoded. `VITE_*` values are compiled into the browser bundle (build time);
everything else is read at runtime. Backend, auth, storage and realtime
providers are each switchable on their own: see
[docs/backend-providers.md](docs/backend-providers.md) and
[docs/storage-vps-deployment.md](docs/storage-vps-deployment.md).

## Database

Ordered, additive SQL migrations live in `supabase/migrations/`. Review and apply
pending migrations before pointing a deployment at a production database.
