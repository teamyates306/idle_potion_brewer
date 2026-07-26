import type { ReactNode } from "react";

interface RailBadgeProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  top: number;
  glow?: boolean;
  badge?: ReactNode;
  dataTut?: string;
}

// Unified right-rail badge — matches the left-side button stack in App.tsx:
// icon size 18, py-2.5, gap-1, font-semibold, shadow-lg.
//
// Two shapes from one markup tree, both anchored to `top` — the measured Y
// centre of the badge's workshop section (workers strip, trough, brewers,
// potion pile), so each button always sits beside the thing it opens:
//  - Mobile/tablet (<1024px): the original 72px vertical chip.
//  - Desktop (lg:): a wide horizontal card — icon left, label, count pill
//    inline on the right (the corner star overlapped neighbours at this size).
export default function RailBadge({
  icon, label, onClick, glow = false, badge, dataTut, top,
}: RailBadgeProps) {
  return (
    <button
      data-tut={dataTut}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`pointer-events-auto absolute right-3 -translate-y-1/2 flex w-[72px] flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[9px] font-semibold uppercase tracking-wider backdrop-blur-sm transition active:scale-95 lg:right-6 lg:w-48 lg:flex-row lg:items-center lg:gap-3 lg:rounded-2xl lg:px-4 lg:py-3 lg:text-xs lg:[&_svg]:h-6 lg:[&_svg]:w-6 ${
        glow
          ? "border-amber-500 bg-amber-100 text-amber-900 shadow-[0_0_10px_2px_rgba(202,138,4,0.30)] hover:bg-amber-200"
          : "border-amber-800/50 bg-[#f4e9d0] text-amber-900 shadow-lg hover:bg-[#efe1c2]"
      }`}
      style={{ top }}
    >
      <div className="relative lg:flex lg:shrink-0 lg:items-center">
        {icon}
        {/* Mobile-only corner badge — on desktop the count moves inline (below) */}
        {badge && (
          <span className="absolute -top-1.5 -right-2 rounded-full bg-yellow-500 px-1 text-[7px] font-bold text-black leading-tight lg:hidden">
            {badge}
          </span>
        )}
      </div>
      <span className="lg:text-left">{label}</span>
      {badge && (
        <span className="hidden rounded-full bg-yellow-500 px-2 py-0.5 text-[10px] font-bold leading-tight text-black lg:ml-auto lg:flex lg:items-center">
          {badge}
        </span>
      )}
    </button>
  );
}
