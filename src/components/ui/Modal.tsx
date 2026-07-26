import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  subHeader?: ReactNode;
  accent?: string;
  closeTutAttr?: string;
  /** Desktop-only width bump (≥1024px). "md" keeps the phone-sized sheet
   *  everywhere; "lg"/"xl" widen ONLY at the lg: breakpoint so the mobile
   *  layout is untouched. Pair "xl" with lg: multi-column content. */
  size?: "md" | "lg" | "xl";
}

// All width overrides are lg:-prefixed on purpose — below 1024px every panel
// renders exactly as before (bottom sheet, sm:max-w-md).
const SIZE_CLASS = { md: "", lg: "lg:max-w-2xl", xl: "lg:max-w-4xl" } as const;

export default function Modal({ title, onClose, children, subHeader, accent = "#a8572f", closeTutAttr, size = "md" }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[#2a1c0e]/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full sm:max-w-md ${SIZE_CLASS[size]} max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky title row */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3"
          style={{ boxShadow: `inset 0 -2px 0 ${accent}33` }}
        >
          <h2 className="text-lg font-semibold" style={{ color: accent }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            {...(closeTutAttr ? { "data-tut": closeTutAttr } : {})}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>
        {/* Optional sticky sub-header (e.g. tab bar) — sticks just below title */}
        {subHeader && (
          <div className="sticky top-[53px] z-10 border-b border-slate-800 bg-slate-900 px-4 pb-2 pt-2">
            {subHeader}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
