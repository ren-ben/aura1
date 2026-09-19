// What Kael'thos feels on the web: a resting mood from how he is doing, and
// brief reactions to what you do. Any view can make him react.
import { computed, ref } from 'vue';
import type { ExpressionName } from '@aura/art/expressions.ts';
import type { Stats } from '../api';

const REST: Record<Stats['form'], ExpressionName> = {
  stable: 'curious',
  thinning: 'lonely',
  fragmenting: 'lonely',
  dormant: 'asleep',
};

const form = ref<Stats['form']>('stable');
const reaction = ref<ExpressionName | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export const mood = computed<ExpressionName>(() => reaction.value ?? REST[form.value]);

export function setForm(value: Stats['form']): void {
  form.value = value;
}

// He shows `name` for a while, then settles back.
export function react(name: ExpressionName, ms = 3500): void {
  reaction.value = name;
  clearTimeout(timer);
  timer = setTimeout(() => { reaction.value = null; }, ms);
}
