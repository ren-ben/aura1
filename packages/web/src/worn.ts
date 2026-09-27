// Kael'thos as the device last showed him: the drawing for the skin he wears
// there (baked by packages/art, `pnpm --filter @aura/art web`), his own where
// that skin has none.
import art from './gl/art.json';
import { state } from './store';

const drawings = art as Record<string, string>;
export const worn = (key: string): string => drawings[`${state.device?.skin}/${key}`] ?? drawings[key]!;
