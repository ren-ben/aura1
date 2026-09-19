# Hardware checklist

Bench procedure for end-to-end verification before the board is trusted with
real sessions. Follow the sections and numbering in order.

## A. Backend and Cloudflare (on the Pi)

1. `uname -m` reports `aarch64` (64-bit OS recommended); `docker compose
   version` shows v2; `timedatectl` says the clock is synchronized (the
   device's RTC is set from the Pi's clock).
2. `docker compose up -d`. Logs show migrate, then "seeded", then "Server
   listening". `docker compose ps` shows no `postgres-test`. `ss -ltn` shows
   5433 and 3000 on `127.0.0.1` only.
3. If you rename activities, bump `config_version` in the same step (see
   [docs/deploy.md](deploy.md)).
4. Create the `aura-1` service token and record its expiry. Access app 1:
   root, empty path, Allow your email. Access app 2: path `api/v1/sync`,
   Service Auth, selector Service Token `aura-1`. Never use Bypass.
5. Add `aura.amygdala-inc.org` to `/etc/cloudflared/config.yml`, above the
   catch-all, pointing at `http://127.0.0.1:3000`. Create the DNS record and
   restart `cloudflared` (see [docs/deploy.md](deploy.md)). The other
   hostnames on the tunnel still work.
6. Run the curl checks in [docs/deploy.md](deploy.md), including the
   unauthenticated GET `/` expecting `302`. Log in with a browser: the page
   shows "No sessions logged."
7. In the Cloudflare dashboard, check Security Events and Bot Fight Mode. An
   ESP32 can be challenged even when curl passes.

## B. Flash

8. Fill in `packages/firmware/secrets.h` (never commit it). The hotspot must
   be 2.4 GHz (iPhone: turn on "Maximize Compatibility"). Upload with
   `python -m platformio run -e aura1 -t upload` and open the serial monitor
   at 115200. If there is no serial output, add
   `-DARDUINO_USB_CDC_ON_BOOT=1` to `platformio.ini` and reflash. Record the
   `flash=`/`psram=` line. Confirm no flash-size error, no boot loop, and no
   PSRAM fatal error.
9. The panel powers on; the first refresh is full; no GxEPD2 "Busy Timeout".
10. Holding POWER turns the board on; releasing it does not turn it off or
    start a session. No button needs holding at boot, and plugging in USB
    does not enter download mode. One SUN tap moves one activity; one hold
    moves one folder. Moves within a folder use a partial refresh; a folder
    change uses a full refresh.
11. First boot with the hotspot on: sync succeeds (the serial line shows
    200), the carousel shows AXIOM, `/config.json` is written, and the RTC
    matches UTC. The config survives a power cycle.
12. Optional: point `SYNC_URL` at a host with a self-signed certificate. The
    sync must fail and post nothing.

## C. Offline logging

13. Hotspot off. Log 3 sessions across 2 folders. Running shows no elapsed
    time. Stopped shows the duration and returns to Idle after about 5 s. A
    block of roughly 15 s after each stop (the failed sync) is expected.
14. Long-press POWER to switch off, then back on. On a PC, `/queue.ndjson`
    holds 3 event lines ending in `\n` only, and there is no
    `/session.open`.
15. RTC retention: power off for several minutes, power on, and compare the
    time. If the clock reset, sessions will refuse to start until the next
    successful sync. That is by design.
16. Start a session, wait 2 minutes, long-press to power off, power on.
    Exactly one session of about 2 minutes is queued.
17. With no SD card: no crash, and sessions refuse to start.

## D. Sync

18. Hotspot on; stop a session. All queued sessions appear on the page with
    durations matching the device (times are shown in UTC).
    `/queue.ndjson` and `/acked.ndjson` are gone. Serial shows 200. `psql`
    shows distinct uuids and correct times.
19. Two separate boots, one session each right after boot: the uuids differ.
20. Optional: more than 200 queued events drain over successive syncs.

## E. Crash recovery

21. Start a session, wait at least 6 minutes, then pull the battery and USB.
    After power-on the device is Idle and one session of about 5 minutes is
    queued. A session under 5 minutes is dropped by design.
22. A one-hour session: the display does not fade and does not flash every
    second.

## F. Idempotency under failure

23. Stop a session with the hotspot off and read its uuid from the card.
    POST that uuid yourself with curl and the service token (convert the
    epoch times to ISO). Put the card back, turn the hotspot on, and let the
    device sync. Exactly one row exists, and the queue is drained.
24. Pull power about 2 s into a sync, then reboot. The boot sync leaves
    exactly one row.
25. `docker compose stop api`, then stop a session. The sync fails, nothing
    is pruned, and it gives up within about 25 s. `docker compose start
    api`: the next sync delivers the session.
26. After a day, compare RTC drift against server time. More than a few
    seconds a day suggests the crystal needs the 12.5 pF setting.
