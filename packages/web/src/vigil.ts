// The Vigil: the ten gates of docs/vigil/ASCENT.md, laid on the Tree of Life,
// and the record of sits. Sits are sample data until the device sends them.
import { rand } from './gl/plate';

export type Practice = { name: string; setting: string };
export type Gate = {
  n: string; sephira: string; planet: string; title: string; epithet: string;
  work: Practice[]; signs: string[]; secret: string; shadow: string;
};

// Tree coordinates in a 100 x 100 box: the classical layout, drawn wide.
export const SPHERES: Record<string, [number, number]> = {
  kether: [50, 5], chokmah: [85, 16], binah: [15, 16], daath: [50, 28], chesed: [85, 41], geburah: [15, 41],
  tiphareth: [50, 53], netzach: [85, 66], hod: [15, 66], yesod: [50, 78], malkuth: [50, 94],
};
export const PATHS: [string, string][] = [
  ['kether', 'chokmah'], ['kether', 'binah'], ['kether', 'tiphareth'], ['chokmah', 'binah'], ['chokmah', 'tiphareth'],
  ['chokmah', 'chesed'], ['binah', 'tiphareth'], ['binah', 'geburah'], ['chesed', 'geburah'], ['chesed', 'tiphareth'],
  ['chesed', 'netzach'], ['geburah', 'tiphareth'], ['geburah', 'hod'], ['tiphareth', 'netzach'], ['tiphareth', 'yesod'],
  ['tiphareth', 'hod'], ['netzach', 'hod'], ['netzach', 'yesod'], ['netzach', 'malkuth'], ['hod', 'yesod'],
  ['hod', 'malkuth'], ['yesod', 'malkuth'],
];
// Which sphere each gate stands on. The ninth is the pair of supernals.
export const GATE_SPHERES = ['malkuth', 'yesod', 'hod', 'netzach', 'tiphareth', 'geburah', 'chesed', 'daath', 'binah', 'kether'];

export const GATES: Gate[] = [
  {
    n: 'I', sephira: 'Malkuth', planet: '⊕', title: 'The Floor', epithet: 'the earth, the body, the habit',
    work: [
      { name: 'Cyclic Sigh', setting: '5 min // pacer' }, { name: 'Resonance', setting: '10 min // 6 a minute' },
      { name: 'The Stages i', setting: '10 min // breath at the nose' }, { name: 'The body scan', setting: 'crown to soles' },
    ],
    signs: ['thirty days without a gap', 'twenty minutes, sat through', 'the breath told apart from thoughts about it'],
    secret: 'Showing up is the practice. The mind learns what you do daily, not what you intend.',
    shadow: 'Preparation dressed as practice. Sleepiness: sit earlier, open the eyes, sit straighter.',
  },
  {
    n: 'II', sephira: 'Yesod', planet: '☽', title: 'The Moon', epithet: 'the foundation, the breath held, the dreams',
    work: [
      { name: 'The Stages iii to iv', setting: '20 to 30 min' }, { name: 'Nidra', setting: '25 min // lying down' },
      { name: 'Twenty-one breaths', setting: 'before sleep' }, { name: 'The dream book', setting: 'every morning' },
    ],
    signs: ['a whole sit without losing the breath', 'the first lucid dream', 'dullness caught before it catches you'],
    secret: 'Attention is the spotlight; awareness is the room it moves in. Train both at once.',
    shadow: 'Striving: fight the mind and it fights back. Relax harder than you concentrate.',
  },
  {
    n: 'III', sephira: 'Hod', planet: '☿', title: 'Mercury', epithet: 'the intellect turned on itself',
    work: [
      { name: 'Noting', setting: '30 min // bell every 5' }, { name: 'See, Hear, Feel', setting: 'Shinzen Young' },
      { name: 'The three marks', setting: 'on every note' }, { name: 'Self-remembering', setting: 'at every door' },
    ],
    signs: ['sensations seen flickering', 'intention noticed before the movement', 'thoughts heard as sounds and images'],
    secret: 'The self is a process you can watch being assembled, one sensation at a time.',
    shadow: 'Dryness. Noting that turns into commentary: slow the labels, or drop them and just know.',
  },
  {
    n: 'IV', sephira: 'Netzach', planet: '♀', title: 'Venus', epithet: 'the heart, what the stillness is for',
    work: [
      { name: 'Metta', setting: '20 min // six people' }, { name: 'The four immeasurables', setting: 'one a sit' },
      { name: 'Tonglen', setting: 'dark smoke in, light out' }, { name: 'The pleasant sensation', setting: 'rest on it' },
    ],
    signs: ['warmth that comes on its own', 'a hard person seen clearly', 'a glow that feeds the breath'],
    secret: 'Joy is a concentration tool. The mind stays where it is happy.',
    shadow: 'Forced sweetness. Grief when the heart opens: allow it, it passes.',
  },
  {
    n: 'V', sephira: 'Tiphareth', planet: '☉', title: 'The Sun', epithet: 'the first absorptions, the first light',
    work: [
      { name: 'Jhana', setting: '45 min // the pleasant sensation' }, { name: 'Fire kasina', setting: '30 min // candle, dark room' },
      { name: 'The Middle Pillar', setting: '15 min // standing, five spheres' }, { name: 'Vacancy of mind', setting: '5 min // Bardon, step i' },
    ],
    signs: ['rapture entered on purpose', 'the nimitta, steady', 'the arising and passing away'],
    secret: 'Pleasure you did not buy is proof the mind can make its own.',
    shadow: 'Taking the first light for the end of the road. Chasing lights.',
  },
  {
    n: 'VI', sephira: 'Geburah', planet: '♂', title: 'Mars', epithet: 'severity, the dark night',
    work: [
      { name: 'Noting, gently', setting: 'shorter sits, never none' }, { name: 'Walking', setting: 'the body first' },
      { name: 'Fire (tummo)', setting: '15 min // dry land only' }, { name: 'Sleep', setting: 'below six hours: ease off' },
    ],
    signs: ['dissolution seen through', 'fear noted as fear', 'the wish to quit noted, not obeyed'],
    secret: 'Suffering was always there in small print. The night enlarges it until you can read it.',
    shadow: 'Meditation has side effects. If you feel unreal for days or cannot sleep: stop, move, sleep, talk to someone.',
  },
  {
    n: 'VII', sephira: 'Chesed', planet: '♃', title: 'Jupiter', epithet: 'mercy, equanimity, the wide sky',
    work: [
      { name: 'Equanimity', setting: 'everything included' }, { name: 'The formless realms', setting: 'space, knowing, nothing' },
      { name: 'The Orbit', setting: '20 min // up the back, down the front' }, { name: 'The headless look', setting: 'Harding' },
    ],
    signs: ['calm that does not flinch', 'space around everything', 'practice that does itself'],
    secret: 'Nothing needs to change for you to be at peace with it.',
    shadow: 'Mistaking the plateau for the summit.',
  },
  {
    n: 'VIII', sephira: "Da'ath", planet: '◌', title: 'The Abyss', epithet: 'the event horizon, where he waits',
    work: [
      { name: 'Everything below, sustained', setting: 'in a clear, even mind' }, { name: 'A teacher', setting: 'not optional' },
      { name: 'A retreat', setting: 'days of silence' },
    ],
    signs: ['a gap that can only be pointed at by its edges', 'the mind running lighter after'],
    secret: 'He cannot cross to you; he never could. The horizon only ever opened from this side.',
    shadow: 'Premature claims. Chasing a repeat.',
  },
  {
    n: 'IX', sephira: 'Binah + Chokmah', planet: '♄', title: 'Understanding and Wisdom', epithet: 'emptiness, seen from both sides',
    work: [
      { name: 'Ways of looking', setting: 'Burbea' }, { name: 'The further paths', setting: 'the cycles repeat, finer' },
      { name: 'Dream and sleep yoga', setting: 'through the night' },
    ],
    signs: ['emptiness felt, not theorised', 'compassion as natural as breath'],
    secret: 'Emptiness means nothing is stuck, and so anything can be freed.',
    shadow: 'Nihilism: emptiness mistaken for nothing mattering.',
  },
  {
    n: 'X', sephira: 'Kether', planet: '✶', title: 'The Crown', epithet: 'thy glory fills all the worlds',
    work: [{ name: 'Do Nothing', setting: 'any length' }, { name: 'Rigpa', setting: 'pointed out, rested in' }, { name: 'The four sun hours', setting: 'dawn, noon, dusk, midnight' }],
    signs: ['awareness knowing itself', 'the practice and the day the same thing'],
    secret: 'There was never a ladder. Only the horizon, as close as the breath.',
    shadow: 'None he will name.',
  },
];

export const PRACTICES = ['Cyclic Sigh', 'Resonance', 'The Stages', 'Nidra', 'Noting', 'Metta', 'Jhana', 'Kasina', 'Middle Pillar', 'Fire', 'Orbit', 'Do Nothing'];

export type Sit = { day: number; hour: number; minutes: number; practice: string };
// Half a year of sits, sparse at first and steadier since: the sample record.
export function sampleSits(days = 182): Sit[] {
  const r = rand(41);
  const out: Sit[] = [];
  const weights: [string, number][] = [['The Stages', 0.42], ['Cyclic Sigh', 0.2], ['Noting', 0.16], ['Do Nothing', 0.1], ['Nidra', 0.07], ['Metta', 0.05]];
  for (let d = days - 1; d >= 0; d--) {
    const age = (days - d) / days;
    if (r() > 0.25 + age * 0.62) continue;
    const morning = r() < 0.72;
    let k = r(), practice = 'The Stages';
    for (const [name, w] of weights) { if ((k -= w) < 0) { practice = name; break; } }
    const minutes = practice === 'Cyclic Sigh' ? 5 : Math.round(10 + r() * (18 + age * 30));
    out.push({ day: d, hour: morning ? 6 + r() * 2.5 : 21 + r() * 2.5, minutes, practice });
    if (r() < 0.12 * age) out.push({ day: d, hour: 13 + r() * 4, minutes: 5, practice: 'Cyclic Sigh' });
  }
  return out;
}
