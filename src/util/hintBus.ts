import type { HintId } from "../data/hints";
import { HINTS } from "../data/hints";

export interface HintData {
  id: string;
  icon: string;
  title: string;
  body: string;
  goto?: { panel: string; spotlight?: string };
}

type Listener = (h: HintData) => void;
const listeners: Listener[] = [];

export function emitHint(id: HintId) {
  const def = HINTS[id];
  const h: HintData = { id, ...def };
  listeners.forEach((l) => l(h));
}

export function subscribeHint(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
