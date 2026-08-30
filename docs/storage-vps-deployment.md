# GameFlex storage gateway deployment

This document explains the HTTP storage gateway contract used by GameFlex. The application is R2-only; the gateway owns the Cloudflare R2 credentials and must never expose them to browser code.

The gateway may run on a VPS or another server platform, but it must write to Cloudflare R2 rather than Supabase Storage.

## 1. Prerequisites

- Clean Ubuntu 22.04+ VPS
- SSH access
- Domain or subdomain such as `storage.gameflex.co.ke`
- HTTPS termination via Cloudflare or Nginx
- Node.js 20+
- `npm` or `pnpm`

## 2. Provisioning

Run the provisioning script from the repo root on the VPS:

```bash
chmod +x scripts/provision-vps-storage.sh
sudo ./scripts/provision-vps-storage.sh
```

The script is idempotent and will:

- create `/var/lib/gameflex-storage`
- create logical bucket directories
- create a dedicated `gameflex-storage` system user
- set secure ownership and permissions
- install runtime dependencies
- configure the storage API service
- configure health checks
- configure log rotation
- create the systemd unit

## 3. Storage root

```text
/var/lib/gameflex-storage/
├── avatars/
├── posts/
├── stories/
├── shorts/
├── messages/
├── tournaments/
├── achievements/
├── rewards/
├── marketplace/
└── .keep
```

This is a logical bucket layout. The app never writes raw filesystem paths; it only uses the storage abstraction and logical bucket names.

## 4. Storage API runtime

The API should run behind a reverse proxy such as Nginx with authentication and TLS enabled.

Typical environment variables on the VPS:

```bash
NODE_ENV=production
STORAGE_API_URL=https://storage.gameflex.co.ke
STORAGE_PUBLIC_URL=https://storage.gameflex.co.ke
STORAGE_ROOT=/var/lib/gameflex-storage
STORAGE_MAX_UPLOAD_BYTES=10485760
STORAGE_JWT_AUDIENCE=gameflex-storage
STORAGE_PROVIDER=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret-key>
R2_REGION=auto
```

The web application must set `VITE_STORAGE_PROVIDER=r2`, `VITE_STORAGE_API_URL` to this gateway, and `VITE_STORAGE_PUBLIC_URL` to the R2 custom domain or CDN URL. `VITE_STORAGE_API_URL` is required at runtime; there is no Supabase Storage fallback.

The gateway must implement the upload, remove, sign, list, and object endpoints documented in `src/backend/adapters/storage.ts`, with authentication and bucket/path authorization enforced server-side.

## 5. systemd

The service is managed by systemd. Typical commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gameflex-storage
sudo systemctl start gameflex-storage
sudo systemctl status gameflex-storage
sudo journalctl -u gameflex-storage -f
```

## 6. Health endpoint

The storage API should expose a health check such as:

```text
GET https://storage.gameflex.co.ke/health
```

The response should contain a safe, public summary only: provider status, API readiness, disk/volume health, and bucket status.

Do not expose secrets or internal file paths.

## 7. Reverse proxy

Nginx should route HTTPS traffic to the local storage API port and reject unsafe requests.

Example conceptual upstream:

```nginx
location / {
  proxy_pass http://127.0.0.1:4123;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
}
```

## 8. Cloudflare DNS

Create a DNS record for the storage subdomain:

```text
Type: A
Name: storage
Value: <VPS_IP>
Proxy status: DNS only or proxied per deployment design
```

If Cloudflare proxying is enabled, the storage origin should still terminate HTTPS at Cloudflare and then route to the VPS over TLS origin settings. The application should not hardcode the VPS IP in source code.

## 9. Backups

- Store database backups separately from media backups.
- Do not use the primary storage root as the backup target.
- Retain backup procedures outside the active storage path.
- Never auto-delete active media during backup jobs.

## 10. Rollback

- stop the service
- restore the last known-good config
- restore the previous version of the API
- verify health and object retrieval
- restart the service

## 11. Security notes

- Never expose the filesystem root to the browser.
- Validate JWTs and authorization on the storage API.
- Enforce upload size and MIME constraints.
- Reject path traversal and unsafe object keys.
- Keep all secrets in the server environment and never in source control.
## 6. PM2 Process Management

The main GameFlex Nitro/Node production server is managed by PM2. PM2 keeps the application running, automatically restarts the process if it crashes, and provides production process monitoring and logs.

The production server entrypoint is:

```bash
node dist/server/index.mjs
```

The repository contains `ecosystem.config.cjs` with the GameFlex PM2 configuration.

### Start GameFlex

After building the application:

```bash
npm run build
npx pm2 start ecosystem.config.cjs
```

### Check status

```bash
npx pm2 status
```

The GameFlex process should show:

```text
gameflex    online
```

### View logs

```bash
npx pm2 logs gameflex
```

### Restart GameFlex

```bash
npx pm2 restart gameflex
```

### Stop GameFlex

```bash
npx pm2 stop gameflex
```

### Save the process list

After starting or changing the production process configuration:

```bash
npx pm2 save
```

### Automatic crash recovery

PM2 is configured with automatic restart enabled. If the GameFlex Node/Nitro process crashes, PM2 automatically restarts it.

```text
GameFlex process crashes
        ↓
PM2 detects failure
        ↓
PM2 automatically restarts GameFlex
        ↓
GameFlex returns online
```

### Automatic startup after VPS reboot

On the production Contabo VPS, PM2 must be registered with systemd so it starts automatically when Ubuntu boots.

Run on the production VPS:

```bash
npx pm2 startup
```

PM2 will output a `sudo ...` command. Execute the generated command, then run:

```bash
npx pm2 save
```

This ensures the saved GameFlex process is restored automatically after a VPS reboot.

```text
VPS reboot
    ↓
Ubuntu boots
    ↓
systemd starts PM2
    ↓
PM2 restores saved processes
    ↓
GameFlex Nitro starts
    ↓
GameFlex available on port 3000
```

### Production process architecture

```text
Internet
    ↓
Cloudflare
    ↓
Nginx / HTTPS
    ↓
GameFlex Nitro :3000
    ↓
PM2
    ↓
Node.js
```

PM2 manages the main GameFlex application. The separate `gameflex-storage` service remains managed by systemd.

Do not run `pm2 startup` during normal development or inside temporary GitHub Codespaces environments. Configure it on the permanent production VPS.
