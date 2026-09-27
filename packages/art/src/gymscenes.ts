// Every exercise of the Hunt, one scene each (see gym.ts for the kit), and
// the three the verdict adds: the jog, the stairs, the rest. Side on where a
// lift reads from the side, facing us where it reads from the front. Facing
// right unless the machine stands on the right.
import { EXPRESSIONS } from './expressions.ts';
import type { Palette } from './rig.ts';
import { huntPose, pose } from './body.ts';
import { barbellFront, bench, cable, dHandle, figure, floor, FLOOR, light, plate, pulley, slab, solid, tower, tube, vHandle } from './gym.ts';
import type { Pt } from './ink.ts';

export type GymScene = { id: string; name: string; draw: (p: Palette) => string };
const E = EXPRESSIONS;

// The legs of a figure standing, feet a little apart, facing right.
const STAND = (hx = 196): { near: Pt[]; far: Pt[] } => ({
  near: [[hx + 6, 306], [hx + 14, 348], [hx + 10, 386]],
  far: [[hx - 6, 308], [hx - 8, 348], [hx - 16, 386]],
});
// Standing, facing us.
const STAND_FRONT = { near: [[214, 328], [222, 358], [226, 386]] as Pt[], far: [[186, 328], [178, 358], [174, 386]] as Pt[] };
const TAIL_R: Pt[] = [[170, 312], [138, 322], [116, 312], [104, 290]];
const TAIL_F: Pt[] = [[222, 350], [262, 366], [290, 352], [300, 324]];
// A frame post and a crossbar, for machines.
const frame = (x0: number, x1: number, top: number, p: Palette) =>
  tube([x0, top], [x0, FLOOR], 14, p) + tube([x1, top], [x1, FLOOR], 14, p) + tube([x0, top], [x1, top], 14, p);
// A dumbbell seen end on: a plate, a handle, and the far plate behind.
const bell = (c: Pt, p: Palette) => plate([c[0] + 6, c[1] - 4], 17, p) + plate(c, 17, p);
// A dip belt: the chain from the hips and a plate hanging from it.
const belt = (hip: Pt, hang: Pt, p: Palette) =>
  `<path d="M${hip[0] - 14} ${hip[1]}Q${hang[0]} ${hang[1] - 8} ${hip[0] + 14} ${hip[1]}" fill="none" stroke="${p.paper}" stroke-width="6"/>`
  + `<path d="M${hip[0] - 14} ${hip[1]}Q${hang[0]} ${hang[1] - 8} ${hip[0] + 14} ${hip[1]}" fill="none" stroke="${p.ink}" stroke-width="3" stroke-dasharray="5 3"/>`
  + plate(hang, 26, p);

export const GYM: GymScene[] = [
  // ---- The road and the stairs ----
  { id: 'jog', name: 'Jogging', draw: (p) => figure({
    // In the flow: leaning into it, both feet off the ground, the front one
    // reaching, the back one just pushed off, arms swinging at ninety.
    hip: [190, 292], shoulder: [216, 230], neck: [222, 224], turn: 8, watch: true,
    arms: { near: [[222, 238], [246, 262], [268, 240]], far: [[212, 238], [188, 262], [168, 252]] },
    legs: { near: [[196, 298], [238, 314], [258, 350]], far: [[184, 302], [160, 334], [118, 348]] },
    tail: [[166, 292], [130, 288], [104, 278], [88, 262]],
  }, E.vowing, p) + floor(p) },
  { id: 'stairs', name: 'Stairmaster', draw: (p) => {
    const steps = 'M150 392 V360 H200 V328 H250 V296 H300 V264 H330 V392 Z';
    return `<path d="${steps}" fill="url(#d50)" stroke="${p.ink}" stroke-width="5" stroke-linejoin="round"/>`
      + tube([336, FLOOR], [336, 176], 16, p) + solid(304, 158, 64, 30, p, 6) + tube([236, 238], [336, 238], 12, p)
      + figure({
        hip: [224, 256], shoulder: [236, 190], neck: [240, 184], turn: 4, watch: true,
        arms: { near: [[242, 198], [266, 224], [292, 236]], far: [[234, 198], [256, 226], [282, 236]] },
        legs: { near: [[230, 262], [264, 270], [262, 292]], far: [[218, 264], [214, 300], [210, 326]] },
        tail: [[200, 262], [170, 270], [150, 258], [140, 236]],
      }, E.vowing, p) + floor(p);
  } },

  { id: 'rest', name: 'Rest', draw: (p) => pose('loaf', E.asleep, p) + floor(p) },

  // ---- Push ----
  { id: 'bench', name: 'Bench Press', draw: (p) =>
    tube([108, FLOOR], [108, 160], 12, p) + solid(96, 190, 30, 10, p, 2)
    + bench([84, 318], [322, 318], p, [[[112, 318], [112, FLOOR]], [[296, 318], [296, FLOOR]]])
    + figure({
      hip: [252, 296], shoulder: [158, 296], neck: [134, 294], turn: -90,
      arms: { near: [[164, 290], [174, 250], [164, 206]], far: [[154, 290], [160, 250], [152, 208]] },
      legs: { near: [[258, 300], [300, 292], [310, 382]], far: [[250, 302], [290, 298], [296, 384]] },
      tail: [[272, 306], [284, 336], [278, 364], [292, 386]],
      held: plate([160, 206], 44, p),
    }, E.vowing, p) + floor(p) },

  { id: 'incline', name: 'Incline Bench', draw: (p) =>
    `<g transform="translate(44 0)">${tube([226, 330], [226, FLOOR], 12, p) + tube([290, 330], [290, FLOOR], 12, p) + tube([150, 262], [196, FLOOR], 12, p)
    + tube([150, 266], [226, 330], 26, p) + tube([226, 330], [296, 330], 26, p)
    + figure({
      hip: [236, 312], shoulder: [156, 236], neck: [140, 224], turn: -30,
      arms: { near: [[162, 232], [190, 204], [178, 158]], far: [[152, 232], [178, 206], [168, 160]] },
      legs: { near: [[242, 314], [294, 304], [302, 384]], far: [[234, 316], [284, 310], [288, 386]] },
      tail: [[252, 326], [262, 352], [256, 374], [268, 390]],
      held: plate([174, 158], 42, p),
    }, E.vowing, p)}</g>` + floor(p) },

  { id: 'chestpress', name: 'Chest Press', draw: (p) =>
    tower(40, 62, 120, p) + tube([130, 214], [286, 262], 10, p)
    + tube([150, 200], [150, 336], 24, p) + tube([150, 340], [244, 340], 22, p) + tube([200, 350], [200, FLOOR], 12, p)
    + figure({
      hip: [188, 322], shoulder: [180, 250], neck: [186, 240], turn: 2,
      arms: { near: [[190, 256], [238, 266], [288, 258]], far: [[182, 256], [230, 268], [280, 262]] },
      legs: { near: [[194, 326], [244, 330], [248, 386]], far: [[186, 328], [236, 334], [238, 388]] },
      tail: [[160, 330], [130, 346], [112, 370], [98, 388]],
      over: light('M280 240h14v38h-14z', p),
    }, E.vowing, p) + floor(p) },

  { id: 'dips', name: 'Weighted Dips', draw: (p) =>
    tube([128, 266], [128, FLOOR], 14, p) + tube([300, 266], [300, FLOOR], 14, p)
    + figure({
      hip: [200, 294], shoulder: [210, 226], neck: [214, 218], turn: 6,
      arms: { near: [[214, 232], [222, 250], [216, 266]], far: [[206, 232], [212, 250], [206, 266]] },
      legs: { near: [[204, 300], [196, 336], [168, 346]], far: [[196, 302], [186, 336], [160, 340]] },
      tail: [[178, 304], [150, 318], [132, 312], [122, 292]],
      held: belt([200, 304], [204, 346], p),
      over: tube([110, 266], [318, 266], 12, p),
    }, E.vowing, p) + floor(p) },

  { id: 'cablefly', name: 'Cable Fly', draw: (p) =>
    tube([24, 60], [24, FLOOR], 14, p) + tube([376, 60], [376, FLOOR], 14, p) + pulley([36, 86], p) + pulley([364, 86], p)
    + cable([36, 86], [108, 250], p) + cable([364, 86], [292, 250], p)
    + figure({
      front: true, hip: [200, 320], shoulder: [200, 262], neck: [200, 246],
      arms: { near: [[222, 262], [262, 262], [292, 252]], far: [[178, 262], [138, 262], [108, 252]] },
      legs: STAND_FRONT, tail: TAIL_F,
      over: dHandle([108, 252], p) + dHandle([292, 252], p),
    }, E.vowing, p) + floor(p) },

  { id: 'machinefly', name: 'Machine Fly', draw: (p) =>
    // The pec deck: the back pad, and the two arm pads his forearms press.
    frame(60, 340, 120, p) + tube([200, 336], [200, FLOOR], 12, p)
    + light('M150 190h100v140h-100z', p, 5) + light('M150 330h100v16h-100z', p, 4)
    + tube([200, 150], [118, 208], 8, p) + tube([200, 150], [282, 208], 8, p) + tube([200, 136], [200, 190], 12, p)
    + figure({
      front: true, hip: [200, 318], shoulder: [200, 262], neck: [200, 246],
      arms: { near: [[222, 262], [276, 264], [282, 222]], far: [[178, 262], [124, 264], [118, 222]] },
      legs: { near: [[214, 326], [226, 352], [228, 388]], far: [[186, 326], [174, 352], [172, 388]] },
      over: light('M270 206h24v74h-24z', p, 4) + light('M106 206h24v74h-24z', p, 4),
    }, E.vowing, p) + floor(p) },
  { id: 'tricep', name: 'Tricep Ext', draw: (p) =>
    // Upper arms level on the pad, elbows at its front; the forearms travel
    // from pointing up to straight ahead.
    tower(318, 60, 120, p) + tube([168, 344], [246, 344], 22, p) + tube([204, 354], [204, FLOOR], 12, p)
    + tube([226, 280], [290, 280], 22, p) + tube([258, 292], [258, FLOOR], 12, p)
    + figure({
      hip: [192, 326], shoulder: [206, 256], neck: [212, 248], turn: 2,
      arms: { near: [[214, 264], [278, 266], [292, 222]], far: [[206, 264], [270, 268], [282, 224]] },
      legs: { near: [[198, 330], [246, 336], [250, 386]], far: [[190, 332], [238, 340], [240, 388]] },
      tail: [[168, 334], [140, 350], [120, 372], [106, 390]],
      over: tube([284, 270], [296, 214], 7, p) + light('M286 206h14v22h-14z', p),
    }, E.vowing, p) + floor(p) },
  { id: 'latpush', name: 'Lat Pushdown', draw: (p) =>
    tower(318, 62, 70, p, [92]) + cable([349, 92], [236, 322], p)
    + figure({
      hip: [178, 302], shoulder: [206, 240], neck: [214, 230], turn: 10,
      arms: { near: [[212, 246], [226, 284], [232, 320]], far: [[204, 246], [216, 286], [222, 322]] },
      legs: { near: [[184, 308], [200, 348], [196, 386]], far: [[172, 310], [182, 350], [170, 386]] },
      tail: [[154, 314], [124, 324], [102, 316], [90, 294]],
      over: `<circle cx="234" cy="322" r="9" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>`,
    }, E.vowing, p) + floor(p) },

  { id: 'muscleup', name: 'Muscle Ups', draw: (p) =>
    tube([26, 120], [26, FLOOR], 14, p) + tube([374, 120], [374, FLOOR], 14, p)
    + figure({
      front: true, hip: [200, 300], shoulder: [200, 240], neck: [200, 226],
      arms: { near: [[222, 240], [240, 276], [244, 312]], far: [[178, 240], [160, 276], [156, 312]] },
      legs: { near: [[212, 308], [220, 344], [214, 378]], far: [[188, 308], [180, 344], [186, 378]] },
      over: tube([20, 314], [380, 314], 12, p),
    }, E.proud, p) },

  { id: 'pullup', name: 'Weighted Pullup', draw: (p) =>
    tube([26, 40], [26, FLOOR], 14, p) + tube([374, 40], [374, FLOOR], 14, p)
    + figure({
      front: true, hip: [200, 342], shoulder: [200, 280], neck: [200, 264],
      arms: { near: [[222, 280], [276, 298], [262, 256]], far: [[178, 280], [124, 298], [138, 256]] },
      legs: { near: [[212, 350], [224, 376], [214, 398]], far: [[188, 350], [176, 376], [186, 398]] },
      over: tube([20, 258], [380, 258], 12, p)
        // The belt's chain, and the plate hanging from it, face on.
        + `<path d="M186 348L200 364L214 348" fill="none" stroke="${p.paper}" stroke-width="7"/><path d="M186 348L200 364L214 348" fill="none" stroke="${p.ink}" stroke-width="3.5" stroke-dasharray="5 3"/>`
        + plate([200, 372], 30, p),
    }, E.vowing, p) },
  { id: 'pulldown', name: 'Lat Pulldown', draw: (p) =>
    tube([64, 30], [64, FLOOR], 14, p) + tube([336, 30], [336, FLOOR], 14, p) + tube([64, 30], [336, 30], 14, p) + pulley([200, 44], p)
    + cable([200, 44], [200, 252], p)
    + solid(150, 332, 100, 16, p) + tube([200, 348], [200, FLOOR], 12, p)
    + figure({
      front: true, hip: [200, 320], shoulder: [200, 262], neck: [200, 246],
      arms: { near: [[222, 262], [262, 294], [286, 254]], far: [[178, 262], [138, 294], [114, 254]] },
      legs: { near: [[214, 328], [228, 356], [230, 388]], far: [[186, 328], [172, 356], [170, 388]] },
      over: tube([80, 254], [320, 254], 9, p) + solid(128, 302, 144, 20, p),
    }, E.vowing, p) + floor(p) },

  { id: 'onearm', name: '1-Arm Pulldown', draw: (p) =>
    tower(322, 62, 50, p, [74]) + cable([353, 74], [238, 244], p)
    + figure({
      hip: [196, 312], shoulder: [206, 246], neck: [212, 236], turn: 2,
      arms: { near: [[214, 252], [236, 290], [238, 246]], far: [[204, 252], [224, 286], [246, 306]] },
      legs: { near: [[202, 316], [250, 318], [252, 386]], far: [[192, 320], [186, 360], [140, 384]] },
      tail: [[170, 322], [140, 340], [112, 350], [96, 336]],
      over: dHandle([238, 244], p),
    }, E.vowing, p) + floor(p) },

  { id: 'cablerow', name: 'Cable Row', draw: (p) =>
    tower(338, 58, 110, p, [300]) + solid(318, 310, 14, 70, p, 3)
    + bench([112, 346], [268, 346], p, [[[140, 346], [140, FLOOR]], [[240, 346], [240, FLOOR]]])
    + cable([367, 300], [238, 292], p)
    + figure({
      hip: [186, 326], shoulder: [192, 256], neck: [196, 248], turn: 2,
      arms: { near: [[200, 262], [168, 288], [230, 292]], far: [[192, 262], [162, 284], [222, 290]] },
      legs: { near: [[192, 332], [262, 318], [314, 344]], far: [[184, 334], [254, 322], [306, 350]] },
      tail: [[160, 336], [126, 352], [104, 372], [92, 390]],
      over: vHandle([232, 292], p),
    }, E.vowing, p) + floor(p) },

  { id: 'bbrow', name: 'Barbell Row', draw: (p) => figure({
    hip: [168, 280], shoulder: [240, 236], neck: [258, 226], turn: 18,
    arms: { near: [[242, 244], [206, 272], [226, 304]], far: [[234, 244], [198, 270], [218, 302]] },
    legs: { near: [[172, 286], [196, 336], [180, 386]], far: [[164, 288], [182, 338], [162, 386]] },
    tail: [[144, 280], [112, 270], [92, 250], [86, 226]],
    held: plate([224, 308], 46, p),
  }, E.vowing, p) + floor(p) },

  { id: 'chestsup', name: 'Chest Sup Row', draw: (p) =>
    tube([150, 356], [276, 250], 24, p) + tube([214, 304], [232, FLOOR], 12, p) + tube([160, 350], [140, FLOOR], 12, p)
    + figure({
      hip: [150, 316], shoulder: [236, 250], neck: [254, 238], turn: 12,
      arms: { near: [[238, 258], [210, 290], [232, 306]], far: [[230, 258], [202, 288], [224, 304]] },
      legs: { near: [[150, 322], [136, 358], [118, 386]], far: [[142, 324], [124, 358], [104, 386]] },
      tail: [[128, 318], [98, 306], [82, 286], [80, 262]],
      over: bell([232, 308], p),
    }, E.vowing, p) + floor(p) },

  { id: 'rowmachine', name: 'Row Machine', draw: (p) =>
    frame(300, 372, 110, p) + tube([316, 140], [300, 262], 10, p) + tube([262, 232], [262, 312], 24, p)
    + tube([146, 336], [226, 336], 22, p) + tube([186, 346], [186, FLOOR], 12, p) + tube([262, 312], [262, FLOOR], 12, p)
    + figure({
      hip: [180, 318], shoulder: [216, 254], neck: [224, 244], turn: 6,
      arms: { near: [[222, 262], [184, 268], [226, 272]], far: [[214, 262], [178, 264], [218, 270]] },
      legs: { near: [[186, 324], [236, 330], [240, 386]], far: [[178, 326], [228, 334], [230, 388]] },
      tail: [[156, 330], [126, 346], [108, 368], [96, 388]],
      over: tube([226, 272], [302, 262], 8, p) + light('M220 256h10v30h-10z', p),
    }, E.vowing, p) + floor(p) },

  { id: 'reversefly', name: 'Reverse Fly', draw: (p) =>
    // Chest to the pad, straight arms swung out level at shoulder height; the
    // handles ride on arms from the post behind him.
    tube([200, 150], [200, FLOOR], 16, p) + tube([200, 252], [74, 252], 9, p) + tube([200, 252], [326, 252], 9, p)
    + tube([200, 336], [200, FLOOR], 12, p) + light('M150 330h100v16h-100z', p, 4)
    + figure({
      front: true, hip: [200, 318], shoulder: [200, 262], neck: [200, 246],
      arms: { near: [[222, 262], [276, 260], [326, 258]], far: [[178, 262], [124, 260], [74, 258]] },
      legs: { near: [[214, 326], [226, 352], [228, 388]], far: [[186, 326], [174, 352], [172, 388]] },
      over: solid(164, 272, 72, 54, p, 10) + light('M320 240h12v34h-12z', p) + light('M68 240h12v34h-12z', p),
    }, E.vowing, p) + floor(p) },
  { id: 'egyptian', name: 'Egyptian Raise', draw: (p) =>
    // Holding the column, leaning away; the far arm raises the cable from the
    // low pulley out to the side.
    tube([116, 90], [116, FLOOR], 18, p) + pulley([130, 368], p) + cable([130, 368], [336, 236], p)
    + figure({
      front: true, hip: [214, 318], shoulder: [228, 258], neck: [230, 244], turn: 14,
      arms: { near: [[250, 258], [296, 244], [338, 236]], far: [[206, 262], [166, 258], [128, 252]] },
      legs: { near: [[226, 326], [240, 358], [246, 386]], far: [[200, 326], [178, 358], [164, 386]] },
      tail: [[236, 348], [274, 364], [302, 350], [312, 322]],
      over: dHandle([338, 236], p),
    }, E.vowing, p) + floor(p) },
  { id: 'preacher', name: 'Preacher Curl', draw: (p) =>
    tube([160, 344], [232, 344], 22, p) + tube([196, 354], [196, FLOOR], 12, p)
    + tube([232, 258], [292, 302], 24, p) + tube([292, 302], [300, FLOOR], 14, p) + tube([290, 304], [262, 250], 8, p)
    + figure({
      hip: [190, 326], shoulder: [214, 262], neck: [220, 252], turn: 4,
      arms: { near: [[220, 268], [280, 296], [264, 250]], far: [[212, 268], [272, 298], [256, 252]] },
      legs: { near: [[196, 330], [240, 336], [244, 386]], far: [[188, 332], [232, 340], [234, 388]] },
      tail: [[166, 334], [138, 350], [118, 372], [104, 390]],
      over: light('M254 238h22v12h-22z', p),
    }, E.vowing, p) + floor(p) },

  { id: 'bayesian', name: 'Bayesian Curl', draw: (p) =>
    tower(20, 58, 90, p, [360]) + cable([49, 360], [158, 302], p)
    + figure({
      hip: [206, 302], shoulder: [216, 234], neck: [222, 226], turn: 4,
      arms: { near: [[218, 240], [186, 274], [160, 300]], far: [[210, 240], [224, 280], [236, 300]] },
      legs: { near: [[212, 308], [236, 346], [240, 386]], far: [[200, 310], [184, 350], [166, 386]] },
      tail: [[182, 312], [152, 324], [132, 316], [122, 296]],
      over: dHandle([158, 300], p),
    }, E.vowing, p) + floor(p) },

  // ---- Legs and core ----
  { id: 'deadlift', name: 'Deadlift', draw: (p) => huntPose('deadlift', E.vowing, p) },

  { id: 'core', name: 'Core', draw: (p) =>
    solid(92, 376, 44, 12, p, 4) + tube([114, 384], [196, 334], 12, p) + tube([180, 336], [212, 314], 26, p) + tube([200, 334], [240, FLOOR], 12, p)
    + figure({
      hip: [186, 306], shoulder: [252, 256], neck: [266, 244], turn: 30,
      arms: { near: [[252, 262], [236, 286], [262, 282]], far: [[246, 262], [230, 284], [254, 278]] },
      legs: { near: [[182, 312], [146, 342], [112, 370]], far: [[176, 314], [140, 346], [104, 372]] },
      tail: [[166, 304], [150, 280], [150, 256], [162, 238]],
    }, E.vowing, p) + floor(p) },
];
