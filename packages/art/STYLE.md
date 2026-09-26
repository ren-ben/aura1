# Kael'thos style

The locked look, reached over many rounds of review. `src/rig.ts` is the
source of truth; this file says why it looks that way, so new poses and skins
stay on-model. Units are the 400 x 400 rig canvas.

Reference: `inspiration/reference-jiji.png` (proportions), `ghibli*` (mood,
line quality), `ghibli7` (headphones). Every bake writes `out/compare.png`:
the reference beside idle and focused. Check it before showing anyone a change.

## Construction

| Part | Rule | Value |
|---|---|---|
| Head | A bun: superellipse, domed on top, tapering cheeks below | `a 102`, top `b 90 n 2.2`, bottom `b 64 n 2.0`, centre `(200, 226)` |
| Head width | Only as wide as the eyes need; eyes sit close to the edges | ~204 wide, ~154 tall |
| Ears | Separate triangles laid over the head, never part of its outline | each ~3/4 the head's height below, base ~40% of its width |
| Crown | Narrow gap between the ears | ~20 units |
| Ear openings | Derived from each ear's outer edge, set in by a thin rim of skin | rim 5, width 2.5 to 14.5, thin at the tip, widest low down |
| Eyes | Taller than wide, the cleanest-drawn thing on the face | `rx 24 ry 31`, wobble 0.7, pupils `10 x 16` |
| Eye height | Bottom of the eyes a third of the way up the head | eye centre `y 208` |
| Nose | A tiny white dash, level with the lower half of the eyes | `6 x 3` at `y 230` |
| Whiskers | Three a side, rooted inside the cheek, arcing out and drooping; short and fine | 80% of the drawn length, tapered 5.2 to 3 |
| Neck | ~45% of head width, top tucked well inside the head | only the sides emerge under the chin |
| Body | Gentle flare, runs off the bottom edge (bust) | |
| Full body | Slim neck like Jiji's (about 40% of the head's width), the head is the star at 0.66 scale. Usually turned a little: a straight chest to the near paw, the haunch rounding out toward the tail, one paper line between them. Sometimes square to us: a slim bell. The tail's root always hides inside the haunch | neck `(200, 246)`, floor `y 392` |
| Pose | Head tilts 4-5 degrees; the gaze goes aside | |

## Line

- Drawn, not constructed. Every outline gets a seeded wobble (head 1.8, ears
  1.2, body 2.2, eyes 0.7), so it reads as ink and bakes identically.
- Lines are tapered brush strokes. Nothing thinner than ~5 units (the device
  shows the rig at half size).
- Left and right are drawn separately, never mirrored: the right ear sits a
  touch lower.
- Accessories on the fur are white line art. Parts off the silhouette are ink
  with a white rim. Nothing cuts a hard notch into the silhouette.

## Mood

He likes the user. Faces are curious or content, never sullen, lidded,
annoyed or sad.

- Curious (idle): full round eyes, pupils looking up and aside.
- Content (focused): closed eyes as flat, gentle arcs.

## Faces

The face kit (`src/face.ts`, `src/marks.ts`, named in `src/expressions.ts`,
moods in CHARACTER.md). Expression lives in the eye shapes: round, wide,
sparkling, huge dilated pupils, a smile-flattened bottom, closed arcs, a flat
lid (annoyed), a lid slanting to the nose (glare), a steep one for real anger
(fury, angry.jpg), or to the outer corner (forlorn), one eye of each
(questioning). He has no brows. The mouth is absent unless it opens: then it
is a plain white oval low on the face, small when surprised, bigger for a
laugh or a yawn. Blush is three paper strokes per cheek.
Marks (?, !, sweat, anger vein, notes, zzz, sparkles, hearts) are ink on the
paper around him. Ears swing about their base: 12 degrees back for anger and
fear, 4 forward when alert. Check `out/expressions.png` after any change.

## Never

Each of these was tried and rejected:

- Straight head sides (reads as a rounded rectangle), or the same curve top
  and bottom.
- The widest point at the cheeks, a squared-off lower head, or round full
  corners: puffy, fat cheeks.
- A tall head, or a wide neck.
- Ears that flow seamlessly into the head, or ears built into its outline.
- Thick white bars for ear openings, or openings on the ear's very edge.
- A big gap between the eyes and the edge of the face.
- The nose low enough to read as a mouth.
- Heavy lids, a sagging or smiling lower lid on open eyes, a dead-ahead stare.
- Eyebrows of any kind; expression comes from the eye shapes.
- Crescent (smug) eyes, shaped mouths (w, grin, pout), or teeth and tongue
  (reads creepy). A mouth is either absent or a plain white oval.
- Tears together with blush: they collide on the cheek.
- Round ball headphone cups (the cups are side-on ovals), or a band that
  squares the head.
- A tall body, or body detail: leg lines, toes, joints, arms across the
  chest. The body is one plain shape, like the mouth.
- Any pose that hides his face (from behind, looking out of a window).
- Window frames and scattered flowers as set dressing: the night is a moon in
  the corner, the Dream is a bonfire or a dead tree.
- Gravestones (a mess at device size), dense skylines (read as a modern
  city; Yharnam is solid ink like his fur: one cathedral with crocketed needle spires, windows cut in paper, and a chapel spire at the edge).
- A see-through moon: moons are solid discs, so what hangs behind stays behind.
- A moon, window or dithered sky behind his head. Backdrops keep to the
  corners and edges; on busy ones he gets a paper outline.

## Poses

Bust: idle (curious), focused (headphones, content). Full body (`src/body.ts`):
sit, wave, loaf, peek, reach, hold, still (the Vigil: serene face, tail
wrapped round the front of the feet, one ink shape with the body).

Skins: default, astrolabe halo, halloween. Planned: pumpkin-head, blood moon.

Halloween (`inspiration/ghost*.png`): a bedsheet thrown over him. His ink ears
poke up out of the dome, his whiskers out over its sides; the sheet is paper
with an ink rim, a few tapered folds, a loose scalloped hem that hangs plumb
while his head tilts. Two ink holes for eyes, his real eyes inside them, so
every face still reads; nose, mouth and blush turn to ink on the cloth. It
hangs to just above his feet (only his paws and tail show), shorter over a
loaf.
