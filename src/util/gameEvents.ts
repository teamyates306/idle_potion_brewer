export type GameEventChannel = "trough" | "cauldron" | "pile" | "pile-burst" | "discovery";

export interface GameEvent {
  id: number;
  channel: GameEventChannel;
  text: string;
  machineId?: number;
}

type GameEventListener = (e: GameEvent) => void;
const listeners: GameEventListener[] = [];
let uid = 0;

export function pushGameEvent(channel: GameEventChannel, text: string, machineId?: number): void {
  const e: GameEvent = { id: uid++, channel, text, machineId };
  listeners.forEach((l) => l(e));
}

export function subscribeGameEvent(cb: GameEventListener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
