# AURA-1 Vertical Slice

Date: 2026-09-17
Status: awaiting review
Parent: `2026-09-17-aura1-masterplan.md`

---

## 1. Goal

One unbroken path from button press to database to screen, with the offline
queue real rather than stubbed.

**Done means:** select an activity on the AURA-1, press POWER, work, press
POWER again. The device is offline. Hours later it finds wifi, syncs, and the
session is visible at `aura.amygdala-inc.org` with correct start and end
times.

This proves the two things that could sink the project: offline durability
and Cloudflare Access with a service token from an embedded client.

---

## 2. Scope

In:

- `folder`, `activity`, `session` tables. Seeded, no CRUD UI.
- `POST /api/v1/sync` and `GET /api/v1/sessions`.
- Firmware: carousel navigation, session start/stop, SD queue, wifi sync, RTC.
- Web: one page listing sessions grouped by day.
- Docker compose, Postgres, deploy to the Pi behind Cloudflare.

Out, deferred to later phases:

- Habits, quotes, calendar, XP, decay, skins, manual backfill.
- RITES, ORACLE and VESSEL places in the carousel.
- Kael'thos artwork. The screensaver is text only.
- The design system. The web page is unstyled.
- Audio.

The web page being ugly is intentional. Styling it now means restyling it in
Phase 5.

---

## 3. Architecture

```
AURA-1                        Cloudflare              Raspberry Pi
------                        ----------              ------------
carousel + session FSM
        |
   SD append-only queue
        |
   wifi on -> one POST  --->  Access validates  --->  fastify
                              service token            drizzle
                                                       postgres
        <--- acked uuids + server_time + config <---
   prune queue, set RTC

                              Access SSO       --->   vue spa
                              (browser)
```

---

## 4. Data

Slice subset of the masterplan schema.

```sql
folder(id, name, sort_order, archived_at)
activity(id, folder_id, name, created_at, archived_at, last_used_at)
session(id, activity_id, started_at, ended_at, source, device_uuid, created_at)
```

`session.device_uuid` is `unique`. This is the whole idempotency story.

Seed: the five folders, and two or three activities each, taken from real
life so the slice is immediately usable.

## 5. API

```
POST /api/v1/sync
  headers: CF-Access-Client-Id, CF-Access-Client-Secret
  body:    { device_id, config_version, events: [SessionEnded] }
  200:     { server_time, config_version, config?, acked: [uuid] }

GET /api/v1/sessions?from=&to=
  200:     [{ id, activity, folder, started_at, ended_at, source }]
```

`SessionEnded` is `{ uuid, activity_id, started_at, ended_at, clock_synced }`.

Server behaviour:

- Upsert each event on `device_uuid`. Already-present uuids are still returned
  in `acked` so a device that lost the previous response can prune.
- Return `config` only when the device's `config_version` is stale.
- `server_time` on every response. The device re-sets the RTC from it.

Types and zod schemas live in `packages/shared` and are imported by both API
and web. The slice has one event type, so the firmware struct is hand-written
against the schema and covered by a contract test. Codegen is deferred until
there are enough event types to justify it.

## 6. Firmware

### State machine

```
BOOT -> load config + queue from SD
     -> restore carousel position
     -> open-session marker present? close it at last heartbeat
     |
IDLE (carousel)
  SUN short  : next activity in current folder (recency ordered)
  SUN long   : next folder, land on its last-used activity
  POWER short: -> RUNNING
  POWER long : power off via GPIO17 latch
  no input 30s: -> SCREENSAVER
     |
RUNNING
  write open-session marker to SD
  heartbeat timestamp into marker every 5 min
  display: activity name, "IN PROGRESS", no elapsed time
  POWER short: -> STOPPING
  POWER long : power off, session survives via marker
     |
STOPPING
  append SessionEnded to queue, clear marker
  show duration once, hold 5s
  -> SYNCING
     |
SYNCING
  wifi up, one POST, wifi down
  success: prune acked, set RTC, update config
  failure: keep queue, no retry now
  -> IDLE
```

Sync also runs on wake, every 6 hours, and never continuously.

### Screens

Throwaway. These layouts are a functional prototype, not the design. The
real device interface is Phase 4, once the art pipeline exists and the visual
language is settled.

To keep that rework cheap, the state machine never draws. It emits a view
model; a `Renderer` interface consumes it. Reskinning in Phase 4 means writing
a second `Renderer`, not touching the FSM. It also means the FSM is host
testable with a fake renderer, which Section 8 depends on.

200x200, 1-bit. Text only in this phase.

```
IDLE                      RUNNING                  STOPPED
+------------------+      +------------------+     +------------------+
| WORKSHOP    2/5  |      | WORKSHOP         |     | SEALED           |
|                  |      |                  |     |                  |
| > aura-1         |      | aura-1           |     | aura-1           |
|   screentime app |      |                  |     |                  |
|   agency         |      | IN PROGRESS      |     | 1h 47m           |
|                  |      |                  |     |                  |
| SUN   next       |      | POWER  stop      |     | ...              |
| HOLD  next folder|      |                  |     |                  |
+------------------+      +------------------+     +------------------+
```

Partial refresh for cursor movement. Full refresh on folder change and every
20 partials, to clear ghosting.

### Pins

| Function | GPIO |
| --- | --- |
| POWER button sense | 18 |
| Power hold latch | 17 |
| SUN button (BOOT) | 0 |
| Battery ADC (1/2 divider) | 4 |
| Panel power control (LOW = on) | 6 |
| Display busy (idle HIGH) | 8 |
| I2C SDA / SCL (RTC, SHTC3, ES8311) | 47 / 48 |

Remaining display SPI and SD pins come from the Waveshare schematic during
implementation.

GPIO0 is a strapping pin. Nothing in the design may require holding SUN during
power-on, or the board enters USB download mode. Both PWR and BOOT are
documented as user-programmable on this board.

A reserved 2x6 2.54mm expansion header is available. Not used in this phase;
it is the escape hatch if two buttons ever prove insufficient.

### Memory

The board ships in two module variants under the same product name, 4MB/2MB
and 8MB/8MB. Design targets the lower one and detects at runtime via
`ESP.getFlashChipSize()` and `ESP.getPsramSize()`.

This costs nothing. A 200x200 1-bit framebuffer is 5 KB, and 10 KB with the
previous-frame buffer partial refresh needs. Both fit in SRAM; PSRAM is not
required. Fonts and sprites stream from the SD card. No OTA partition, so 4MB
of flash is comfortable.

### Storage

```
/config.json     folders, activities, config_version
/queue.ndjson    append-only, one event per line
/session.open    open-session marker, deleted on clean stop
```

Credentials (wifi, service token) are compiled in for this phase.

## 7. Web

Single unstyled page. Fetches `GET /api/v1/sessions`, groups by day, shows
activity, folder, start, end, duration. Proves the round trip. Nothing more.

## 8. Testing

- `shared`: unit tests on the pure functions and schema parsing.
- `api`: integration tests against a real Postgres in Docker. The critical
  test is replaying the same batch three times and asserting one row.
- `firmware`: queue and state machine built for the PlatformIO `native`
  environment and unit tested on the host. Display and wifi are behind
  interfaces so they can be faked.
- Manual: pull the battery mid-session and confirm recovery to within 5
  minutes. Sync with the Pi unreachable and confirm nothing is lost.

## 9. Risks

| Risk | Handling |
| --- | --- |
| Access service token rejected from an embedded client | Verify with curl against the deployed Pi before writing firmware |
| SSD1681 partial refresh ghosting worse than expected | Full refresh cadence is a tunable constant |
| Module variant unknown | Designed to the lower floor; detected at runtime. Framebuffer is 5 KB, so it is a non-issue |
| SD write corruption on power loss | Append-only, line-oriented; a torn final line is discarded on parse |

## 10. Sequence

1. Monorepo scaffold, Docker compose, Postgres, drizzle migrations.
2. `shared` schemas and types.
3. API with integration tests. Deploy to the Pi.
4. Cloudflare Access policy plus service token. Verify with curl.
5. Web page.
6. Firmware: display and carousel.
7. Firmware: session FSM and SD queue, host-tested.
8. Firmware: wifi sync and RTC.
9. End-to-end on real hardware.
