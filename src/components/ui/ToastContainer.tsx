import { useEffect, useState } from "react";
import { subscribeToast, type ToastData } from "../../util/toast";
import { useSettingsStore } from "../../store/settingsStore";

function ToastItem({ toast, onRemove }: { toast: ToastData; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 10);
    const t2 = setTimeout(() => setVisible(false), 2400);
    const t3 = setTimeout(onRemove, 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const colorClass =
    toast.color === "purple"
      ? "bg-purple-950/95 text-purple-200 border-purple-700/60"
      : toast.color === "amber"
      ? "bg-amber-950/95 text-amber-200 border-amber-700/60"
      : "bg-green-950/95 text-green-200 border-green-700/60";

  return (
    <div
      className={`border rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg transition-all duration-300 ${colorClass} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
      }`}
    >
      {toast.message}
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastsEnabled = useSettingsStore((s) => s.toastsEnabled);

  useEffect(() => {
    return subscribeToast((t) => {
      if (!useSettingsStore.getState().toastsEnabled) return;
      setToasts((prev) => [...prev.slice(-4), t]);
    });
  }, []);

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed bottom-4 right-3 z-[1] flex flex-col items-end gap-1.5">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => remove(t.id)} />
      ))}
    </div>
  );
}
