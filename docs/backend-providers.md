# Backend abstraction & provider swapping

All client code (pages, components, hooks, services) talks to the backend through
a single entry point:

```ts
import { backend } from "@/backend";

const { data } = await backend.from("tournaments").select("*");
await backend.storage.from("avatars").upload(path, file);
backend.channel("messages").on(/* ... */).subscribe();
```

No UI file imports a vendor SDK directly — this is enforced by ESLint
(`no-restricted-imports`). Only `src/backend/**`, `src/integrations/**` and
server-only modules (`*.server.ts`, `*.functions.ts`) may touch a provider SDK.

## Capabilities and adapters

| Capability | Env var                  | Values                        | Default    |
| ---------- | ------------------------ | ----------------------------- | ---------- |
| Data       | `VITE_BACKEND_PROVIDER`  | `supabase`, `rest`            | `supabase` |
| Auth       | `VITE_AUTH_PROVIDER`     | `supabase`, `custom`          | `supabase` |
| Storage    | `VITE_STORAGE_PROVIDER`  | `supabase`, `s3`, `r2`, `vps` | `supabase` |
| Realtime   | `VITE_REALTIME_PROVIDER` | `supabase`, `none`            | `supabase` |

Each capability is independent: you can move only storage to R2 and keep
everything else on the managed backend.

### Data (`rest`)

Targets any PostgREST-compatible API (self-hosted Postgres gateway, VPS,
Contabo). Query syntax at call sites is unchanged.

```
VITE_BACKEND_PROVIDER=rest
VITE_BACKEND_REST_URL=https://api.example.com
VITE_BACKEND_REST_KEY=<api key>
```

### Storage (`s3` | `r2` | `vps`)

Speaks a small HTTP contract against your signing/upload gateway:

```
POST {api}/{bucket}/upload           multipart form-data (file, path)
POST {api}/{bucket}/remove           { paths: string[] }
POST {api}/{bucket}/sign             { path, expiresIn } -> { url }
GET  {api}/{bucket}/list?prefix=     -> { objects: [{ name }] }
GET  {api}/{bucket}/object?path=     -> raw bytes
```

```
VITE_STORAGE_PROVIDER=r2
VITE_STORAGE_API_URL=https://files.example.com
VITE_STORAGE_PUBLIC_URL=https://cdn.example.com
```

### Auth (`custom`)

Routes the auth surface used by the app to your own gateway
(`sign-in`, `sign-up`, `sign-out`, `session`, `recover`, `resend`, `user`).

```
VITE_AUTH_PROVIDER=custom
VITE_AUTH_API_URL=https://auth.example.com
```

### Realtime (`none`)

Returns inert channels so subscribing components keep rendering and rely on
query refetching instead of live updates.

## Deployment checklist

1. Set the provider env vars for the target environment (defaults need none).
2. Any provider misconfiguration logs a warning and falls back to the default
   provider rather than crashing the app.
3. `bun run build` and `bunx tsgo --noEmit` must both pass.
4. `describeBackend()` from `@/backend` prints the active provider matrix for
   diagnostics.
