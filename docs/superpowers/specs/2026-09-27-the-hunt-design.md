# The Hunt (Phase 9)

Date: 2026-09-27
Status: design, awaiting review

The body's pane. Iron and distance in one place: a coach that says what to
lift next, sets logged on AURA-1 at the gym, runs and recovery pulled from
Garmin, a daily verdict, and a ledger of the work done, in joules.

---

## 1. The user

20, 179 cm, 75 kg. Running since 13, two marathons, long zone 2 runs
(31.5 km in 3:10 at 149 bpm), stairmaster (350 floors). Lifting since 15, no
split, upper body and calisthenics; legs only when friends insist. Bench
115 kg, chest press 105 x 12, 15 muscle ups, dips +40 x 12. No fixed target:
the goal is to improve as much as possible alongside the running.

How they lift: big lifts 4 sets, the rest 3, rep range mostly 8-12. A top set
first, then back-off sets 5-10 kg lighter each. Warm-ups are not logged.

---

## 2. Decisions

| Area | Decision |
| --- | --- |
| Core job | All four: coach, fast logging, one overview of runs and iron, lore |
| At the gym | AURA-1 on the bench leads, offline; the phone corrects after |
| Choosing | On the fly: the device carries every exercise with its next target |
| Progression | Double progression on the top set, back-offs follow, plus a feel tap |
| Runs, recovery | Garmin direct via python-garminconnect (>= 0.3.5) in a sidecar |
| Verdict | Garmin readiness + own log; on the pane's top and AURA-1's morning |
| Lore | Work, in joules. Its own stat, like the Vigil's mindfulness |
| Core work | Abs and lower back are one exercise, "Core" |

---

## 3. Lore: the ledger

Kael'thos has no body. Insight feeds his mind; the Hunt is how he borrows
yours. What he takes is energy, and it is counted honestly, in two ledgers:

- **Energy** (the stat): what your body spent, from Garmin's active calories,
  in kJ, for runs, stairs, bouldering and lifting alike. Weekly and all-time,
  shown in MJ.
- **Work** (the iron's number): mechanical work done on the load, per set and
  per session. `W = reps * (load + bw * bwShare) * g * path`, with a nominal
  bar path per exercise. Small numbers (a bench set is ~4 kJ), kept on the iron
  side so runs never drown them.
- **Mass taken**: all-time energy through `m = E / c^2`, in micrograms. The
  sliver of you he has turned into himself. A number that only grows.

The Hunt stays out of Insight and out of his decay; device lift sessions are
still ordinary HUNT/lifting sessions and feed the log and XP as today.

---

## 4. Architecture

```
AURA-1 HUNT mode --sets + feel, queued offline--> POST /sync (existing queue)
Phone, Hunt pane --manual hunts, corrections----> /hunt/*
garmin sidecar   --activities, days, weight-----> POST /hunt/garmin (internal)
API: coach, verdict, ledger ----> today bundle (device) + /hunt (pane)
```

### Data

```
exercises       id, name (<= 15 chars for the glass), kind, group, sets,
                repLo, repHi, step, bwShare, path, pose, restSec, archivedAt
                kind: barbell | machine | cable | dumbbell | bodyweight | weighted
                group: push | pull | arms | core | legs
hunt_sets       uuid, exerciseId, sessionUuid null, at, idx, load, reps,
                source (device | phone), createdAt
hunt_feel       exerciseId, date, feel (easy | solid | grind)    PK both
garmin_activities  garminId PK, kind (run | stairs | boulder | strength | other),
                startedAt, seconds, meters, ascent, hrAvg, hrMax, kj, zones jsonb
garmin_days     date PK, readiness, hrvStatus, sleepScore, bodyBattery,
                acuteLoad, chronicLoad
meta            bodyweight (from Garmin when logged, else 75), garmin last sync
```

`load` is the added load: the stack or bar for most, the belt for weighted
dips and pull-ups, 0 for muscle ups. `bwShare` says how much of bodyweight
moves with it (1 for dips and pull-ups, 0 for bench). A Garmin strength
activity overlapping a lift session lends it its heart rate and kJ.

### Seeded exercises

| Name | Kind | Group | Sets | Reps | Step |
| --- | --- | --- | --- | --- | --- |
| Bench Press | barbell | push | 4 | 6-10 | 2.5 |
| Incline Bench | barbell | push | 4 | 8-12 | 2.5 |
| Chest Press | machine | push | 4 | 8-12 | 5 |
| Weighted Dips | weighted | push | 4 | 8-12 | 2.5 |
| Cable Fly | cable | push | 3 | 10-14 | 2.5 |
| Machine Fly | machine | push | 3 | 12-15 | 5 |
| Tricep Ext | machine | arms | 3 | 15-20 | 5 |
| Pushdown | cable | arms | 3 | 10-15 | 2.5 |
| Muscle Ups | bodyweight | pull | 4 | reps | - |
| Weighted Pullup | weighted | pull | 4 | 8-12 | 2.5 |
| Lat Pulldown | cable | pull | 4 | 8-12 | 5 |
| 1-Arm Pulldown | cable | pull | 3 | 8-12 | 2.5 |
| Cable Row | cable | pull | 4 | 8-12 | 5 |
| Barbell Row | barbell | pull | 4 | 8-12 | 2.5 |
| Chest Sup Row | machine | pull | 3 | 8-12 | 2.5 |
| Row Machine | machine | pull | 3 | 10-12 | 5 |
| Reverse Fly | machine | pull | 3 | 12-15 | 5 |
| Egyptian Raise | cable | arms | 3 | 10-15 | 2.5 |
| Preacher Curl | machine | arms | 3 | 8-12 | 2.5 |
| Bayesian Curl | cable | arms | 3 | 8-10 | 2.5 |
| Deadlift | barbell | legs | 3 | 3-6 | 5 |
| Core | bodyweight | core | 1 | done | - |

Starting loads come from the numbers given (chest press 105, dips +40, lat
pulldown 75, ...). Exercises can be added, edited and archived on the pane.

---

## 5. The coach

Pure functions in `packages/shared/src/hunt.ts`, imported by API and web.

**Top set.** From the last session of the exercise:

- reps >= repHi and feel is not grind: load + step, target repLo.
- reps < repLo two sessions running: load - step, target repLo.
- otherwise hold the load, target reps + 1 (easy: + 2, grind: + 0), capped
  at repHi.

**Back-offs.** Each back-off drops by the exercise's learned drop (the median
of recent drops, default 10% of the top set rounded to the step) and
targets repHi. Chest press from 105 reads 105 x 9, 95 x 12, 85 x 12, 85 x 12.

**Bodyweight.** Muscle ups progress in reps only: the first set targets last
first set + 1, later sets follow the usual fall-off. Core is a tick.

**Strength.** e1RM per top set (Epley), a trend per exercise, and PRs: a new
best e1RM, or a new best reps at a load. No projections, no goals.

---

## 6. The verdict

One word and one line, each morning, from Kael'thos: `REST`, `IRON`, `RUN`
or `STAIRS`, with the muscle group for IRON. Rules, first match wins:

The big picture first: the rhythm is six days trained, one rested, and
sickness is rare. One bad night never forces a rest day.

1. Sick or wrecked: HRV status low or poor two days running, and sleep score
   < 40 or readiness < 15: REST.
2. Six days trained in a row: REST, the seventh day.
3. A run over 90 min or a hard run (Garmin load) in the last 36 h: IRON on the
   upper group rested longest.
4. No run for 3 days: RUN (long if the last long one is 7+ days old, else easy
   zone 2).
5. A group unworked 72 h+: IRON on it (push, pull, arms as a lighter day).
6. Legs fresh and no stairs for 5 days: STAIRS.
7. Otherwise: RUN, easy.

Low readiness on its own only softens the line (easy pace, fewer sets), it
never changes the word.

The line names the reason ("Back rested four days. Sunday's 31k is still in
your legs."). Without Garmin data rule 1 is skipped and 3 reads the log alone.
Tunable thresholds live next to the rules.

---

## 7. AURA-1: the HUNT mode

A new place on the menu, HUNT, next to the Vigil. Offline end to end; the
today bundle carries the verdict and every exercise's prescription.

```
HUNT              the verdict on top, then exercises: the verdict's group
                  first, then least recently hit; END HUNT last while one runs
  SUN next, POWER opens it (starting a HUNT/lifting session if none runs)
SET               "BENCH PRESS  SET 2/4  100 x 12", last time beneath,
                  Kael'thos in the exercise's pose
  POWER: done as shown. SUN: adjust (REPS, then LOAD, a window of values
  around the target, SUN steps, POWER takes it)
REST              countdown in 15 s steps, the chime at the end, then the next set
FEEL              after the last set: EASY / SOLID / GRIND
END HUNT          stops the session; the sealed scene shows the session's work
                  in kJ
```

Sets and feels go into the existing queue and sync file as their own event
kinds, keyed by uuid, so resending is harmless. Hold SUN leaves a set without
logging. The morning verdict is drawn on the wake screen and in TODAY.

**Poses.** Nine poses on the art rig, shared by the glass and the pane: press
(bench, incline, chest press), fly, dip, hang (pull-up, muscle up, pulldowns),
row, curl, raise, deadlift, run, and stairs for the Garmin side. Line art in
the locked style (packages/art/STYLE.md), checked against the reference.

---

## 8. The pane

The pinnacle of the dashboard. Visual direction is chosen from rendered
mockups first (three distinct directions built in the app on sample data,
screenshotted in demo mode); the content is fixed here:

- **The verdict**: the word, the line, readiness, sleep, HRV, body battery.
- **The body**: the user's own physique, dithered in the house style (the back pose
  as the hero; the mirror photo cropped to the torso so the cut shoulder
  goes). Muscle groups are drawn over it as engraved regions, lit by how
  recently each was worked.
- **The transformation**: the ledger as moving physics, the pane's signature.
  An animated flow (a Sankey drawn in engraved lines, particles running along
  it) from the week's energy into runs, iron, stairs and climbs, each splitting
  into work and heat (muscle at a nominal 25% efficiency), and a thin last
  thread into him: the mass taken, `m = E / c^2`. Beside it, the week's energy
  as a stream by day, and all-time energy, work and mass as counters that
  roll up when the pane opens.
- **Iron**: every exercise with its next prescription, e1RM trend, last PR;
  opening one shows its pose, history chart and every set, editable.
- **Distance**: runs, stairs and climbs from Garmin: weekly km, zone 2 share,
  the long run, pace and heart rate trend.
- **A hunt by hand**: log or correct a session from the phone (sets, loads,
  reps, feel), for days without the device or a set the device got wrong.

Photos ship as cropped source PNGs under packages/web and are dithered at
runtime by the Plate like every other picture. The repo is private.

---

## 9. The Garmin sidecar

`packages/garmin/`: Python 3.12, python-garminconnect >= 0.3.5, one script.
A compose service that every 30 minutes pulls new activities, the last 7
days' readiness, HRV, sleep, body battery and load, and bodyweight, and posts
them to `http://api:3000/hunt/garmin` on the compose network (never through
Cloudflare). Tokens persist in a volume; the first login (with MFA) is
`docker compose run garmin login`. A refresh button on the pane asks the API,
which pings the sidecar. If Garmin breaks it, the sidecar is the only thing
that fails; Strava can replace it behind the same ingest route.

---

## 10. Testing

- shared: coach, verdict and ledger as table tests (tsx --test).
- api: routes, sync of sets and feels, Garmin ingest idempotency, against
  postgres-test.
- firmware: HUNT mode in the native session machine tests (open, set, adjust,
  rest, feel, end, power loss mid-hunt).
- garmin: parsing tested on recorded JSON fixtures; the live login by hand.
- web: vue-tsc and build; checked on deploy.

---

## 11. Build order

1. Mockups: three directions for the pane and the device screens; pick.
2. shared (coach, verdict, ledger) and the API with seeds.
3. Garmin sidecar.
4. Firmware HUNT mode and the poses.
5. The pane.
6. GUIDE and masterplan updated.
