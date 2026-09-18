# Deploy: API on the Pi behind Cloudflare Access

Run on the Raspberry Pi. `docker compose build` runs natively on arm64;
both base images (`node:22-alpine`, `postgres:17-alpine`) are multi-arch.

## 1. Clone

```bash
git clone <repo-url> aura1
cd aura1
```

## 2. Configure the tunnel token

Create `.env` in the repo root (gitignored, never commit it):

```
TUNNEL_TOKEN=<token from step 4 below>
```

## 3. Start everything

```bash
docker compose up -d
```

This builds and starts `postgres`, `api`, and `cloudflared`. `api` runs its
migrations on boot and has no host port: it is reachable only on the compose
network, by `cloudflared`. Check `docker compose logs api` for the "Server
listening" line before continuing.

## 4. Configure Cloudflare

1. Cloudflare Zero Trust, Networks, Tunnels: create a tunnel, route
   `aura.amygdala-inc.org` to `http://api:3000`.
2. Copy the tunnel token into `.env` as `TUNNEL_TOKEN` (step 2). Never commit it.
3. Zero Trust, Access, Applications: create a self-hosted app for
   `aura.amygdala-inc.org`.
4. Policy one, `browser`: action Allow, include your email.
5. Zero Trust, Access, Service Auth: create a service token named `aura-1`.
   Copy the client id and secret now; they are shown only once.
6. Policy two, `device`: action **Service Auth** (not Allow), include the
   `aura-1` service token, scoped to the path `/api/v1/sync`.

   The `device` policy must use Service Auth, not Allow. Allow still triggers
   an identity redirect, which an embedded (non-browser) client cannot follow.

## 5. Verify

With the service token from step 4.5:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "CF-Access-Client-Id: $CF_ID" \
  -H "CF-Access-Client-Secret: $CF_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```

Expected: `HTTP/2 200` with a JSON body containing `serverTime` and a `config`
object holding five folders.

Then confirm the gate is real, with no credentials:

```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```

Expected: `302` to a Cloudflare login page, or `403`. Anything that reaches
the API means the policy is wrong; stop and fix it before continuing.
