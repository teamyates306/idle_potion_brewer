export interface ToastData {
  id: number;
  message: string;
  color: "green" | "purple" | "amber";
}

type Listener = (t: ToastData) => void;
const listeners: Listener[] = [];
let uid = 0;

export function pushToast(message: string, color: ToastData["color"] = "green") {
  const t: ToastData = { id: uid++, message, color };
  listeners.forEach((l) => l(t));
}

export function subscribeToast(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
