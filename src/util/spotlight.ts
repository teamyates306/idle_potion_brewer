type Listener = (selector: string, durationMs: number) => void;
const listeners: Listener[] = [];

// Highlights any element matching `selector` with the tutorial's glow ring for a
// few seconds. Used by hint "Go there" buttons to point at UI that isn't part of
// the guided tutorial flow.
export function spotlight(selector: string, durationMs = 4000) {
  listeners.forEach((l) => l(selector, durationMs));
}

export function subscribeSpotlight(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
