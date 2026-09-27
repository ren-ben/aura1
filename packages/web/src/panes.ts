// The panes and where they lie on the plane: Kael'thos at the centre, the
// day to his left, the record above, the data below, the lore at the bottom,
// the sealed rooms at the edges.
import type { Component } from 'vue';
import Entity from './panes/Entity.vue';
import Today from './panes/Today.vue';
import Paths from './panes/Paths.vue';
import Log from './panes/Log.vue';
import Insight from './panes/Insight.vue';
import Rituals from './panes/Rituals.vue';
import Intercept from './panes/Intercept.vue';
import Vessel from './panes/Vessel.vue';
import Orrery from './panes/Orrery.vue';
import Pact from './panes/Pact.vue';
import Library from './panes/Library.vue';
import Vigil from './panes/Vigil.vue';
import Academy from './panes/Academy.vue';
import Hunt from './panes/Hunt.vue';

export type Pane = { id: string; c: number; r: number; name: string; kind: string; component: Component };

export const PANES: Pane[] = [
  { id: 'kael', c: 0, r: 0, name: "Kael'thos", kind: 'the entity', component: Entity },
  { id: 'today', c: -1, r: 0, name: 'Today', kind: 'the anchor', component: Today },
  { id: 'paths', c: 1, r: 0, name: 'The Paths', kind: 'disciplines', component: Paths },
  { id: 'log', c: 0, r: -1, name: 'The Log', kind: 'the record', component: Log },
  { id: 'vessel', c: -1, r: -1, name: 'The Vessel', kind: 'unit k-01', component: Vessel },
  { id: 'orrery', c: 1, r: -1, name: 'The Orrery', kind: 'the paths in orbit', component: Orrery },
  { id: 'insight', c: 0, r: 1, name: 'Insight', kind: 'the range', component: Insight },
  { id: 'rituals', c: -1, r: 1, name: 'Rituals', kind: 'habits', component: Rituals },
  { id: 'intercept', c: 1, r: 1, name: 'Intercept', kind: 'the vault', component: Intercept },
  { id: 'pact', c: 0, r: 2, name: 'The Pact', kind: 'the horizon', component: Pact },
  { id: 'library', c: -1, r: 2, name: 'The Library', kind: 'the reading', component: Library },
  { id: 'vigil', c: 1, r: 2, name: 'The Vigil', kind: 'the stillness', component: Vigil },
  { id: 'academy', c: -2, r: 1, name: 'The Academy', kind: 'the degree', component: Academy },
  { id: 'hunt', c: 2, r: 1, name: 'The Hunt', kind: 'the body', component: Hunt },
];
