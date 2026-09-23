// One answer to "is this a phone", shared by every pane, so a narrow screen
// gets fewer things rather than the same things made smaller.
import { ref } from 'vue';

export const narrow = ref(false);
export const short = ref(false);

const see = () => {
  narrow.value = matchMedia('(max-width: 860px)').matches;
  short.value = matchMedia('(max-height: 560px)').matches;
};
see();
addEventListener('resize', see);
