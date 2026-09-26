# Deploy: API on the Pi behind Cloudflare Access

Run on the Raspberry Pi. `docker compose build` runs natively on arm64;
both base images (`node:22-alpine`, `postgres:17-alpine`) are multi-arch.

This assumes the Pi already runs a locally-managed `cloudflared` tunnel from
`/etc/cloudflared/config.yml`. AURA-1 adds one ingress rule to it; it does
not need its own tunnel.

Follow the steps in order. Step 3 creates Cloudflare Access before step 4
routes the hostname to the API, so the API is never exposed
unauthenticated, even briefly.

## 1. Clone

```bash
git clone <repo-url> aura1
cd aura1
```

## 2. Bring up Postgres and the API

```bash
docker compose up -d
```

`postgres` and `postgres-test` are bound to `127.0.0.1` only (not the LAN);
`postgres-test` also only starts when named explicitly or via `pnpm db:up`,
never on a bare `up`. `api` runs its migrations on boot, then seeds the five
folders and their placeholder activity names if the database is still empty
(safe to restart: it skips seeding once rows exist). Manage folders and
activities on the web page's Activities tab: every change there bumps
`config_version`, so the device picks it up on its next sync. Only if you
edit folders or activities directly in the database, bump it yourself in the
same step, or the device never picks up the change:

```bash
docker compose exec postgres psql -U aura -d aura -c "UPDATE meta SET value = value + 1 WHERE key = 'config_version';"
```

The device picks up the change on its next sync. `api` is published on
`127.0.0.1:13000` only, where the host's `cloudflared` reaches it. Keep the
`127.0.0.1`: Docker's port rules bypass UFW, so a bare `13000:3000` would
put the unauthenticated API on your LAN. The host ports (13000, and 15433 for
Postgres) are chosen to stay clear of other compose projects. If one is
still taken, change the left-hand port in `docker-compose.yml` and use the
new API port in step 4.

Lecture maps (the Academy) need an OpenRouter key. Put it in a `.env` beside
`docker-compose.yml` (gitignored; see `.env.example`), then
`docker compose up -d` again:

```bash
echo "OPENROUTER_API_KEY=sk-or-..." >> .env
```

It stays on the server: the browser never sees it. `ACADEMY_BUDGET_USD`
(default 10) caps a month's spend; the two model names can be changed there too.

Check `docker compose logs api` for the "Server listening" line, and
`curl -s http://127.0.0.1:13000/api/v1/sessions` for `[]`, before
continuing. Do not touch the tunnel config yet: no Access policy exists to
protect the API.

## 3. Create Access applications and policies

Create the service token first, then the two applications on
`aura.amygdala-inc.org`, in this order:

1. Zero Trust, Access, Service Auth: create a service token named `aura-1`.
   Copy the client id and secret now; they are shown only once. Set them
   with `read`, not literal text, so they never land in shell history:

   ```bash
   read -r CF_ID
   read -rs CF_SECRET
   ```

   Record the token's expiry date somewhere you will see it again. An
   expired token fails Access silently and the device just stops syncing.

2. **Application 1 (root)**: leave Path empty, so it covers every path
   including `/`, where the web dashboard is served (Task 7). Policy
   `browser`: action Allow, include your email.
3. **Application 2**: Path `api/v1/sync`. Its only policy is `device`:
   action **Service Auth**, selector "Service Token" (not "Any Access
   Service Token"), set to the `aura-1` token created above.

   The more specific path (`api/v1/sync`) wins for requests to that path,
   and every path under it, and does not inherit the root application's
   `browser` policy. Everything the device reaches lives there: the sync
   itself, and `api/v1/sync/books/...`, where it fetches books whole. Every other
   path, including `/api/v1/sessions`, falls under the root application and
   its Allow policy only — so it is closed to a service token and open only
   to your logged-in browser session.

   Never use the Bypass action on any application or policy. Access
   evaluates Bypass first, so it is the one policy mistake that opens a
   path regardless of anything else configured.

## 4. Route the hostname through the existing tunnel

Add this rule to the `ingress:` list in `/etc/cloudflared/config.yml`.
Rules match top to bottom, so put it above the catch-all
`service: http_status:404` and above any wildcard such as
`*.amygdala-inc.org`:

```yaml
  - hostname: aura.amygdala-inc.org
    service: http://127.0.0.1:13000
```

Check the file, create the DNS record, and restart the tunnel:

```bash
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
cloudflared tunnel --config /etc/cloudflared/config.yml ingress rule https://aura.amygdala-inc.org
cloudflared tunnel route dns <tunnel-name> aura.amygdala-inc.org
sudo systemctl restart cloudflared
```

`ingress rule` must print the `aura.amygdala-inc.org` rule, not a wildcard
or the catch-all. `route dns` needs `~/.cloudflared/cert.pem` from
`cloudflared tunnel login`. Without it, add the record by hand in the
Cloudflare DNS dashboard instead: CNAME `aura` to
`<tunnel-UUID>.cfargotunnel.com`, proxied. The UUID is the `tunnel:` value
in `config.yml`.

## 5. Verify

Unauthenticated GET on the root, must redirect to the Cloudflare Access
login:

```bash
curl -i https://aura.amygdala-inc.org/
```

Expected: `302` whose `Location` is on `<team>.cloudflareaccess.com`. A
`200` means the root application is missing and the dashboard is public.

Unauthenticated GET, must not reach the API:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sessions
```

Expected: `302` whose `Location` is on `<team>.cloudflareaccess.com`, or
`401`, or `403`.

The same GET, but with the `aura-1` service-token headers — must still not
succeed, proving the token cannot read sessions:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sessions \
  -H "CF-Access-Client-Id: $CF_ID" \
  -H "CF-Access-Client-Secret: $CF_SECRET"
```

Expected: anything other than `200`.

Unauthenticated POST to the sync path, must not reach the API:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```

Expected: `302`, `401`, or `403`.

A `200`, `400`, or `404` on any of the three above means Fastify answered
the request, so the Access gate is open. Stop and fix the policy before
continuing.

Finally, the service token against the path it is meant for:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "CF-Access-Client-Id: $CF_ID" \
  -H "CF-Access-Client-Secret: $CF_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```

Expected: `HTTP/2 200` with a JSON body containing `serverTime` and a
`config` object holding five folders.
