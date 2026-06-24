import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { subscribeAchievementToast, type AchToast } from "../../util/achievementToast";

// Top-centre "Achievement Unlocked" banners. Independent of the floating-text
// setting so milestones always surface.
export default function AchievementToasts() {
  const [items, setItems] = useState<AchToast[]>([]);

  useEffect(() => {
    return subscribeAchievementToast((t) => {
      setItems((prev) => [...prev.slice(-2), t]);
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4600);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[90] flex w-[92%] max-w-sm -translate-x-1/2 flex-col items-stretch gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="ach-pop flex items-center gap-3 rounded-xl border border-amber-500/60 bg-gradient-to-br from-amber-950/95 to-stone-900/95 px-3.5 py-2.5 shadow-2xl"
        >
          <Trophy size={22} className="shrink-0 text-amber-400" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Achievement Unlocked</div>
            <div className="truncate text-sm font-bold text-amber-100">{t.name}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
