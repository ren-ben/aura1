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

Poses (`src/body.ts`): sit (turned a little, the usual), front (square to
us, for variety), wave (animated paw), loaf, peek over an edge, reach (both
paws up, yay), hold (something against his chest). The hunter's tricorn is
worn (`wear.hat`) in the Hunter's Dream and on the hunt. Props
(`src/props.ts`) are line art; anything he holds gets a paper halo so it reads
on his fur. Lore pieces: paleblood and blood moons, the hunter's tricorn,
saw cleaver, the dream's white flowers, messengers, Yharnam's cathedral
and chapel in solid ink, Amygdala on the cathedral, the moon with something hanging from it,
the great eye at the window, runes, eyes in the dark, tentacles, and the
void (his ink as a star field, on a dark night). `out/scenes.png` shows the
whole library; `src/scenes.ts` is the list.

Every scene is set in a place: room, desk, window, dream, yharnam, void,
halloween. Each place has its own goodnight and good morning animation; the
device sleeps in the place on the glass and wakes where it fell asleep.

## Moments

Each moment has several scenes; the device picks one at random.

| Moment | Scenes |
|---|---|
| Power on | per place: wakes from a loaf and waves (window, dream, yharnam, void, halloween), startles awake at the desk; in the room: waves hello, yay, morning coffee, stretches, peeks, bursts out of a box |
| Power off | per place: settles into a loaf (the void's eyes close with him), dozes off over the book at the desk; in the room: waves goodnight, a slow blink |
| Session (by folder) | AXIOM: book and coffee, laptop with headphones, reading. WORKSHOP: laptop, vibing. HERESY: quill and candle, runes rising, tentacles reading over his shoulder. DREAM: moon window, asleep dreaming. HUNT: the hunter in Yharnam with the cleaver |
| Session sealed | proud or happy; flustered after 90+ minutes; annoyed under 10 (not logged); dizzy over 6 hours |
| Level up, todos done | yay with sparkles; overjoyed with hearts |
| Neglected | furious, huffy, or furious under a rising blood moon |
| Decay | thinning: lonely at the window. Fragmenting: dithered away. Dormant: a void loaf, eyes watching |
| Lore screensavers | the hunter's dream, the messengers, Yharnam, Amygdala, rain at the window, the eye at the window, insight (eyes and tentacles in the dark), the moon presence, his true form |
| Halloween | haunted window with the ghost friend, the halo and a pumpkin, holding a pumpkin |
| Cameos | 13 small busts for quotes and overlays; a watcher peeking from a corner, eyes left, up, right |

## Batches

1. Face kit: all expressions on the bust, one sheet to review.
2. Body kit and props: full-body poses, paws, tail, first props.
3. Scene library: every moment above, animations for power on and off.
4. Asset pack: bake to the SD card with a manifest; firmware plays them.
5. Web: 3D outline loader and ASCII rotation.
