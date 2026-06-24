import type { ReactNode } from "react";

interface RailBadgeProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  top: number;
  glow?: boolean;
  badge?: string;
  dataTut?: string;
}

// Unified right-rail badge — matches the left-side button stack in App.tsx:
// icon size 18, py-2.5, gap-1, font-semibold, shadow-lg.
export default function RailBadge({
  icon, label, onClick, top, glow = false, badge, dataTut,
}: RailBadgeProps) {
  return (
    <button
      data-tut={dataTut}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`pointer-events-auto absolute right-3 -translate-y-1/2 flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider backdrop-blur-sm transition active:scale-95 ${
        glow
          ? "border-yellow-500/70 bg-yellow-950/50 text-yellow-300 shadow-[0_0_10px_2px_rgba(234,179,8,0.25)] hover:bg-yellow-950/70"
          : "border-amber-800/50 bg-stone-900/60 text-amber-300/80 shadow-lg hover:bg-stone-900/80"
      }`}
      style={{ top }}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className="mt-0.5 rounded-full bg-yellow-500 px-1.5 text-[8px] font-bold text-black leading-tight">
          {badge}
        </span>
      )}
    </button>
  );
}
