# AURA-1 Masterplan

Date: 2026-09-17
Status: approved (design phase)

The whole system. Individual subsystems get their own specs; this document
holds the decisions that are expensive to reverse and the order things get
built in.

---

## 1. What this is

A physical time tracker (Waveshare ESP32-S3 1.54in e-Paper AIoT board) paired
with a self-hosted dashboard at `aura.amygdala-inc.org`. Logged hours feed
Kael'thos, an entity with no temporal form. The point is to make sustained
work legible, measurable and worth romanticising.

---

## 2. Locked decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Build order | Vertical slice first, then layer | Proves offline sync and firmware integration early |
| Taxonomy | Two levels: folders contain activities | Folders group, activities are measured |
| Folders | AXIOM, WORKSHOP, HERESY, DREAM, HUNT | Register: Bloodborne-adjacent, one word, legible at 200x200 |
| XP attaches to | Activity, not folder | Folder totals are a rollup |
| Device auth | Cloudflare Access service token | Non-human client path built into Access; no custom auth code |
| Backend | Node + Fastify + Drizzle, pnpm monorepo | Shared types between API, web and codegen for firmware |
| Firmware | Arduino-ESP32 via PlatformIO | GxEPD2 handles SSD1681 partial refresh; power APIs still available |
| Device nav | SUN = next, POWER = act on the selection, hold SUN = up, hold POWER = off | Two buttons, no double-press lag; POWER always acts, SUN always moves |
| Device IA | A hierarchy: MENU (ACTIVITIES, TODAY, HABITS, QUOTES) > folders > items; boot reopens the last started activity | Nine-plus places are too many for one ring, and each kind acts differently |
| Decay | Cosmetic only; XP never lost | Removes incentive to log junk hours |
| Art | SVG master rig, build-time bake to 1-bit | One source of truth, drift impossible, not pixel art |
| Live timer | Not shown during a session | Ghosting, battery, and it is the better design |
| Memory | Design to the V1 floor, detect at runtime | 4MB/2MB and 8MB/8MB both ship as `ESP32-S3-ePaper-1.54` |

---

## 3. Domain model

```
folder        id, name, sort_order, archived_at
activity      id, folder_id, name, created_at, archived_at, last_used_at
session       id, activity_id, started_at, ended_at,
              source ('device'|'manual'), device_uuid, created_at
habit         id, name, sort_order, archived_at
habit_entry   habit_id, date, done          -- composite PK
todo          id, body, due_date, done_at, sort_order, created_at
quote         id, body, source, created_at
entity_state  bond_xp, last_session_at, form_state    -- singleton
```

Rules that hold system-wide:

- XP is derived on read, never stored. The curve can be retuned without
  rewriting history.
- `device_uuid` is the idempotency key. Sync is safe to retry blindly.
- Archive, never delete. Retiring hides from the device carousel; history and
  XP stay intact.
- `form_state` is cached on `entity_state` so the MCU reads one field instead
  of doing date math.

### XP

```
session_minutes  = ended_at - started_at
source_mult      = 1.0 device | 0.5 manual
density_mult     = 1.0  (< 45 min)
                 | 1.25 (45-90 min)
                 | 1.5  (> 90 min)

session_xp       = session_minutes * source_mult * density_mult
```

Density multiplier rewards unbroken blocks over fragmented ones. This is the
mechanical expression of "Insight" as the thing being fed.

Sessions longer than 6 hours are flagged for review and contribute no XP
until confirmed on the web. One threshold, not two. This covers forgetting to
press stop.

- Activity level `L`: reached at cumulative XP `>= 30 * L^2`.
- Bond XP: sum of all session XP. Bond levels gate skins.

### Decay

| Since last session | State | Effect |
| --- | --- | --- |
| < 24h | `stable` | Normal |
| 24-48h | `thinning` | Dither density drops, form lightens |
| 48-72h | `fragmenting` | Silhouette breaks up, terminal voice goes sparse |
| > 72h | `dormant` | He is gone. Not dead. |

Recovery, either route:

- Log a 60-minute uninterrupted session on the `RESURRECTION` system activity,
  reachable from VESSEL only while dormant.
- Or backfill the hours you actually worked. He wakes with no penalty. Your
  hardest weeks must not be punished by this system.

---

## 4. Subsystems

| # | Subsystem | Depends on |
| --- | --- | --- |
| 1 | Domain + API | - |
| 2 | Firmware | 1 (contract only) |
| 3 | Dashboard | 1 |
| 4 | Art pipeline | - (feeds 2 and 3) |
| 5 | Audio / mic capture | 1, 2, 4 |

### Repo layout

```
packages/
  shared/      types, zod schemas, XP + decay pure functions
  api/         fastify + drizzle
  web/         vue 3 + vite + tailwind
  firmware/    platformio
art/           kaelthos.svg rig + bake script
docs/
```

`shared` holds the XP and decay math as pure functions. API and web import it.
Firmware gets generated C structs from the same zod schemas, so the sync
contract has exactly one definition.

---

## 5. Phases

- **Phase 0** Monorepo scaffold, Docker compose, Postgres, CI.
- **Phase 1** Vertical slice. Own spec. One activity, device to database to
  screen.
- **Phase 2** Full domain. Folder and activity CRUD, habits, quote vault, XP,
  decay, manual backfill, todos (a web widget to write the list).
- **Phase 3** Art pipeline. SVG rig, bake script, first skins. A 3D model of
  Kael'thos derived from the rig for the web (three.js): a minimalist rotating
  outline while the dashboard loads, and ASCII-rendered rotation art. Start by
  extruding the rig's silhouette so 2D and 3D cannot drift; a sculpted model
  can replace it later.
- **Phase 4** Device complete. MENU level, TODAY (today's todos, POWER ticks
  one off; ticks sync through the existing queue), HABITS, QUOTES, screensavers,
  decay rendering.
- **Phase 4b** Skins as places. Bloodborne (Yharnam, the Hunter's Dream, the
  hunter's hat, paleblood moon) moves out of the default look into a skin
  picked in SETTINGS. A Halloween skin (pumpkins, bats, ghosts) for October.
  The default stays the plain lofi study.
- **Phase 5** Dashboard proper. Node graph, design system, motion, typography,
  and the 3D Kael'thos in the UI. The Phase 2 web is a functional prototype;
  this phase redesigns it. Installable as a PWA (manifest, icons, service
  worker for an offline shell) so it lives on the phone's home screen.
- **Phase 4c** Looks (done 2026-09-22). Nine page designs picked in
  SETTINGS: Codex, Nodes, Focus, Containment, Cathedral, Byrgenwerth, Dream,
  Blood Moon, Rite. Settings as a gear, battery panel, habit graphs, todos
  that drop off at the user's midnight.
- **Phase 6** Reader. Books on the SD card (EPUB converted to plain paginated
  text on the server, pushed by sync), read page by page; Kael'thos reading
  in the lower-right corner. Chapter jump, progress saved per book. A
  highlight saves the whole page on the glass; on the web the exact passage
  is picked from it and notes added. Battery: e-ink draws only on a page
  turn, so reading costs about what the lists do.
- **Phase 7** Companion. Conversations with Kael'thos through an LLM
  (OpenRouter), in character: he speaks, the user answers yes or no with the
  two buttons. Roleplay, wisdom, company, motivation. The server holds the
  key, the persona and the history; the device sends only the answer and
  gets his next line. Wi-Fi only for each exchange, off between.
- **Phase 8** Mood tracker. Details to come.
- **Phase 9** Workout tracker, weights and cardio/runs. Details to come.
- Dropped: audio (speaker signature, mic capture).

---

## 6. Design language

Distinct from the Amygdala `Dead Channel` system in `inspiration/`. That one
is strict 1-bit with a red accent. AURA-1 is warmer and gothic rather than
analog-horror.

- Never pure black. Surfaces `#121212` and darker greys.
- Off-whites `#C5BCAB`, `#DBD5CA`.
- Monochrome only. No accent colour.
- Dither, grain, 1-bit woodcut etching, high-contrast vector line.
- Motion: bezier ease in/out, spatial panning between nodes.

Kael'thos is a flat black silhouette plus paper marks: big round eyes, a dash
of a nose at eye level, a white line down the outer side of each ear. No
shading, no gradient. He is drawn, not constructed: every outline carries a
seeded hand wobble, lines taper like brush strokes, whiskers droop. The head
tilts and the gaze goes aside, never dead ahead. He likes the user, so his
faces are bright or content, never sullen (references: inspiration/ghibli*).
Consistency comes from a parts rig (packages/art), not from redrawing poses.

Poses: idle (bright, glancing aside), focused (headphones, eyes closed,
vibing). Later: studying with a coffee mug, sealed/proud after a stop,
sleeping for dormant, and decay states. Skins: default, astrolabe halo; later
pumpkin-head and blood moon.

Bake constraint: no stroke thinner than 3px at final 200x200 size. Whiskers
are tapered filled shapes, not hairlines.

---

## 7. Open

- Who draws the SVG master.
- Web node-graph information architecture. Phase 5.

## 8. Explicitly not doing

- Multi-user, accounts, sharing.
- Native mobile app. The dashboard is responsive.
- Live session timer on the device.
- Real-time sync. Batched, on-demand only.
