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
          ? "border-amber-500 bg-amber-100 text-amber-900 shadow-[0_0_10px_2px_rgba(202,138,4,0.30)] hover:bg-amber-200"
          : "border-amber-800/50 bg-[#f4e9d0] text-amber-900 shadow-lg hover:bg-[#efe1c2]"
      }`}
      style={{ top }}
    >
      <div className="relative">
        {icon}
        {badge && (
          <span className="absolute -top-1.5 -right-2 rounded-full bg-yellow-500 px-1 text-[7px] font-bold text-black leading-tight">
            {badge}
          </span>
        )}
      </div>
      <span>{label}</span>
    </button>
  );
}
