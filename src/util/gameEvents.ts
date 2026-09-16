export type GameEventChannel =
  | "trough"          // ingredients deposited ("+N name")
  | "cauldron"        // a brew finished ("+N Potion Name", machineId)
  | "pile"            // coins from a sale ("+1,234")
  | "pile-burst"      // big coin payout (quest / bounty)
  | "discovery"       // new potion found (meta.potionName, machineId)
  | "tier-up"         // a cauldron beat its best-ever tier (text = tier name, machineId, meta.tier)
  | "levelup"         // a worker levelled (meta.workerId)
  | "quest-complete"  // a quest was turned in (text = reward)
  | "milestone";      // lifetime coins crossed an order of magnitude (text = threshold)

export interface GameEventMeta {
  workerId?: number;
  tier?: number;
  potionName?: string;
}

export interface GameEvent {
  id: number;
  channel: GameEventChannel;
  text: string;
  machineId?: number;
  meta?: GameEventMeta;
}

type GameEventListener = (e: GameEvent) => void;
const listeners: GameEventListener[] = [];
let uid = 0;

export function pushGameEvent(channel: GameEventChannel, text: string, machineId?: number, meta?: GameEventMeta): void {
  const e: GameEvent = { id: uid++, channel, text, machineId, meta };
  listeners.forEach((l) => l(e));
}

export function subscribeGameEvent(cb: GameEventListener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
