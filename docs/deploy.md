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
directly in the database afterwards, no admin UI exists yet. `api` has no
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

Two applications on `aura.amygdala-inc.org`, in this order:

1. **Application 1 (root)**: leave Path empty, so it covers every path
   including `/` — this is where the web dashboard will live in a later
   task. Policy `browser`: action Allow, include your email.
2. **Application 2**: Path `api/v1/sync`. Its only policy is `device`:
   action **Service Auth**, selector "Service Token" (not "Any Access
   Service Token"), set to the `aura-1` token created below.

   The more specific path (`api/v1/sync`) wins for requests to that path and
   does not inherit the root application's `browser` policy. Every other
   path, including `/api/v1/sessions`, falls under the root application and
   its Allow policy only — so it is closed to a service token and open only
   to your logged-in browser session.

3. Zero Trust, Access, Service Auth: create a service token named `aura-1`.
   Copy the client id and secret now; they are shown only once. Set them
   with `read`, not literal text, so they never land in shell history:

   ```bash
   read -r CF_ID
   read -rs CF_SECRET
   ```

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
