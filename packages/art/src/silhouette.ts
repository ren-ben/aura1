// Merges the bust into one outline with the eyes as holes, for the web's 3D
// model (packages/web/src/kaelthos). Written by the bake.
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { silhouetteParts } from './rig.ts';
import type { Pt } from './ink.ts';

const ring = (pts: Pt[]): Polygon => [[...pts, pts[0]!].map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)] as [number, number])];

export function silhouette(): { outline: Pt[]; holes: Pt[][] } {
  const { solids, eyes } = silhouetteParts();
  const [body] = polygonClipping.union(ring(solids[0]!), ...solids.slice(1).map(ring));
  const [cut] = polygonClipping.difference(body!, ...eyes.map(ring));
  const [outer, ...holes] = cut!;
  return { outline: outer! as Pt[], holes: holes as Pt[][] };
}
