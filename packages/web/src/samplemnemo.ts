// Mnemosyne in the demo: the first term as it might stand in week three, kept
// in memory, scheduled by a rough likeness of FSRS.
import type { MnemosyneDto, TopicDto } from '@aura/shared';

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();
// When a topic would come back for each answer: a miss shrinks its
// stability, a pass grows it, the more so the more it had faded.
function nextOf(stability: number, last: number): [number, number, number, number] {
  const faded = Math.min(1, Math.max(0, (Date.now() - last) / DAY / Math.max(1, stability)));
  return [Math.max(1, stability * 0.28), stability * 1.25 * (1 + faded * 0.2), stability * 2.3 * (1 + faded * 0.3), stability * 3.7 * (1 + faded * 0.4)];
}
function schedule(t: TopicDto, stability: number, last: number) {
  Object.assign(t, { learned: true, stability, lastReview: iso(last), due: iso(last + Math.round(stability) * DAY) });
  t.next = nextOf(stability, last).map((d) => iso(Date.now() + Math.round(d) * DAY)) as TopicDto['next'];
}

type Seed = [title: string, x: number, y: number, stability: number, daysAgo: number, reps: number, points?: string[]];
const SEEDS: Record<string, { name: string; ground: number; at: [number, number]; topics: Seed[] }> = {
  ana: { name: 'Analysis 1', ground: 1, at: [-160, -90], topics: [
    ['Field axioms', -820, -400, 8, 5, 3, ['Two operations $+$ and $\\cdot$, each associative and commutative', 'Neutral elements $0 \\ne 1$; inverses, but no $0^{-1}$', 'Distributive law ties them: $a(b+c)=ab+ac$', '$\\mathbb{Z}_2$ is a field, $\\mathbb{Z}$ is not: no $2^{-1}$']],
    ['Absolute value', -630, -430, 4, 6, 3, ['$|x| = x$ for $x \\ge 0$, else $-x$', '$|xy| = |x|\\,|y|$', '$|x| \\le a \\iff -a \\le x \\le a$', 'Distance $d(x,y) = |x-y|$']],
    ['Triangle inequality', -440, -390, 3, 8, 3, ['$|x+y| \\le |x| + |y|$', 'Reverse form: $\\big||x|-|y|\\big| \\le |x-y|$', 'Equality exactly when $xy \\ge 0$']],
    ['p-norm', -240, -440, 5, 2, 2, ['$\\|x\\|_p = \\left(\\sum |x_i|^p\\right)^{1/p}$', 'Unit balls grow with $p$: diamond, circle, square']],
    ['Supremum and completeness', -760, -230, 2.2, 1, 1, ['Least upper bound', 'Every bounded nonempty set has a sup in $\\mathbb{R}$', '$\\sqrt{2}$ shows $\\mathbb{Q}$ is not complete']],
    ['Sequences and convergence', -520, -220, 0, 0, 0],
    ['Cauchy sequences', -290, -250, 0, 0, 0],
    ['Image and preimage', -830, -40, 12, 3, 3, ['$f(A) = \\{f(a) : a \\in A\\}$', '$f^{-1}(B) = \\{x : f(x) \\in B\\}$ exists for every $f$']],
    ['Injective', -650, -100, 10, 4, 3, ['$f(x) = f(y) \\Rightarrow x = y$', 'Strictly monotone implies injective']],
    ['Surjective', -640, 20, 8, 7, 2, ['Every $y$ of the codomain is hit', 'Depends on the codomain']],
    ['Inverse function', -440, 0, 3, 9, 2, ['Exists exactly when $f$ is bijective', '$f^{-1}$ is not $1/f$']],
  ] },
  la: { name: 'Lineare Algebra 1', ground: 2, at: [70, -110], topics: [
    ['Groups', 170, -430, 6, 2, 2, ['One associative operation', 'Neutral element and inverses']],
    ['Vector spaces', 340, -410, 4, 3, 2, ['An abelian group $(V,+)$ with scalars from a field', 'Two distributive laws']],
    ['Subspaces', 540, -440, 2, 3, 1, ['Contains $0$', 'Closed under $+$ and scalar multiples']],
    ['Linear independence', 390, -250, 1.2, 1, 1, ['Only the trivial combination gives $0$']],
    ['Basis and dimension', 580, -230, 0, 0, 0],
  ] },
  ep: { name: 'Experimentalphysik 1', ground: 3, at: [300, -20], topics: [
    ['Units and dimensions', 880, -440, 14, 4, 3, ['SI base units', 'Check every result by its dimension']],
    ['Kinematics in 1D', 1180, -520, 7, 4, 2, ['$v = \\dot{x}$, $a = \\dot{v}$', 'Constant $a$: $x = x_0 + v_0 t + \\tfrac{1}{2} a t^2$']],
    ['Vectors in kinematics', 1380, -380, 3, 5, 2, ['Motion splits into independent components', 'Speed is $|\\vec{v}|$']],
    ["Newton's laws", 940, -20, 2, 1, 1, ['$\\vec{F} = \\dot{\\vec{p}}$', 'Actio = reactio, on different bodies']],
    ['Work and energy', 1360, 40, 0, 0, 0],
  ] },
  rm: { name: 'Rechenmethoden', ground: 0, at: [70, 120], topics: [
    ['Derivative rules', 170, 110, 16, 5, 3, ["Product: $(fg)' = f'g + fg'$", "Chain: $(f \\circ g)' = f'(g)\\,g'$"]],
    ['Taylor series', 350, 150, 3, 10, 3, ['$f(x) = \\sum f^{(n)}(a)(x-a)^n / n!$', '$e^x$, $\\sin$, $\\cos$ by heart']],
    ["Euler's formula", 540, 110, 5, 6, 2, ['$e^{i\\varphi} = \\cos\\varphi + i\\sin\\varphi$', '$e^{i\\pi} + 1 = 0$']],
    ['Complex numbers', 600, 290, 11, 6, 3, ['$z = a + ib$, $i^2 = -1$', 'Polar form $z = r e^{i\\varphi}$']],
    ['Dot and cross product', 320, 440, 9, 8, 3, ['$\\vec{a}\\cdot\\vec{b} = |a||b|\\cos\\theta$', 'Cross product: right-hand rule']],
  ] },
};
const LINKS: [string, string][] = [['Field axioms', 'Absolute value'], ['Absolute value', 'Triangle inequality'], ['Triangle inequality', 'p-norm'], ['Field axioms', 'Supremum and completeness'],
  ['Supremum and completeness', 'Sequences and convergence'], ['Sequences and convergence', 'Cauchy sequences'], ['Injective', 'Inverse function'], ['Surjective', 'Inverse function'],
  ['Field axioms', 'Vector spaces'], ['Groups', 'Vector spaces'], ['Vector spaces', 'Subspaces'], ['Vector spaces', 'Linear independence'], ['Linear independence', 'Basis and dimension'],
  ['Kinematics in 1D', 'Vectors in kinematics'], ["Kinematics in 1D", "Newton's laws"], ["Newton's laws", 'Work and energy'], ['Dot and cross product', 'Vectors in kinematics'],
  ['Derivative rules', 'Taylor series'], ['Taylor series', "Euler's formula"], ['Complex numbers', "Euler's formula"]];

const HUB_LINKS: [string, string][] = [['Mechanics', 'Kinematics'], ['Mechanics', 'Dynamics'], ['Mechanics', 'Units and dimensions'],
  ['Kinematics', 'Kinematics in 1D'], ['Kinematics', 'Vectors in kinematics'], ['Dynamics', "Newton's laws"], ['Dynamics', 'Work and energy']];
let next = 1;
function seed(): MnemosyneDto {
  const out: MnemosyneDto = { groups: [], topics: [], links: [] };
  for (const s of Object.values(SEEDS)) {
    const g = { id: next++, name: s.name, ground: s.ground };
    out.groups.push(g);
    for (const [title, x, y, stability, ago, reps, points = []] of s.topics) {
      const t: TopicDto = { id: next++, groupId: g.id, title, points, hub: false, x: x + s.at[0], y: y + s.at[1], learned: false, stability: 0, lastReview: null, due: null, reps, lapses: reps > 2 ? 1 : 0, next: null };
      if (stability) schedule(t, stability, Date.now() - ago * DAY);
      out.topics.push(t);
    }
  }
  // Hubs: Mechanics holds Kinematics and Dynamics, and each of those its
  // own topics.
  const ep = out.groups.find((g) => g.name === 'Experimentalphysik 1')!;
  for (const [title, x, y] of [['Mechanics', 1360, -230], ['Kinematics', 1530, -380], ['Dynamics', 1460, -40]] as const) {
    out.topics.push({ id: next++, groupId: ep.id, title, points: [], hub: true, x, y, learned: false, stability: 0, lastReview: null, due: null, reps: 0, lapses: 0, next: null });
  }
  const id = (title: string) => out.topics.find((t) => t.title === title)!.id;
  out.links = [...LINKS, ...HUB_LINKS].map(([a, b]) => ({ id: next++, from: id(a), to: id(b) }));
  return out;
}
let map: MnemosyneDto | null = null;

export function mnemoDemo(method: string, seg: string[], body: any): unknown {
  map ??= seed();
  const m = map, id = Number(seg[2]);
  const topic = m.topics.find((t) => t.id === id);
  const dry = () => { m.groups = m.groups.filter((g) => m.topics.some((t) => t.groupId === g.id)); };
  if (seg[1] === 'topics') {
    if (method === 'GET') return structuredClone(m);
    if (method === 'POST' && seg[2] === 'place') { for (const p of body.topics) Object.assign(m.topics.find((t) => t.id === p.id) ?? {}, p); dry(); return; }
    if (method === 'POST' && seg[3] === 'review' && topic) {
      const nexts = topic.learned ? nextOf(topic.stability, Date.parse(topic.lastReview!)) : [1, 1.3, 2.3, 8.3];
      if (body.rating === 1) topic.lapses++;
      topic.reps++;
      schedule(topic, nexts[body.rating - 1]!, Date.now());
      return structuredClone(topic);
    }
    if (method === 'POST') {
      const t: TopicDto = { id: next++, groupId: body.groupId, title: body.title, points: body.points ?? [], hub: false, x: body.x, y: body.y, learned: false, stability: 0, lastReview: null, due: null, reps: 0, lapses: 0, next: null };
      m.topics.push(t);
      return structuredClone(t);
    }
    if (method === 'PATCH' && topic) { Object.assign(topic, body); return structuredClone(topic); }
    if (method === 'DELETE') { m.topics = m.topics.filter((t) => t.id !== id); m.links = m.links.filter((l) => l.from !== id && l.to !== id); dry(); return; }
  }
  if (seg[1] === 'topic-groups') {
    if (method === 'POST') { const g = { id: next++, name: body.name, ground: 0 }; m.groups.push(g); for (const t of m.topics) if (body.topicIds.includes(t.id)) t.groupId = g.id; dry(); return { ...g }; }
    if (method === 'PATCH') { Object.assign(m.groups.find((g) => g.id === id) ?? {}, body); return; }
    if (method === 'DELETE') { m.groups = m.groups.filter((g) => g.id !== id); for (const t of m.topics) if (t.groupId === id) t.groupId = null; return; }
  }
  if (seg[1] === 'topic-links') {
    if (method === 'POST') { const l = { id: next++, from: body.from, to: body.to }; m.links.push(l); return { ...l }; }
    if (method === 'DELETE') { m.links = m.links.filter((l) => l.id !== id); return; }
  }
  return undefined;
}
