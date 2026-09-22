// What Kael'thos says on the console: picked from how the day is going, in
// his voice. Ancient, vain, fond of you, and never a greeting card.
import { state, today, todayTodos } from './store';

type Line = { when: () => boolean; say: () => string };

const hoursToday = () => today.value.minutes / 60;
const words = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][Math.floor(n)] ?? String(Math.floor(n));
const streakOf = (name: string) => {
  const h = state.habits.find((x) => x.name === name);
  if (!h) return 0;
  const done = new Set(h.done);
  let n = 0;
  const d = new Date();
  if (!done.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (done.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)) { n++; d.setDate(d.getDate() - 1); }
  return n;
};
const best = () => [...state.habits].map((h) => [h.name, streakOf(h.name)] as const).sort((a, b) => b[1] - a[1])[0];
const toNext = () => (state.stats ? state.stats.bond.nextLevelXp - state.stats.bond.xp : 0);

const LINES: Line[] = [
  { when: () => state.stats?.form === 'thinning', say: () => 'My edges have gone grey since yesterday. One hour, unbroken, before you sleep. I am not asking twice.' },
  { when: () => state.stats?.form === 'fragmenting', say: () => 'I am coming apart in places you have no names for. Sit down. Open anything. Give me the first ten minutes and I will do the rest.' },
  { when: () => hoursToday() >= 4, say: () => `${words(hoursToday())} hours. A star collapsed somewhere in Andromeda while you worked and I did not look away from you once.` },
  { when: () => hoursToday() >= 2, say: () => `${words(hoursToday())} hours and some. The horizon felt that. Do it again tomorrow and it will start to flinch when you open a session.` },
  { when: () => hoursToday() > 0 && hoursToday() < 1, say: () => 'A start. I have been fed by empires for less. Now give me the part where you forget the clock exists.' },
  { when: () => hoursToday() === 0 && new Date().getHours() < 12, say: () => 'The day has not been written yet. I have waited eons for things; I am not waiting on you past noon.' },
  { when: () => hoursToday() === 0, say: () => 'Nothing yet today. I can hear the silence from here, and here is very far away.' },
  { when: () => (best()?.[1] ?? 0) >= 10, say: () => `${best()![1]} days of ${best()![0]} without a gap. The monks of Byrgenwerth managed nine before they started hearing me.` },
  { when: () => toNext() > 0 && toNext() < 200, say: () => `${toNext()} insight to the next bond. I can already taste it. So can you, if you are honest.` },
  { when: () => todayTodos.value.length > 0 && todayTodos.value.every((t) => t.done), say: () => 'The whole list, done. Amygdala built a cage out of copper and fear. You built a list and kept it. Only one of those ever held me.' },
  { when: () => true, say: () => 'Name one other mind on this planet that holds mathematics and art at the same time without dropping either. I checked. There are none worth the pact.' },
  { when: () => true, say: () => 'I have outlived languages that had a word for me. You are the first to use it like a friend would.' },
];

export function hisWord(): string {
  const fitting = LINES.filter((l) => l.when());
  // The first that fits is the truest; the general ones rotate by the day.
  const specific = fitting.filter((l) => LINES.indexOf(l) < LINES.length - 2);
  if (specific.length) return specific[0]!.say();
  return fitting[new Date().getDate() % fitting.length]!.say();
}
