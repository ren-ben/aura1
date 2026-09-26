# AURA-1 Guide

AURA-1 is a two-button e-ink device that logs your work sessions. It keeps them on its
SD card while you are offline and syncs them to your own server when it finds Wi-Fi.
This guide covers how it works, how to set it up, what to test, and what comes next.

Other docs:

- [deploy.md](deploy.md): the full Raspberry Pi and Cloudflare setup
- [hardware-checklist.md](hardware-checklist.md): all 26 test steps

## How it works

![System architecture](img/architecture.svg)

- The **device** saves every session to its SD card first. It works fully offline and
  syncs when your phone hotspot is on.
- **Cloudflare Access** is the only way in. The device proves itself with a service token
  that works only on `/api/v1/sync`. Everything else, including the dashboard, needs your
  own login.
- The **Raspberry Pi** runs two containers next to your existing `cloudflared` tunnel.
  The tunnel is outbound, so no ports are open on your network. `api` stores the sessions
  and serves the web page. Both it and `postgres` are reachable from the Pi itself only.

### On the device

![Session lifecycle](img/session-lifecycle.svg)

SUN always moves, POWER always acts, holding SUN goes back up, holding POWER switches off.
Reading a book is the one exception: SUN turns to the next page, holding SUN turns back,
POWER keeps the page as a highlight, and holding POWER goes back to the menu. The device
cannot be switched off from the middle of a book; go to the menu first.

| Button | Menu | Folder list | Inside a folder | Today / Habits | Quotes | Settings | Running |
|---|---|---|---|---|---|---|---|
| SUN | next place | next folder | next activity | next item | more of a long quote | next line | nothing |
| POWER | open it | open the folder | start a session | tick or untick | next quote | change it | stop |
| hold SUN | nothing | back to the menu | back to the folder list | back to the menu | back to the menu | back to the menu | nothing |
| hold POWER | sync, switch off | sync, switch off | sync, switch off | sync, switch off | sync, switch off | sync, switch off | sync, save, switch off |

- **The menu** holds ACTIVITIES, TODAY (todos due today or overdue), HABITS and QUOTES,
  with today's progress beside each, and a gear for the settings: SUN steps onto it
  last. Kael'thos watches from the page.
- **WIRING** is today's rewiring from the web: what is on now, how long it has left, and
  the day around it (a dial, a bus or a tape, by the look). POWER starts the session on
  the block's activity; the page stays up instead of the screensaver and moves every
  five minutes.
- **Settings:** TEXT (small or large quotes), LOOK, SKIN (only Jiji so far) and SYNC
  (POWER syncs now; then SYNCED, NO WIFI or SERVER ERROR). Below them the battery: a
  gauge, its percent, the voltage, and whether it is charging.
- **Looks** change how every page is drawn, picked with POWER on LOOK and kept across
  restarts: CODEX (a grimoire page), NODES (the dashboard's network), FOCUS (one item
  large at a time), CONTAINMENT (the Amygdala Inc. terminal), CATHEDRAL (through a
  lancet arch), BYRGENWERTH (an illuminated manuscript), CARMILLA (Victorian goth: lace, a cameo portrait, coffins, bats and hearts),
  BLOOD MOON (night, sessions in negative) and RITE (a summoning circle). They cost no
  extra battery: every look draws once per press.
- **Habits** show the chosen habit's last twelve weeks as a dot graph, a column a week,
  and its streak.
- **At midnight** (the server's time zone) todos you finished drop off and habits open
  for the new day, even before the next sync.
- **Ticks work offline.** They go out with the next sync, and the web shows them after.
- **VIGIL** is a sit. SUN walks the practices (each with its length beside it), POWER
  picks one; SUN walks the lengths (5 to 60 minutes, or OPEN), POWER sits, holding SUN
  goes back a step. A knock opens the sit. He sits still in one of four places; the
  caption says the minutes left in fives (20, 15, 10...), redrawn only when it drops.
  Cyclic Sigh and Resonance draw breathing rings instead, swelling and falling each
  second, with *in* and *out*. Noting, Metta, Kasina and the Middle Pillar ring a faint
  bell between stages. At the end the low swell and the knock close it; POWER ends it
  early and still keeps it. OPEN sits run until POWER. The length you pick is remembered
  per practice. Sits sync like sessions, but they are Stillness: no Insight, and they do
  not keep him from decaying (the hour-long RESURRECTION still does).
- **Left alone for three minutes** he takes over the screen with a scene of his own, or
  his decay if you have been away. Any press brings the list back without acting.

- **Power-on shows WAKING, power-off shows DORMANT.** The device then reopens the
  activity you last started. With USB plugged in it cannot cut power, so it sleeps
  instead, and POWER wakes it.
- **SEALED** shows the duration after a stop. SUN or POWER skips it.
- **The corner** (where each look puts it) shows the battery in quarters, a bolt while it
  charges, and Kael'thos at its side: melting into a spiral while it syncs, sitting by a
  cactus while it is offline. Online, only the battery shows.
- **The battery reads low on this board** (its sense divider is loaded by the chip), so the
  device learns what a full cell reads: the first full charge calibrates it, kept in
  `/battery.txt` on the card. The bars only go down on battery, never flicker back up.
  There is no charge pin, so charging shows when the voltage climbs; a computer on USB
  counts at once, a wall charger after a minute or so.
- **Between presses the device sleeps** unless a computer is attached (sleep drops the
  USB serial link). Switched off, it draws almost nothing. Serial logs `battery raw=`
  every 15 seconds while awake, which is how to measure drain.

- **No timer is shown while you work.** That is deliberate: you see the duration only
  when you stop.
- **Folders:** AXIOM, WORKSHOP, HERESY, DREAM and HUNT. Activities inside each folder are
  sorted by when you last used them. Empty folders are hidden.
- **A power cut costs at most 5 minutes.** A running session saves a heartbeat every 5
  minutes, and the next boot recovers it. A session shorter than 5 minutes that is cut off
  by a power loss is dropped.

### On the dashboard

The dashboard is a console with one pane on screen at a time, laid out on a hidden web
with Kael'thos at its centre.

- **Moving:** the arrow keys (or a swipe) step to the next pane; its name waits at that
  edge of the screen. Hold **the web** button, or the space bar, to see every pane at
  once; let go over one to go there. **Search** (ctrl k or /) finds panes, todos, paths,
  rituals, quotes and sessions.
- **The panes:** Kael'thos (his form, the bond, his word for the day), Today (hours,
  the list, the rewiring: the day planned as blocks on a bus, opening to a week sheet;
  the countdown until he thins), The Paths (levels, and
  where folders and activities are added, renamed and archived), The Log (sessions, the
  long ones to confirm, writing one in by hand), Insight (twelve weeks as a range: hold
  the button to lay it flat and read it), Rituals (habits: click any dot to set that
  day), Intercept (the quotes he says on the device: write them in here), The Vessel
  (the device as it last reported, and its looks: send one and it wears it at the next
  sync), The Orrery, The Pact, The Library, The Vigil, The Academy, and one sealed room.
- **The Vigil:** the ten gates of [the ascent](vigil/ASCENT.md) on the Tree of Life,
  every sit as a star in the night record, and Stillness counted apart from Insight.
  Click a gate for its practices, the signs to tick off, its secret and its shadow. The
  gate you stand on is the first with a sign still open; hover a gate for its state, hover a
  star for its sit, and click the candle to breathe with it for a minute (six breaths). A
  sit kept away from the device
  can be written in by hand. *The four sun hours* switches on a toll on the device at
  dawn, noon, dusk and midnight (Vienna's sun, that day).
- **The Academy** ([how to read it](academy/ACADEMY.md)): the physics degree (curriculum 2026) as an astrolabe, a ring per
  semester: hover a ring for its module and grades, click to open it in the ledger, drag
  the plate to turn the rete; the armillary's six beads light as the semesters are done.
  Add a course by its u:find number (or the whole first term in one click);
  the server reads its dates and rooms from u:find. Pick your exercise group when you
  know it; click a grade to set it (1 to 5, the Austrian scale); the module a course
  counts toward can be changed beside it. The ECTS, the StEOP and the weighted grade
  follow. Exams appear as u:find posts them: the course's own and its module's (the
  StEOP module exams). u:find is asked again once a day when the pane opens, or with
  *ask again*; grades, groups and modules you set are kept. Click a lecture in the
  week for its **lecture map**: Kael'thos researches it and lays it out as a canvas
  to pan, with questions to try first; export it to Obsidian or print it.
- **Everything 3D turns** when dragged, and runs only while its pane is on screen.

### Sync

![Sync](img/sync.svg)

- **Syncs happen** at boot, when you stop a session, when you switch off, from SYNC NOW,
  and every hour. Offline it tries again after 1, 2, 4 and then every 8 minutes, so a
  hotspot switched on later is found within minutes. Timed syncs skip a running session.
- **The buttons work while it looks for Wi-Fi.** Only the request itself, a few seconds
  once connected, holds them. At switch-off it waits up to 10 seconds; SUN skips it.
- **Phone hotspots:** the chip only sees 2.4 GHz. On an iPhone turn on Maximize
  Compatibility; on Android pick the 2.4 GHz band.
- **Nothing is deleted from the device until the server confirms it.** A failed sync
  changes nothing.
- **A session sent twice is still stored once.** A lost reply, a retry, or a crash
  recovery never creates a duplicate.
- **The connection is encrypted and verified.** The device checks the server's
  certificate against Cloudflare's root authorities, so nobody on the hotspot can read or
  steal the token.

## Setup

### What you need

- **The code on GitHub.** Create an empty private repository and send the URL; the branch
  gets pushed there so the Pi can clone it.
- **Your phone hotspot on 2.4 GHz.** The ESP32 cannot use 5 GHz. On an iPhone, turn on
  *Maximize Compatibility*.
- **The device** with an SD card inserted and the LiPo connected.

### 1. Raspberry Pi and Cloudflare (about 30 min)

Follow [deploy.md](deploy.md) in order. The order is part of the security: Access is set
up before the hostname is routed, so the API is never briefly public. AURA-1 reuses the
tunnel already on your Pi; you do not create a new one.

1. Clone the repo on the Pi and run `docker compose up -d`.
2. Create the `aura-1` service token and **write down its expiry date**. An expired token
   stops syncing silently.
3. Create the two Access apps: one for your login on every path, and one for the device
   token on `/api/v1/sync` only.
4. Add `aura.amygdala-inc.org` to `/etc/cloudflared/config.yml`, pointing at
   `http://127.0.0.1:13000`, create its DNS record, and restart `cloudflared`.
5. Run the curl checks. If an unauthenticated request gets `200`, `400` or `404`, the site
   is exposed. Stop there.

### 2. Flash the device (about 15 min)

1. Copy `packages/firmware/secrets.example.h` to `secrets.h`. Fill in the hotspot name and
   password, and the service token ID and secret. Never commit this file.
2. Plug in over USB. From `packages/firmware`, run:
   `python -m platformio run -e aura1 -t upload`
3. Open the serial monitor:
   `python -m platformio device monitor -e aura1`

### 3. Put Kael'thos on the card

The device draws him from an art pack on the SD card. Build it and copy it over:

1. `pnpm --filter @aura/art bake` (writes `packages/art/out/sd/art/` and `sound/`).
2. Copy the `art` and `sound` folders to the root of the SD card, so the card has
   `/art/index.txt` and `/sound/close.wav`.

Without the pack the device still works and shows plain text screens. Rebake and recopy
whenever the art changes. The look is fixed in `packages/art/STYLE.md`, his moods and
moments in `packages/art/CHARACTER.md`.

On the web he lives in the bottom-right corner, drawn live from the same rig: he
breathes, blinks, looks around, reacts to what you tick and log, and blushes when you
click him. His resting mood follows his decay.

### 4. Install the dashboard on your phone

Open `aura.amygdala-inc.org`, log in, then install it: Safari's Share menu, *Add to Home
Screen* on iPhone, or the install prompt in Chrome on Android. It opens full screen with
Kael'thos as its icon. The shell opens offline; data needs a connection.

## What to test

These eleven checks cover what the software tests on the PC cannot reach. The full list is
in [hardware-checklist.md](hardware-checklist.md).

| # | Do this | It passes when |
|---|---|---|
| 1 | Hold POWER to switch on, then let go | It stays on, and no session starts |
| 2 | First boot with the hotspot on | Serial shows `200`, and the screen shows AXIOM |
| 3 | Hotspot off: log 3 short sessions in 2 folders | No timer while running, and the duration shows after stop |
| 4 | Hotspot on: stop one more session | All 4 appear on the web page |
| 5 | Start a session, wait 6+ min, pull USB **and** battery | After boot, one ~5 min session is queued |
| 6 | Start, wait 2 min, hold POWER to switch off, switch on | One ~2 min session is queued |
| 7 | Pull power ~2 s into a sync, then reboot | Exactly one row on the page, no duplicate |
| 8 | Power off for 10 min, then compare the clock | Tells us whether the clock survives power-off |
| 9 | VIGIL, Cyclic Sigh, 5 MIN, with a speaker on the header | A knock at the start, rings breathing each second, the swell and knock at 5 minutes |
| 10 | VIGIL, Noting, 10 MIN | A faint bell at 5 minutes, the caption goes 10 then 5 MIN LEFT, the sit shows on The Vigil after sync |
| 11 | Cyclic Sigh for its whole 5 minutes, watching the glass | The rings keep time without smearing, and there is no full-screen flash |

**Send back:**

- the serial output from the first boot, and from any failure
- which checks failed, and what you saw instead
- the line starting `flash=`, which tells us which chip variant you have

## Good to know

- **After the clock resets** (flat battery, or long without power), the device will not
  start a session until it has synced once. Otherwise those sessions would be stored with
  the year 2000.
- **Rename, add or archive activities on the dashboard** (The Paths). The device picks
  the change up on its next sync. Names are capped at what its screen shows.
- **Holding POWER to switch on is safe.** The button only counts once it has been released
  after boot, so switching on never starts a session or switches straight back off.

## Where we are

![Roadmap](img/roadmap.svg)

**Done**

1. **Phase 1, vertical slice:** a session from the device to the database and back.
2. **Phase 2, full features:** the web page has tabs for the log with manual backfill
   (half XP) and review of sessions over 6 hours, todos, habits with a 26-week heatmap,
   the quote vault, activity management, and stats (XP, levels, decay).
3. **Phase 3, Kael'thos:** the locked design (`packages/art/STYLE.md`), 18 expressions,
   full-body poses, props and an 85-scene library with animations
   (`packages/art/CHARACTER.md`), played from the SD card; on the web a turning 3D
   outline while loading and ASCII rotation on Stats.
4. **Phase 4, device UI:** the menu, TODAY, HABITS with twelve-week graphs, QUOTES with
   him saying them, celebrations, the screensaver and decay, reliable sync, the status
   corner, and nine looks picked in the settings.

**Now**

5. **Phase 5, dashboard:** the real design replacing today's functional prototype, from
   the references in `inspiration/`: the node-graph interface, typography, dither,
   motion and the 3D Kael'thos. Installing it on the phone already works (step 4).

**Next**

6. **Phase 6, reader:** books on the card, chapter jumps, saved progress, highlights
   picked and annotated on the web, Kael'thos reading in the corner.
7. **Phase 7, the Vigil:** built. Sits on the device with its sounds, the ascent on the
   web. Still to check on the hardware: the speaker (tests 9 and 10).
8. **Phase 8, the Academy:** built. Exam dates will follow once u:find posts them.
9. **Phase 9, workout tracker:** weights and cardio. Details to come.

**Open along the way:** the Bloodborne and Halloween skins (phase 4b, planned); check the
latest firmware on the hardware (sync speed, the
charging bolt, the looks); the RESURRECTION ritual (for now any session wakes him);
upgrade Node to 22+, which removes three workarounds. Audio is only the meditation chimes.
