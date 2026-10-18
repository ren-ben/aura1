# Mnemosyne: the map of everything learned

An overlay in the Academy: one endless map of every topic, entered by hand
(no AI), that shows at a glance what is learned and what is fading, and runs
spaced repetition on it. Design picked from
https://claude.ai/artifact/3XPhFrc76ts9goTAUs8LYd (material I, ink).

## What it is

- **Topics** are drops on dark water, placed anywhere. A topic has a title
  and key points (one per line, `$maths$` allowed).
- **Groups** are liquid pools. A pool is the sum of soft wells round its
  topics (a Gaussian per topic, cut at 0.5), so it has no edges of its own:
  it forms itself round its members. Drag a topic and its liquid flows with
  it; once its edge meets another pool it joins that group live, and has to
  be pulled a little further to come away (surface tension). A topic in no
  group keeps its own drop; loose drops pool with each other. A group with
  no topics left is removed.
- **The indicator** is the liquid itself. A topic's well is as wide as it is
  held (`46 + 74 q²` units, q = recall stretched over 60-100%), so a held
  topic sits deep in its pool and a fading one draws back to a lone drop.
  Due topics send out slow ripples. A topic not yet learned is a small bead.
- **Links** ("builds on") are faint curves; drag from one topic to another
  with the link tool or alt.
- **Hubs** (added on request): a toggle in a topic's settings. A hub is never
  recalled and holds every topic linked to it; between two hubs the link's
  from end holds the other, so hubs nest. Each hub draws a membrane (a wider
  well round everything it holds plus a tapered tendril from each member to
  it) with a dark channel and a fine line at its edge, nested membranes
  inside each other. Links to a hub show as the membrane, not as threads.
  Dragging a hub carries its subtree. Hubs stay out of the counts, the held
  average and every recall queue.
- **Overview**: wheel or pinch to zoom, drag to pan with a little momentum,
  names fade in as you come closer (what is fading keeps its name longest),
  group names stay above their pools. Choose an area with shift-drag, the
  right button, the area tool, or the Apple Pencil: focus on it, recall it,
  or make it a group.

## The recall

The student picked each step:

1. The topic's name and an hourglass of five minutes. The writing happens
   outside the app, on paper or in Notability.
2. "Done writing" reveals the key points as a checklist; tick what is on the
   page. Under 50% suggests again, under 75% hard, under 100% good, all of
   it easy. The student confirms or overrides; each button shows when the
   topic would come back.
3. The sheet steps aside and the map answers on that topic (a ring of light;
   its pool swells back), then the next one.

A topic's clock starts only when it is marked learned (a first "good").
"Recall what is fading" takes every due topic, most faded first.

## Scheduling

FSRS through ts-fsrs, the same as the own decks, with `enable_short_term`
off: topics come back in days, never minutes. Desired retention stays 0.9,
so a topic is due when its recall reaches 90%. The card is kept whole as
JSON, its due date beside it. The web draws recall live from stability and
the last review with FSRS-6's curve and ts-fsrs's default decay (0.1542).

## Data

`topic_groups` (name, ground 0-5), `topics` (group, title, points, x, y,
fsrs, due), `topic_links` (from, to). Routes under `/academy/topics`,
`/academy/topic-groups`, `/academy/topic-links`; one `place` route saves
positions and membership after any drag.

## Look

The ink material: pools are dotted tone with a fine contour, dithered to
the two inks in one shader (`mnemosyne.ts`), everything else crisp. Six
grounds per group: still, deep, ripple, drift, grain, pale. Chrome is pills
and soft panels, no corners. Kael'thos sits in a round plate and speaks of
Lethe and the pool of memory.

Not built (left out on purpose): XP for recalls, a forecast, the device.
