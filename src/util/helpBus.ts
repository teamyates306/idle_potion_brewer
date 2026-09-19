// ── Deep-links into the How to Play modal ────────────────────────────────────
// An InfoDot's "Read more" needs to open HelpModal on a specific tab from deep
// inside a panel that has no route to App's panel state. Same shape as hintBus:
// App subscribes once and drives its own panel/helpTab state.

export type HelpTabId =
  | "basics" | "brewing" | "ingredients" | "workers" | "map"
  | "market" | "mastery" | "quests" | "output" | "knowledge" | "tips";

type Listener = (tab: HelpTabId) => void;
const listeners: Listener[] = [];

export function openHelp(tab: HelpTabId) {
  listeners.forEach((l) => l(tab));
}

export function subscribeHelp(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
