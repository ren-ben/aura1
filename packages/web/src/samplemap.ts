// The demo's one lecture map, written the way the real ones are: Newton's
// laws, for the first weeks of Experimentalphysik 1.
import type { Deeper, LectureMap } from '@aura/shared';

export const SAMPLE_MAP: LectureMap = {
  title: "Newton's three laws",
  scene: 'spring',
  hook: 'Pull a tablecloth fast enough and the plates stay where they are. The cloth moved. Why did the plates not come with it?',
  core: 'Things keep doing what they were already doing. A force does not keep something moving; it changes how it moves, and the more mass (Masse) there is, the less a given push changes it. And no push comes alone: whatever you push, pushes you back just as hard. That is three sentences, and with them you can predict the orbit of the moon.',
  questions: [
    { q: 'A hockey puck slides across perfect ice. What force keeps it moving?', a: 'None. Nothing is needed to keep it moving; something would be needed to stop it.' },
    { q: 'You push a 2 kg cart with 4 N and nothing else acts on it. What is its acceleration?', a: '$a = F/m = 2\\,\\mathrm{m/s^2}$.' },
    { q: 'A truck hits a fly. Which feels the bigger force?', a: 'Neither: the forces are equal and opposite. The fly just has far less mass to resist with.' },
    { q: 'You are in a lift that is accelerating upward. Does the scale show more or less than your weight?', a: 'More. The floor has to push you up harder than gravity pulls you down.' },
    { q: 'Is "inertia" (Trägheit) a force?', a: 'No. It is the tendency to keep the motion you have; mass is its measure.' },
  ],
  outline: [
    'Inertia and the first law: motion needs no cause, change of motion does',
    'Momentum (Impuls) $p = mv$ and force as its rate of change',
    'The second law, $F = ma$, and what mass means',
    'Actio = reactio: forces come in pairs, on different bodies',
    'Free-body diagrams and a first worked problem',
    'Inertial frames (Inertialsysteme), and where the laws stop working',
  ],
  terms: [
    { term: 'inertia (Trägheit)', meaning: 'the refusal of a body to change the motion it has' },
    { term: 'mass (Masse)', meaning: 'how much push it takes to change that motion' },
    { term: 'force (Kraft)', meaning: 'whatever changes a motion; measured by the change it makes' },
    { term: 'momentum (Impuls)', meaning: 'mass times velocity: the amount of motion, the thing a force changes' },
    { term: 'inertial frame (Inertialsystem)', meaning: 'a point of view that is not itself accelerating, where the first law holds' },
    { term: 'free-body diagram', meaning: 'one body, cut free, with every force on it drawn as an arrow' },
  ],
  equations: [
    { tex: '\\vec F = \\frac{d\\vec p}{dt} = m\\,\\vec a', says: 'the net force is how fast the momentum changes; for a fixed mass, mass times acceleration' },
    { tex: '\\vec F_{12} = -\\vec F_{21}', says: 'the force of 1 on 2 is equal and opposite to the force of 2 on 1' },
    { tex: '\\sum \\vec F = 0 \\iff \\vec v = \\text{const}', says: 'no net force, no change in velocity: the first law as a special case of the second' },
  ],
  pictures: [
    { title: 'a ball thrown up', expr: '4*x - 4.9*x^2', from: 0, to: 0.82, caption: 'Its height over time. Gravity takes velocity away at a steady rate, so the curve is a parabola.' },
    { title: 'a mass on a spring', expr: 'cos(3*x - 2*t)', from: 0, to: 6, caption: 'Where $F = -kx$ leads when you let $F = ma$ run: an oscillation.' },
  ],
  worked: {
    problem: 'A 5 kg box is pulled across a smooth floor by a rope at 30 degrees above the horizontal, with 20 N. How fast does it accelerate?',
    steps: [
      'Draw the box alone: the rope pulling up and forward, gravity down, the floor pushing up.',
      'Only the horizontal part of the rope moves it along: $F_x = 20\\cos 30^\\circ \\approx 17.3\\,\\mathrm{N}$.',
      'The vertical forces cancel (the box does not leave the floor), so they do not enter.',
      'Second law along the floor: $a = F_x/m = 17.3/5$.',
    ],
    answer: '$a \\approx 3.5\\,\\mathrm{m/s^2}$ along the floor.',
  },
  traps: [
    { wrong: 'A moving thing needs a force to keep it moving.', right: 'It needs a force only to speed up, slow down or turn. Friction is why daily life fools you.' },
    { wrong: 'Action and reaction cancel, so nothing can ever accelerate.', right: 'They act on different bodies. Only forces on the same body can cancel.' },
    { wrong: 'Heavier things have more inertia, so they fall slower.', right: 'Gravity pulls harder on them in exactly the same proportion. Everything falls alike.' },
  ],
  refresh: [
    { topic: 'Vectors', why: 'forces add as arrows, not as numbers' },
    { topic: 'Sine and cosine', why: 'to split a slanted force into its parts' },
    { topic: 'Derivatives', why: 'acceleration is the derivative of velocity, force the derivative of momentum' },
  ],
  further: [
    { title: 'The Feynman Lectures on Physics, Vol. I, ch. 9: Newton\'s Laws of Dynamics', url: 'https://www.feynmanlectures.caltech.edu/I_09.html', note: 'the laws, done properly and with pleasure' },
    { title: 'Newtonsche Gesetze (Wikipedia)', url: 'https://de.wikipedia.org/wiki/Newtonsche_Gesetze', note: 'the German names, as your lecture will use them' },
    { title: 'MIT 8.01, Classical Mechanics', url: 'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/', note: 'lectures and problem sets with solutions' },
  ],
};

export const SAMPLE_DEEPER: Deeper = {
  nodes: [
    { title: 'Why the plates stay', text: 'Friction had only a split second to act. A small force for a short time is a small change of momentum, $\\Delta p = F\\,\\Delta t$. Too small to matter.' },
    { title: 'The same law, the other way', tex: '\\Delta p = F\\,\\Delta t', text: 'This is why airbags work: the same change in momentum, spread over a longer time, needs a smaller force.' },
  ],
};
