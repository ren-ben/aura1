// The practices of the Vigil (docs/vigil/ASCENT.md, "the keys"), as the
// device offers them. Each is a system activity on the server, so a sit
// travels the same crash-safe path a session does; the server keeps sits
// out of Insight and out of his decay. Names fit the device's 15 characters.
export type Pacer = 'none' | 'sigh' | 'resonance';
export type Practice = { name: string; minutes: number; pacer: Pacer; bell: number };

export const VIGIL_PRACTICES: Practice[] = [
  { name: 'Cyclic Sigh', minutes: 5, pacer: 'sigh', bell: 0 },
  { name: 'Resonance', minutes: 10, pacer: 'resonance', bell: 0 },
  { name: 'The Stages', minutes: 20, pacer: 'none', bell: 0 },
  { name: 'Nidra', minutes: 25, pacer: 'none', bell: 0 },
  { name: 'Noting', minutes: 30, pacer: 'none', bell: 5 },
  { name: 'Metta', minutes: 20, pacer: 'none', bell: 4 },
  { name: 'Jhana', minutes: 45, pacer: 'none', bell: 0 },
  { name: 'Kasina', minutes: 30, pacer: 'none', bell: 2 },
  { name: 'Middle Pillar', minutes: 15, pacer: 'none', bell: 3 },
  { name: 'Fire', minutes: 15, pacer: 'none', bell: 0 },
  { name: 'Orbit', minutes: 20, pacer: 'none', bell: 0 },
  { name: 'Do Nothing', minutes: 0, pacer: 'none', bell: 0 },
];
