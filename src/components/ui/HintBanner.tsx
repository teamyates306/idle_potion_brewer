import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscribeHint, type HintData } from "../../util/hintBus";

export default function HintBanner() {
  const [queue, setQueue] = useState<HintData[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    return subscribeHint((h) => setQueue((prev) => [...prev, h]));
  }, []);

  // Auto-dismiss after 8 s; resets each time the front of the queue changes
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setQueue((prev) => prev.slice(1)), 8000);
    return () => window.clearTimeout(t);
  }, [current?.id]);

  if (!current) return null;

  const dismiss = () => setQueue((prev) => prev.slice(1));

  return (
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-[75] w-[92%] max-w-sm -translate-x-1/2">
      <div className="hint-pop rounded-2xl border border-teal-700/60 bg-slate-900/97 px-4 py-3 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl leading-none">{current.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-400">
              {current.title}
            </p>
            <p className="text-sm leading-snug text-slate-300">{current.body}</p>
          </div>
          <button
            onClick={dismiss}
            className="ml-1 mt-0.5 shrink-0 text-slate-500 hover:text-slate-300 transition"
          >
            <X size={15} />
          </button>
        </div>
        {queue.length > 1 && (
          <p className="mt-2 text-right text-[10px] text-slate-600">
            +{queue.length - 1} more tip{queue.length > 2 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
