import { useEffect, useState } from "react";

// A shared 125ms ticker so components that just need to re-render for a
// progress-bar animation (trip/brew percentages computed from Date.now())
// don't each spin up their own setInterval — one timer, many subscribers.
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTimer() {
  if (intervalId != null) return;
  intervalId = setInterval(() => {
    for (const l of listeners) l();
  }, 125);
}

function releaseTimer() {
  if (listeners.size > 0 || intervalId == null) return;
  clearInterval(intervalId);
  intervalId = null;
}

export function useRenderTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => (n + 1) % 1000000);
    listeners.add(listener);
    ensureTimer();
    return () => {
      listeners.delete(listener);
      releaseTimer();
    };
  }, []);
}
