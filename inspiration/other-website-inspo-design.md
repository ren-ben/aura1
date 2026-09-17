# DESIGN.md – AMYGDALA INC

This document defines the visual design principles, tokens, and interaction patterns for the
AMYGDALA INC dashboard. All frontend work should conform to this design system.

The visual language is called **Dead Channel**. It is analog horror and ARG: one bit deep,
pixel-gridded, dithered, and hard-edged. It replaces the former Pastel Nocturne language entirely.

The lore does not change. Signals, Wings, Operations, Telemetry, Anomalies, and the Propagation
Index keep their names and meanings. Only the register of the terminal changes.

**In-universe justification.** The console renders at one bit because anything with a modern
rendering pipeline lets things through. The display stack is deliberately impoverished as a
containment measure. The ugliness is the point.

---

## Design Pillars

1. **One Bit, No Mercy**
   - Only `#000000` and `#FFFFFF` exist as inks. Every grey is a dither pattern, never a colour
     value.
   - Zero border-radius, zero blur, zero soft shadows, zero colour gradients. A gradient may be
     used as a **mask** — where it modulates dither density rather than becoming a colour — and
     nowhere else.
   - Depth comes from 1px hard offset blocks and pattern density.

2. **Red Means Bleed**
   - `#E02B2B` is the only non-monochrome ink in the system.
   - Reserved for Anomalies, destructive actions, and the seal's aperture.
   - If red is on screen, something is wrong or something is alive.

3. **Everything Is A Scan**
   - No image enters the interface undithered: photographs, scraped thumbnails, the operator
     portrait, icons, the seal.
   - If it cannot be dithered, it is not shown.

4. **Machine Motion Steps, Matter Motion Glides**
   - Anything the terminal redraws in place is quantised with `steps()`.
   - Anything that travels through space keeps weighted easing.

5. **Diegetic Immersion**
   - The UI is part of the story: naming, copy, and micro-interactions reinforce the AMYGDALA INC
     fiction.
   - Roleplay is heavy. It should feel like operating salvaged, air-gapped hardware that is barely
     holding something back.

---

## Colour System

### Inks

Exactly three values are legal anywhere in the stylesheet.

| Token | Value | Use |
| --- | --- | --- |
| `--ink-void` | `#000000` | Ground, and the only background fill |
| `--ink-bone` | `#FFFFFF` | All text, borders, and marks |
| `--ink-signal` | `#E02B2B` | Anomalies, destructive actions, the seal aperture |

`#E02B2B` is carried over from the former `accent-ember` so the red is continuous with what is
already built.

### Tones

Intermediate values are patterns, not colours: ordered-dither tiles, Bayer 4x4, rendered at 2px
cell size and consumed as `background-image` or `mask-image`.

| Token | Density |
| --- | --- |
| `--tone-12` | 12.5% bone on void |
| `--tone-25` | 25% |
| `--tone-50` | 50% checkerboard |
| `--tone-75` | 75% |

**Tones never go behind text, and never onto a glyph.** Both were tried and both failed in
practice. A tile behind body copy puts bone dots at the same luminance as the glyphs and the text
loses; masking an 11px glyph with a tile eats a quarter of its pixels and leaves it dotty. Since
11px is the floor for the display face, a masked glyph has no legible size to fall back to.

Tones are therefore for non-text surfaces only: title-bar stripes, meters, bands, the vignette,
the ID card's holographic strip. Panels and insets are solid `--ink-void`.

Secondary text is full `--ink-bone`, and hierarchy is carried by case, size, and typographic
marks instead — `text-meta` sets 11px uppercase at 0.14em, meta rows read as `// REPLIES 57`, and
labels take brackets. There is no dim grey in one bit, so nothing is dimmed.

### Enforcement

A unit test lints the compiled stylesheet and fails on any colour literal outside the three legal
inks, plus `transparent` and `currentColor`. The single exemption is the Cartography's opus stage
token file (see Second Register).

### Usage Rules

- The viewport background is always `--ink-void`. There is no elevated surface colour; elevation is
  expressed by border and offset block, not by fill.
- Panels and cards are void-filled with a 1px bone border.
- Use `--ink-signal` for Anomalies and destructive actions only. Never as a large fill.
- Tonal fills (`--tone-12`, `--tone-25`) express hover and inset states.

---

## Typography

### Typefaces

- **Display and chrome:** Departure Mono, self-hosted woff2, SIL Open Font License. A monospaced
  pixel font. Used for headings, navigation, labels, buttons, meta rows, the ambient log, and the
  ID card. Rendered with font smoothing disabled (`-webkit-font-smoothing: none`,
  `font-smooth: never`); `image-rendering: pixelated` applies to dithered canvases and sprites, not
  to text.
- **Body and data:** a crisp standard monospace (JetBrains Mono, falling back to the system
  monospace stack) for Signal descriptions, dossier prose, the Manual, and dense data tables.

The old-style serif display face is removed from the application shell. It survives only inside the
Cartography plate.

### Scale

Departure Mono is pixel-perfect only at integer multiples of 11px. Legal display sizes are
therefore **11, 22, 33, and 44** and no others. No fractional scaling, and no `em`-derived sizes
that land off the grid.

- `h1` (Screen Title): 33px
- `h2` (Section Header): 22px
- Chrome, labels, meta, buttons: 11px
- Body copy (standard monospace, not Departure): 14–16px, unconstrained by the pixel grid

11px is the floor for chrome. Anything that would need to be smaller is shortened or promoted
instead. Long-form legibility is served by the standard monospace face at readable sizes, not by
shrinking the pixel font.

Rubrics stay uppercase and letterspaced at 0.14em. The former 0.28em disintegrates a pixel font
into unrelated marks.

### Rules

- Keep line length between 60–80 characters for readable text blocks.
- Use the pixel face for: designations, labels, buttons, navigation, meta rows, the ambient log.
- Use the standard monospace for: Operation IDs, log entry bodies, timestamps, dossier prose.

---

## Layout & Responsiveness

### Grid

- Base spacing unit: **4px**. Every dimension is an integer.
- Borders are exactly 1px, hard.
- Line heights are integer multiples of the type size so the baseline grid stays on whole pixels.

### Breakpoints

Mobile-first, unchanged:

- `sm`: 640px (phones)
- `md`: 768px (small tablets)
- `lg`: 1024px (iPad landscape, small desktops)
- `xl`: 1280px (large desktops)

### Layout Patterns

- **Root Shell Layout**
  - Persistent nav with the main sections: Dashboard, Signals, Operations, Wings, Telemetry,
    Personnel, Settings.
  - Content area caps its width so text does not run long; the chrome stays full-bleed.

- **Mobile (sm)**
  - Single-column vertical layout.
  - Bottom nav for key views.
  - Slide-out drawer for secondary filters.

- **Tablet (md–lg)**
  - Two-column master-detail: lists left, detail right.

- **Desktop (lg–xl)**
  - Navigation, primary content, and a context panel.

---

## Imagery: The Dither Pipeline

Four asset tiers. Only the first is load-bearing.

### Tier 1 – The dither core

`apps/web/src/lib/dither/` exports a dependency-free pure function:

```
ditherImageData(imageData, { matrix, threshold, invert }) -> ImageData
```

No DOM access, no canvas dependency, unit-tested against fixture pixel arrays. This module is
written in-house and never vendored; the entire visual language rests on it.

`<DitherImage>` wraps it:

1. Load the source image.
2. **Downsample to a target pixel grid first** (approximately 160px wide). Dithering a
   full-resolution photograph produces noise, not a 1-bit image. This step is not optional.
3. Apply the Bayer 8x8 matrix.
4. Paint to canvas and upscale with `image-rendering: pixelated`.
5. Memoise by `(src, targetWidth, matrix)`.

**Cross-origin images.** Canvas pixel readback taints on cross-origin sources and `getImageData`
throws, so scraped thumbnails cannot be dithered client-side. Remote images are routed through the
API image proxy (`GET /media/proxy?url=`), which re-serves them same-origin behind a host
allowlist, a size cap, a timeout, content-type validation, and an on-disk cache on the mounted
volume. The SVG-filter approximation (posterize plus dither mask) is retained only as the failure
and no-JS fallback.

### Tier 2 – Sprites

Hand-authored 1-bit assets committed as SVG with integer path coordinates: folder icons (closed,
open, full), skull, house, seal stamp, barcode, redaction bars, window chrome marks. A runtime
dither at 16px smears into mud, which is why these are drawn by hand.

### Tier 3 – WebGL, optional

Selectively vendored from canvasui.dev into `apps/web/src/components/canvas/`, re-tinted to 1-bit:
**VHS** for the ambient bed, **Shatter** for panel transitions, **Particle Reveal** for Signal
reveals. Glass and Liquid are not used; they are glossy and in the wrong register.

Every Tier 3 component is guarded against `prefers-reduced-motion`, missing WebGL support, and the
`lowPower` setting. **Nothing in Tier 3 may be required to understand any screen.**

### Tier 4 – ASCII

ASCII art is a material, not decoration.

- **`<BoxRule>`** — box-drawing dividers, corner joints, doubled rules for emphasis. Replaces the
  retired `ArchDivider`.
- **`<AsciiPlate>`** — a per-view banner: an eye for Dashboard, a well for Signals, a skull for
  Anomalies, a mast for Telemetry, a tome for Manual, a card for Personnel, an empty room for the
  void state. Each closes on a line of in-universe copy.
  - Drawn as **outline, not density fill.** Dense glyphs read as bright on a void ground, so a
    filled shape becomes a lamp rather than a subject.
  - Padded to its own widest line only, never to a shared column width, and clipped rather than
    scrolled. A scrollbar across a plate breaks the illusion that it is printed on the console.
  - Hidden below `lg`, where it cannot fit without wrapping. Marked `aria-hidden` with the real
    designation adjacent.
- **`<AsciiMeter>`** — the Propagation Index as `[========--] 78 // LORE PILLAR`. Colour-independent
  by construction.
- Empty states pair a drawn ASCII void with the lore line, rather than replacing the copy.

---

## Components

### Cards & Panels

- Void fill, 1px bone border, radius 0.
- Wear `WindowFrame`: a title bar carrying a `--tone-50` stripe pattern, a designation, and
  collapse/close marks.
- Hover: border holds, fill shifts to `--tone-12`. No transform.
- Selected: 1px offset block in bone, or `--ink-signal` where the card is an Anomaly.

### Buttons

- 1px hard border, 1px offset block shadow that **collapses on press**, `--tone-25` fill on hover.
- Destructive: border and label in `--ink-signal`.
- Disabled: `--tone-25` mask over the label, no offset block.
- No radius, no transform, no glow.

### Inputs

- 1px inset border, `--tone-12` fill, blinking block caret.
- Focus: 1px hard bone outline at 1px offset.

### Modals

- Hard-edged window over a dither backdrop. Never a blur.

### Badges & Tags

- Bracketed: `[FOLKLORE]`, `[LORE PILLAR]`.

### Navigation

- Active item marked by a filled block glyph and inverted fill, not by tint.

### Wings & Collections

- A folder grid of `FolderIcon`s with closed, open, and full states, plus a grid/list toggle.

---

## Motion & Interaction

Two systems, with a rule that decides between them rather than taste.

**Machine motion — `steps()`.** Anything the terminal redraws in place: state flips, counters,
glyph swaps, boot text, row refresh, decode reveals, glitch, the holographic strip. Quantised, 4px
increments, no sub-pixel drift.

**Matter motion — weighted easing.** Anything that travels through space: panel slides, modals,
drawers, Kanban card drops, Cartography node settling, window drag.

- Standard transitions: `cubic-bezier(0.22, 0.61, 0.36, 1)`
- Heavier transitions (panels, modals): `cubic-bezier(0.33, 0, 0.2, 1)`

### Durations

- Micro-interactions (hover, tap): 120–160ms
- Panel transitions: 180–240ms
- Kanban card drops: ~200ms

### Guidelines

- Animate transform and opacity where possible; avoid width and height.
- Under `prefers-reduced-motion`, both systems degrade to instant state changes or simple fades, the
  ambient bed goes inert, and every Tier 3 effect is disabled.

---

## Glitch

An ambient bed plus event-driven corruption.

**Ambient:** 1px row jitter, dither shimmer, slow scanline drift. Low enough to stop being noticed,
present enough that the screen is never dead still.

**Diegetic:** a `useGlitch(event)` composable fired by real causes, never randomly:

- A new Anomaly tears the view header.
- A failed scrape corrupts its own Telemetry row.
- A `lore_pillar` Propagation score flashes the plate.

Both die entirely under `prefers-reduced-motion`.

---

## Horror & Roleplay Elements

### The Bed

A single pointer-inert overlay over the whole viewport, in three layers:

- **Scanlines.** 1px of bone every 4px, held at ~7% by element opacity. Static. A drifting bed
  reads as a moving pattern rather than as a screen, which is why the earlier checkerboard drift
  was removed.
- **Vignette.** An ordered-dither falloff: `--tone-50` intersected with a radial mask, so the
  edges gain void dots rather than a grey ramp. The console never quite reaches its corners.
- **Beam sweep.** One faint band crossing top to bottom over nine seconds, in `steps(30)`. The
  only moving element on the layer, and it is disabled under reduced motion.

### The Rails

Above 1600px the shell is flanked by two fixed instrument rails, 176px each, pointer-inert and
`aria-hidden`. They carry the organisation and department set vertically, a tick scale, a drifting
bearing and depth readout that never resolves, the clearance mark, and struck tone bands.

The left rail carries a **dithered solid**: a torus software-rendered to a luminance buffer, run
through the same `ditherImageData` core as every other image, and repainted at roughly 12fps. It
is a specimen turning under observation, and it reuses the dither core rather than introducing a
second imaging path. It holds still under reduced motion.

The breakpoint is derived, not chosen: 1600 = 1248 shell + 176 rail on each side, so the rails
appear only once they can sit beside the content without either one moving.

### Visual Motifs
- **The mandorla**, drawn as `PixelSeal`: the almond aperture of a cathedral tympanum, which is also
  what "amygdala" means. Redrawn as an integer pixel path with a Bayer-filled aperture. It is the
  organisation's seal and appears as the nav mark, the boot glyph, the loading state, and the
  embossed stamp on the operator's ID.
- Box-drawn rules and ASCII plates carry structure where the gothic arch used to.
- Dithered imagery: skulls, houses, thresholds, scanned documents.

### Undocumented Behaviour

The console contains a small number of concealed responses. They are never load-bearing, never
block a workflow, and are all disabled under `prefers-reduced-motion` where they involve motion.
Discovering one should feel like the interface noticing you, not like a feature.

### Copy & Labeling

Unchanged. Use AMYGDALA INC flavour — Signals, Operations, Wings, Telemetry, Anomalies, Propagation
Index — while keeping function legible. Prefer "Ingest Signal" to "Create".

### Ambient Elements

A console log panel at the edge of the screen, in the standard monospace under a `--tone-75` mask:

- `[03:21:44] TELEMETRY // Subreddit r/UnresolvedMysteries emitted 3 new candidates.`
- `[03:24:02] ANOMALY // Propagation Index threshold exceeded.`

---

## Personnel File

The `/personnel` view is the set piece of the visual language.

An `IdCard` carries a dithered operator portrait, the operator designation and clearance tier,
issue and expiry dates, a `BarcodeStrip` encoding the operator id, an embossed `PixelSeal`, and a
holographic strip drawn as a slowly cycling dither pattern (stepped, inert under reduced motion).
Beside it sit a service record and a folder grid: COMMENDATIONS, INCIDENTS, ASSIGNMENTS.

Every number on the certification is real. Counts come from `GET /operator/profile`, and the
clearance tier is derived by a pure, deterministic `deriveClearance(stats)` module with its weights
in one config object, in the same shape as the Propagation Index scorer. No field is fabricated at
render time.

---

## Second Register: The Cartography

Phases 7A–7C retain their engraved alchemical plate language in full — the ouroboros vessel, the
astrological aspect glyphs, the opus stages, the tria prima. This is deliberate. The plate reads as
a found artifact from an older filing system, reached through the 1-bit chrome, and the contrast
between the two registers is the point.

Boundary constraints:

- The plate is entered through Dead Channel chrome. Its containing window, controls, filters, and
  detail panel are 1-bit.
- The plate's opus colour tokens are the single sanctioned exception to the three-ink rule, and the
  token linter exempts exactly that token file and nothing else.
- The serif display face is loaded only within the plate.

---

## Accessibility

- Contrast is pure bone on pure void, exceeding WCAG AA everywhere. Tone-masked text is the one risk
  area, which is why the mask is dropped below 11px.
- Focus indicators are a 1px hard bone outline at 1px offset, never a glow.
- State is never signalled by colour alone: `AsciiMeter` and bracketed badges carry state as text.
- `prefers-reduced-motion` disables the ambient bed, all glitch, the holographic strip, and every
  Tier 3 effect.
- ASCII art is `aria-hidden` and always paired with a real text label.

---

## Mobile & iPad Experience

- **Mobile:** prioritise Anomalies, Signals, and the Operation Board. Complex views degrade to
  simplified forms (the pipeline as a segmented control plus list rather than drag-and-drop).
  Tier 3 effects default off below `md`.
- **iPad:** split-view for list and detail. The Operation Board stays fully interactive in
  landscape.

---

## Implementation Notes

- Implement tokens as CSS variables named exactly as above.
- Build the primitive component library (Button, Card, Panel, WindowFrame, Tag, Badge, Tooltip,
  Modal, Input) against those tokens.
- When creating new UI, always:
  - Use tokens rather than colour literals; the linter test enforces this.
  - Keep every dimension on the 4px grid and every pixel-face size on the 11px grid.
  - Apply the correct motion system for the kind of movement.
  - Route every image through `<DitherImage>`.

---

## Reference from Claude.md

AMYGDALA INC's Claude.md treats this file as the single source of truth for all visual decisions.
When generating or updating UI code, Claude Code should use the tokens defined here, apply the
Dead Channel language and motion systems, and maintain the heavy roleplay tone while preserving
usability.

If a conflict arises between existing styles and this document, prefer updating styles to align
with DESIGN.md unless explicitly instructed otherwise.

The full design rationale, rejected alternatives, and risks are recorded in
`docs/superpowers/specs/2026-08-16-dead-channel-arg-redesign-design.md`.
