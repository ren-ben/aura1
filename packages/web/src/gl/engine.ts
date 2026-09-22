// A scene in the console's own material: rendered, then ordered-dithered to
// the two inks in a last pass, so nothing in three dimensions is smooth. Drag
// turns it; it drifts on its own; it only runs while its pane is on screen.
import * as THREE from 'three';

const DITHER = `
  uniform sampler2D tex; uniform vec2 res; uniform float px; uniform vec3 ink; uniform vec3 ground;
  float b2(vec2 a) { a = floor(mod(a, 2.0)); return mod(a.x * 2.0 + a.y * 3.0, 4.0); }
  float bayer(vec2 p) { return (4.0 * b2(p) + b2(floor(p / 2.0))) / 16.0; }
  void main() {
    vec2 cell = floor(gl_FragCoord.xy / px);
    vec3 c = texture2D(tex, (cell * px + px * 0.5) / res).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(l > bayer(cell) + 0.015 ? ink : ground, 1.0);
  }`;

export const INK = 0xc5bcab;
export const GROUND = 0x121212;
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Build = (ctx: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) =>
  ((t: number, dt: number) => void) | void;
export type Options = { dither?: boolean; px?: number; fov?: number; distance?: number; drift?: number; tilt?: number; yaw?: number };

export function createScene(canvas: HTMLCanvasElement, build: Build, opts: Options = {}) {
  const { dither = true, px = 2, fov = 34, distance = 4.2, drift = 0.0035, tilt = 0.12, yaw = 0.4 } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !dither });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
  camera.position.set(0, 0, distance);
  const group = new THREE.Group();
  scene.add(group);
  const tick = build({ scene, group, camera }) || (() => {});

  const target = dither ? new THREE.WebGLRenderTarget(2, 2) : null;
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: target?.texture ?? null }, res: { value: new THREE.Vector2() }, px: { value: px },
      ink: { value: new THREE.Color(INK) }, ground: { value: new THREE.Color(GROUND) },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: DITHER,
  });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  // Turning: drag to turn, let go and it keeps drifting.
  const turn = { x: tilt, y: yaw, hold: false };
  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, tx: turn.x, ty: turn.y };
    canvas.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    turn.y = drag.ty + (e.clientX - drag.x) * 0.008;
    turn.x = Math.max(-1.3, Math.min(1.3, drag.tx + (e.clientY - drag.y) * 0.008));
  };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    target?.setSize(w * pr, h * pr);
    material.uniforms.res!.value.set(w * pr, h * pr);
    material.uniforms.px!.value = px * pr;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let running = false, raf = 0, last = 0;
  const start = performance.now();
  function frame(now: number) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!drag && !turn.hold && !reduced()) turn.y += drift;
    group.rotation.set(turn.x, turn.y, 0);
    tick((now - start) / 1000, dt);
    if (target) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    } else {
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    scene, group, camera, turn,
    start() { if (running) return; running = true; last = 0; resize(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    dispose() {
      running = false; cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      renderer.dispose(); target?.dispose();
    },
  };
}

export type SceneHandle = ReturnType<typeof createScene>;

// A seeded random, so every scene is the same scene each time.
export const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
