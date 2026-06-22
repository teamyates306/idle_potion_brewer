import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  subHeader?: ReactNode;
  accent?: string;
}

export default function Modal({ title, onClose, children, subHeader, accent = "#a855f7" }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-[#0f172a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky title row */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-700 bg-[#0f172a] px-4 py-3"
          style={{ boxShadow: `inset 0 -2px 0 ${accent}33` }}
        >
          <h2 className="text-lg font-semibold" style={{ color: accent }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>
        {/* Optional sticky sub-header (e.g. tab bar) — sticks just below title */}
        {subHeader && (
          <div className="sticky top-[53px] z-10 border-b border-slate-800 bg-[#0f172a] px-4 pb-2 pt-2">
            {subHeader}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
