<script setup lang="ts">
// Kael'thos in 3D: the device's silhouette (baked by packages/art into
// silhouette.json, eyes cut through) extruded and turning slowly. 'outline'
// draws only its edges, a minimal wireframe; 'ascii' renders it lit and
// re-draws it in characters.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';
import { AsciiEffect } from 'three/addons/effects/AsciiEffect.js';
import silhouette from './silhouette.json';

const props = withDefaults(defineProps<{ mode?: 'outline' | 'ascii'; size?: number }>(), {
  mode: 'outline',
  size: 240,
});

const host = ref<HTMLDivElement | null>(null);
let stop = () => {};

// Canvas coordinates (400 x 400, y down) to model units (y up, centred).
const toVec = ([x, y]: number[]) => new THREE.Vector2((x! - 200) / 200, -(y! - 220) / 200);

function buildGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(silhouette.outline.map(toVec));
  shape.holes = silhouette.holes.map((h) => new THREE.Path(h.map(toVec)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.025, bevelSegments: 3, curveSegments: 4,
  });
  geometry.center();
  return geometry;
}

onMounted(() => {
  const el = host.value!;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  camera.position.set(0, 0.05, 4.1);
  const geometry = buildGeometry();
  const model = new THREE.Group();
  scene.add(model);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(props.size, props.size);

  let draw: () => void;
  if (props.mode === 'outline') {
    const edges = new THREE.EdgesGeometry(geometry, 28);
    model.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xc5bcab })));
    el.appendChild(renderer.domElement);
    draw = () => renderer.render(scene, camera);
  } else {
    // Shaded by surface direction, so the face reads as solid characters and
    // the turn sweeps gradients across it, with no lights to tune.
    model.add(new THREE.Mesh(geometry, new THREE.MeshNormalMaterial()));
    const ascii = new AsciiEffect(renderer, ' .:-=+*%#@', { invert: false, resolution: 0.18, color: false });
    ascii.setSize(props.size, props.size);
    ascii.domElement.style.color = '#c5bcab';
    ascii.domElement.style.backgroundColor = 'transparent';
    el.appendChild(ascii.domElement);
    draw = () => ascii.render(scene, camera);
  }

  // A slow turn with a slight sway, like something drifting at the edge of
  // the world. Held still when the viewer asks for reduced motion.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = (now - start) / 1000;
    model.rotation.y = still ? 0.5 : t * 0.7;
    model.rotation.x = still ? 0 : Math.sin(t * 0.9) * 0.08;
    draw();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  stop = () => {
    cancelAnimationFrame(frame);
    geometry.dispose();
    renderer.dispose();
  };
});

onBeforeUnmount(() => stop());
</script>

<template>
  <div ref="host" class="kaelthos" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true" />
</template>

<style scoped>
.kaelthos { display: inline-block; line-height: 0; }
</style>
