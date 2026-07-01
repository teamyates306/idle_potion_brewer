import { Bell, BellOff, Layers } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore } from "../store/settingsStore";

const QUALITY_LABELS = ["Basic", "Medium", "High", "Very High"] as const;
const QUALITY_DESCS = [
  "Day / night tints and vignette only — minimal GPU load",
  "Adds wall shadow and smooth animations",
  "Adds dust motes and lantern glow flicker",
  "Adds window light shafts — full atmosphere",
];

function QualitySlider({ quality, onChange }: { quality: 0 | 1 | 2 | 3; onChange: (q: 0 | 1 | 2 | 3) => void }) {
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-amber-400"><Layers size={16} /></span>
        <div className="min-w-0">
          <div className="text-sm text-slate-200">Graphics quality</div>
          <div className="text-[11px] text-slate-500 leading-tight">{QUALITY_DESCS[quality]}</div>
        </div>
        <span className="ml-auto shrink-0 text-sm font-semibold text-amber-400">{QUALITY_LABELS[quality]}</span>
      </div>

      {/* Track with 4 notches */}
      <div className="relative px-1 pt-1 pb-3">
        <input
          type="range" min={0} max={3} step={1} value={quality}
          onChange={(e) => onChange(+e.target.value as 0 | 1 | 2 | 3)}
          className="w-full accent-amber-500"
          style={{ cursor: "pointer" }}
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5 select-none">
          {QUALITY_LABELS.map((l) => (
            <span key={l} className={quality === QUALITY_LABELS.indexOf(l) ? "text-amber-400 font-semibold" : ""}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { toastsEnabled, toggleToasts } = useSettingsStore();
  const quality    = useGameStore((s) => s.graphics.quality);
  const setQuality = useGameStore((s) => s.setQuality);

  return (
    <Modal title="Settings" onClose={onClose} accent="#f59e0b">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Audio &amp; Text</p>
        <button
          onClick={toggleToasts}
          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
            toastsEnabled
              ? "border-slate-600 bg-slate-800/60 text-slate-200 hover:border-amber-600/40"
              : "border-slate-700 bg-slate-900/60 text-slate-500"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={toastsEnabled ? "text-amber-400" : "text-slate-600"}>
              {toastsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </span>
            <div className="text-left">
              <div className="leading-tight">Floating text</div>
              <div className="text-[11px] text-slate-500">Gold earned, potion names, quest rewards</div>
            </div>
          </div>
          <div className={`ml-4 h-5 w-9 shrink-0 rounded-full transition-colors ${toastsEnabled ? "bg-amber-500" : "bg-slate-700"}`}>
            <div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${toastsEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
        </button>

        <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Visual Effects</p>
        <QualitySlider quality={quality} onChange={setQuality} />

        <p className="pt-1 text-[11px] italic text-slate-600">
          Visual effects are reduced automatically on low-end devices.
        </p>
      </div>
    </Modal>
  );
}
