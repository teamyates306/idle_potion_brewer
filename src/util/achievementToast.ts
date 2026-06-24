// Dedicated "Achievement Unlocked" toast emitter — independent of the floating-
// text setting, so milestone unlocks always surface.
export interface AchToast { id: number; name: string; description: string; }

type Listener = (t: AchToast) => void;
const listeners: Listener[] = [];
let uid = 0;

export function pushAchievementToast(name: string, description: string) {
  const t: AchToast = { id: uid++, name, description };
  listeners.forEach((l) => l(t));
}

export function subscribeAchievementToast(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
