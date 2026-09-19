# Hardware checklist

Bench procedure for end-to-end verification before the board is trusted with
real sessions. Follow the sections and numbering in order.

## A. Backend and Cloudflare (on the Pi)

1. `uname -m` reports `aarch64` (64-bit OS recommended); `docker compose
   version` shows v2; `timedatectl` says the clock is synchronized (the
   device's RTC is set from the Pi's clock).
2. `docker compose up -d`. Logs show migrate, then "seeded", then "Server
   listening". `docker compose ps` shows no `postgres-test`. `ss -ltn` shows
   15433 and 13000 on `127.0.0.1` only.
3. Rename activities on the web page's Activities tab; the device picks the
   change up on its next sync.
4. Create the `aura-1` service token and record its expiry. Access app 1:
   root, empty path, Allow your email. Access app 2: path `api/v1/sync`,
   Service Auth, selector Service Token `aura-1`. Never use Bypass.
5. Add `aura.amygdala-inc.org` to `/etc/cloudflared/config.yml`, above the
   catch-all, pointing at `http://127.0.0.1:13000`. Create the DNS record and
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
   with `python -m platformio device monitor -e aura1`. Record the
   `flash=`/`psram=` line. Confirm no flash-size error, no boot loop, and no
   PSRAM fatal error.
9. Power-on shows WAKING, then the folder list, both without the flashing
   full refresh; no GxEPD2 "Busy Timeout". After a flash or reset (not a
   power-off), faint ghosting of the old frame is expected until DORMANT.
10. Holding POWER turns the board on; releasing it does not turn it off or
    start a session. No button needs holding at boot, and plugging in USB
    does not enter download mode. On the folder list, SUN moves one folder
    and POWER opens it. Inside, SUN moves one activity, POWER starts, and
    holding SUN returns to the folder list with the cursor on that folder.
    All of these use a partial refresh.
11. First boot with the hotspot on: sync succeeds (the serial line shows
    200), the folder list shows AXIOM, `/config.json` is written, and the
    RTC matches UTC. The config survives a power cycle. Pressing SUN while
    it waits for Wi-Fi prints `sync cancelled` and moves at once.
12. Optional: point `SYNC_URL` at a host with a self-signed certificate. The
    sync must fail and post nothing.

## C. Offline logging

13. Hotspot off. Log 3 sessions across 2 folders. Running shows no elapsed
    time. SEALED shows the duration and returns to the list after about
    5 s, or at once on SUN.
14. Long-press POWER to switch off: DORMANT appears. With USB plugged in,
    POWER wakes it. Switch on: it reopens the last started activity. On a
    PC, `/queue.ndjson` holds 3 event lines ending in `\n` only, there is no
    `/session.open`, and `/nav.txt` holds that activity's id.
15. RTC retention: power off for several minutes, power on, and compare the
    time. If the clock reset, sessions will refuse to start until the next
    successful sync. That is by design.
16. Start a session, wait 2 minutes, long-press to power off, power on.
    Exactly one session of about 2 minutes is queued.
17. With no SD card: no crash, and sessions refuse to start.

## D. Sync

18. Hotspot on; stop a session. All queued sessions appear on the page with
    durations matching the device.
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

## F2. Menu, today, quotes (after a sync with todos, habits and quotes on the web)

F2a. From the folder list, hold SUN: the menu shows TODAY and HABITS with their
     progress, and Kael'thos peeks from the bottom-right corner; his eyes move as
     SUN moves the cursor.
F2b. In TODAY, POWER ticks a todo and shows the tick at once. Ticking the last
     one plays a celebration. With the hotspot off, tick one, then sync: the web
     shows it done.
F2c. In QUOTES, a quote appears in a bubble with a cameo below it; POWER moves on.
     A long quote shows an arrow under the bubble; SUN turns to the rest.
F2d. Leave the device on the list for three minutes: a lore scene fills the
     screen; a press returns to the list without starting anything.

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
