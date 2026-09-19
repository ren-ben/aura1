// Kael'thos, as a parts rig. One flat silhouette plus marks: two eyes, a nose,
// whiskers. Poses pick part variants; skins add overlay parts. Everything the
// device and the web show is composed from here, so the two cannot drift.
//
// Units: a 400 x 400 canvas. The device bakes at 200, so no shape may be
// thinner than 6 units here (3 px on the device).

export const SIZE = 400;

export const POSES = ['idle', 'focused'] as const;
export type Pose = (typeof POSES)[number];

export const SKINS = ['default', 'halo'] as const;
export type Skin = (typeof SKINS)[number];

// ink: the silhouette. paper: eyes, nose, and the gaps that separate
// accessories from the body.
export type Palette = { ink: string; paper: string; background?: string };
export const DEVICE_PALETTE: Palette = { ink: '#000', paper: '#fff', background: '#fff' };

// Tall ears, round head, a neck that flares into the body and runs off the
// bottom edge, after the Jiji references in inspiration/.
export const BODY_PATH = [
  'M 92 400',
  'C 108 338, 146 298, 156 270',
  'C 118 262, 100 228, 102 192',
  'C 102 160, 108 138, 116 118',
  'C 116 80, 120 46, 130 24',
  'C 136 14, 146 14, 152 24',
  'C 162 52, 172 90, 178 118',
  'C 192 114, 208 114, 222 118',
  'C 228 90, 238 52, 248 24',
  'C 254 14, 264 14, 270 24',
  'C 280 46, 284 80, 284 118',
  'C 292 138, 298 160, 298 192',
  'C 300 228, 282 262, 244 270',
  'C 254 298, 292 338, 308 400',
  'Z',
].join(' ');

type Eye = { cx: number; cy: number };
export const EYES: [Eye, Eye] = [{ cx: 156, cy: 198 }, { cx: 244, cy: 198 }];
export const EYE_RX = 35;
export const EYE_RY = 26;

// How far the lid comes down (0 open, 1 shut) and where the pupils sit,
// relative to the eye centre. Pupils are mirrored for the right eye.
type Face = { lid: number; pupilDx: number; pupilDy: number };
const FACES: Record<Pose, Face> = {
  // Half-lidded and unimpressed: an ancient god, bored of mortals.
  idle: { lid: 0.5, pupilDx: 4, pupilDy: 2 },
  // Eyes lowered to the work.
  focused: { lid: 0.42, pupilDx: 2, pupilDy: 9 },
};

const f = (n: number) => Number(n.toFixed(1));

function eye({ cx, cy }: Eye, face: Face, mirror: boolean, p: Palette): string {
  const dx = mirror ? -face.pupilDx : face.pupilDx;
  const lidY = cy - EYE_RY + 2 * EYE_RY * face.lid;
  // The lid is ink over the top of the eye, so the eye reads as cut from the head.
  return [
    `<ellipse cx="${cx}" cy="${cy}" rx="${EYE_RX}" ry="${EYE_RY}" fill="${p.paper}"/>`,
    `<ellipse cx="${f(cx + dx)}" cy="${f(cy + face.pupilDy)}" rx="8" ry="13" fill="${p.ink}"/>`,
    `<rect x="${cx - EYE_RX - 4}" y="${cy - EYE_RY - 4}" width="${2 * EYE_RX + 8}" height="${f(lidY - (cy - EYE_RY - 4))}" fill="${p.ink}"/>`,
  ].join('');
}

const NOSE = 'M 193 222 Q 200 218 207 222 Q 204 229 200 230 Q 196 229 193 222 Z';

// Tapered filled shapes, never hairlines: 8 units at the root, 6 at the tip.
function whisker(rootX: number, rootY: number, tipX: number, tipY: number): string {
  const len = Math.hypot(tipX - rootX, tipY - rootY);
  const nx = -(tipY - rootY) / len;
  const ny = (tipX - rootX) / len;
  const pts = [
    [rootX + nx * 4, rootY + ny * 4], [tipX + nx * 3, tipY + ny * 3],
    [tipX - nx * 3, tipY - ny * 3], [rootX - nx * 4, rootY - ny * 4],
  ];
  return `M ${pts.map(([x, y]) => `${f(x!)} ${f(y!)}`).join(' L ')} Z`;
}

const WHISKERS = [
  whisker(120, 222, 40, 206), whisker(120, 234, 36, 236), whisker(120, 246, 44, 266),
  whisker(280, 222, 360, 206), whisker(280, 234, 364, 236), whisker(280, 246, 356, 266),
];

// Over-ear headphones: a band across the crown and a cup on each side. The
// paper outline separates them from the silhouette.
function headphones(p: Palette): string {
  const band = 'M 100 190 C 96 120, 140 104, 200 104 C 260 104, 304 120, 300 190';
  const cup = (x: number) => `<rect x="${x}" y="168" width="36" height="60" rx="14" fill="${p.ink}" stroke="${p.paper}" stroke-width="7"/>`;
  return [
    `<path d="${band}" fill="none" stroke="${p.paper}" stroke-width="26" stroke-linecap="round"/>`,
    `<path d="${band}" fill="none" stroke="${p.ink}" stroke-width="12" stroke-linecap="round"/>`,
    cup(82), cup(282),
  ].join('');
}

// Astrolabe halo: an orbit behind the ears, with three bodies on it.
function halo(p: Palette): string {
  const orbs = [[88, 96], [312, 96], [200, 64]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${p.ink}"/>`).join('');
  return [
    `<ellipse cx="200" cy="96" rx="112" ry="32" fill="none" stroke="${p.ink}" stroke-width="7"/>`,
    orbs,
    `<path d="M 200 8 L 205 20 L 217 22 L 207 30 L 210 42 L 200 35 L 190 42 L 193 30 L 183 22 L 195 20 Z" fill="${p.ink}"/>`,
  ].join('');
}

export function compose(pose: Pose, skin: Skin, p: Palette = DEVICE_PALETTE): string {
  const face = FACES[pose];
  const parts = [
    p.background ? `<rect width="${SIZE}" height="${SIZE}" fill="${p.background}"/>` : '',
    skin === 'halo' ? halo(p) : '',
    `<path d="${WHISKERS.join(' ')}" fill="${p.ink}"/>`,
    `<path d="${BODY_PATH}" fill="${p.ink}"/>`,
    eye(EYES[0], face, false, p),
    eye(EYES[1], face, true, p),
    `<path d="${NOSE}" fill="${p.paper}"/>`,
    pose === 'focused' ? headphones(p) : '',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
