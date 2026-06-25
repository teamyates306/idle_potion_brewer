export interface FATItem {
  id: number;
  x: number;      // viewport x (text is centred here)
  y: number;      // viewport y (text floats upward from here)
  text: string;
  color: string;  // CSS colour string
  arcX?: number;  // horizontal drift in px (for burst)
  delay?: number; // ms before animation starts
  size?: "sm" | "md" | "lg";
  duration?: number; // ms total on-screen lifetime (default 1500)
  glow?: boolean;    // coloured glow shadow + slow-rise animation
}

type FATListener = (item: FATItem) => void;
const listeners: FATListener[] = [];
let uid = 0;

export function spawnFAT(opts: Omit<FATItem, "id">): void {
  const item: FATItem = { ...opts, id: uid++ };
  listeners.forEach((l) => l(item));
}

export function subscribeFAT(cb: FATListener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
