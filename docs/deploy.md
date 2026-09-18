# Deploy: API on the Pi behind Cloudflare Access

Run on the Raspberry Pi. `docker compose build` runs natively on arm64;
both base images (`node:22-alpine`, `postgres:17-alpine`) are multi-arch.

Follow the steps in order. Steps 4 and 5 create Cloudflare Access before the
tunnel ever routes traffic to the API, so the API is never exposed
unauthenticated, even briefly.

## 1. Clone

```bash
git clone <repo-url> aura1
cd aura1
```

## 2. Bring up Postgres and the API

```bash
docker compose up -d postgres api
```

`postgres` and `postgres-test` are bound to `127.0.0.1` only (not the LAN);
`postgres-test` also only starts when named explicitly or via `pnpm db:up`,
never on a bare `up`. `api` runs its migrations on boot, then seeds the five
folders and their placeholder activity names if the database is still empty
(safe to restart: it skips seeding once rows exist); rename activities
directly in the database afterwards, no admin UI exists yet. After ANY edit
to folders or activities, bump `config_version` in the same step, or the
device never picks up the rename:

```bash
docker compose exec postgres psql -U aura -d aura -c "UPDATE meta SET value = value + 1 WHERE key = 'config_version';"
```

The device picks up the change on its next sync. `api` has no
host port: it is reachable only on the compose network, by `cloudflared`.
Check `docker compose logs api` for the "Server listening" line before
continuing. Do not start `cloudflared` yet — it has no tunnel token and no
Access policy exists to protect it.

## 3. Create the Cloudflare Tunnel (do not route it yet)

Cloudflare Zero Trust, Networks, Tunnels: create a tunnel, but do not add the
`aura.amygdala-inc.org` hostname route yet. Copy the tunnel token; add it to
`.env` in the repo root (gitignored, never commit it):

```
TUNNEL_TOKEN=<tunnel token>
```

Do not run `docker compose up -d` again yet. Adding the hostname route
before Access exists would put the unauthenticated API on the internet.

## 4. Create Access applications and policies

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

   The more specific path (`api/v1/sync`) wins for requests to that path and
   does not inherit the root application's `browser` policy. Every other
   path, including `/api/v1/sessions`, falls under the root application and
   its Allow policy only — so it is closed to a service token and open only
   to your logged-in browser session.

   Never use the Bypass action on any application or policy. Access
   evaluates Bypass first, so it is the one policy mistake that opens a
   path regardless of anything else configured.

Optionally, on the tunnel's public hostname settings, enable "Protect with
Access" (the exact dashboard label may differ by Cloudflare version) as
defence in depth alongside the Access application policies.

## 5. Route the tunnel and start it

Now add the `aura.amygdala-inc.org` hostname route on the tunnel, pointing
to `http://api:3000`.

```bash
docker compose up -d
```

This recreates `cloudflared` with the real `TUNNEL_TOKEN` from `.env` and
starts it for the first time. `docker compose config` prints the
substituted token in plain text, so never paste its output anywhere.

## 6. Verify

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
