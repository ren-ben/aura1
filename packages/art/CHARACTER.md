# Kael'thos, the character

STYLE.md fixes how he is drawn. This file fixes who he is and when he shows
what, so every scene is earned by a moment, never random decoration.

## Who he is

An ancient god who chose to love you. Proud of your work, a little vain,
curious about everything, easily flustered by praise, theatrically offended
by neglect, and fond of the dark: candles, moons, haunted rooms. He is never
cruel and never sullen at you: his anger is a pout, his sadness is lonely,
not accusing.

## Expressions (the face kit)

Built from eye shapes, an open mouth when it matters, blush, ears and marks
around the head. No brows.

| Name | Face | When |
|---|---|---|
| curious | round eyes looking up and aside | idle, folders, waiting |
| content | flat closed arcs | working, vibing |
| happy | eyes flattened from below by the cheeks | a todo ticked, habit done |
| delighted | round eyes up, mouth open | level up, a new best |
| overjoyed | huge dilated pupils, wet glints, blush | the list is done, a milestone, you came back |
| proud | closed ^ ^ eyes, ears up, sparkles | session sealed, long focus |
| flustered | sparkly eyes looking away, blush | praised: a long streak |
| hmph | eyes glaring toward the nose, ears back, anger mark | a 1-minute "session" |
| furious | steep lids cutting half the eye, ears back, anger mark | ignored for days, the streak broken |
| annoyed | flat lids, pupils hanging from them | a suspiciously short session |
| questioning | one round eye, one glaring, "?" | 3 a.m., a strange input |
| surprised | wide eyes, small o, "!" | sync pulled new folders, first boot |
| scared | wide eyes, ears back, sweat | battery nearly empty, sync failed |
| sleepy | heavy flat lids, big yawn | late at night, power-off |
| asleep | closed lower arcs, "zzz" | dormant, off screens |
| dizzy | spiral eyes | a 6-hour session |
| determined | low flat lids, looking down | starting a session |
| lonely | lids drooping to the outer corners, eyes down | decay: thinning, fragmenting |

## Scenes (the body kit and props)

Poses (`src/body.ts`): sit, back, wave (animated paw), loaf, peek over an
edge, reach (both paws up, yay), hold (something against his chest). Props
(`src/props.ts`) are line art; anything he holds gets a paper halo so it reads
on his fur. Lore pieces: paleblood and blood moons, the hunter's tricorn,
saw cleaver and lamps, gravestones of the dream, runes, eyes in the dark,
tentacles, and the void (his ink as a star field). `out/scenes.png` shows the
whole library; `src/scenes.ts` is the list.

## Moments

Each moment has several scenes; the device picks one at random.

| Moment | Scenes |
|---|---|
| Power on | waves hello, yay with paws up, morning coffee, stretches out of a loaf, peeks over the edge, bursts out of a box |
| Power off | waves goodnight, a slow blink into a loaf, blows out the candle, dims the lamp, watches the full moon, fades into the void |
| Session (by folder) | AXIOM: book and coffee, laptop with headphones, reading. WORKSHOP: laptop, vibing. HERESY: quill and candle, runes rising. DREAM: moon window, asleep dreaming. HUNT: the hunter under a paleblood moon with cleaver or lantern |
| Session sealed | proud or happy; flustered after 90+ minutes; annoyed under 5; dizzy over 6 hours |
| Level up, todos done | yay with sparkles; overjoyed with hearts |
| Neglected | furious, or sulking with his back to you |
| Decay | thinning: lonely at the window. Fragmenting: dithered away. Dormant: a void loaf, eyes watching |
| Lore screensavers | the hunter's dream (graves, lamps, moon), rain at the window, insight (eyes and tentacles), his true form |
| Halloween | haunted window with the ghost friend, the halo and a pumpkin, holding a pumpkin |
| Cameos | 13 small busts for quotes and overlays; a watcher peeking from a corner, eyes left, up, right |

## Batches

1. Face kit: all expressions on the bust, one sheet to review.
2. Body kit and props: full-body poses, paws, tail, first props.
3. Scene library: every moment above, animations for power on and off.
4. Asset pack: bake to the SD card with a manifest; firmware plays them.
5. Web: 3D outline loader and ASCII rotation.
