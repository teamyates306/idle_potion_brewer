import { Bell, BellOff, Layers, Sun, Wind, Zap } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore } from "../store/settingsStore";
import type { GraphicsSettings } from "../store/gameStore";

interface RowProps {
  icon: React.ReactNode;
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}

function ToggleRow({ icon, label, sub, on, onToggle }: RowProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
        on
          ? "border-slate-600 bg-slate-800/60 text-slate-200 hover:border-amber-600/40"
          : "border-slate-700 bg-slate-900/60 text-slate-500"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={on ? "text-amber-400" : "text-slate-600"}>{icon}</span>
        <div className="text-left">
          <div className="leading-tight">{label}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
        </div>
      </div>
      <div className={`ml-4 h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-amber-500" : "bg-slate-700"}`}>
        <div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </button>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { toastsEnabled, toggleToasts } = useSettingsStore();
  const graphics    = useGameStore((s) => s.graphics);
  const setGraphics = useGameStore((s) => s.setGraphics);

  const tog = (key: keyof GraphicsSettings) =>
    setGraphics({ [key]: !graphics[key] } as Partial<GraphicsSettings>);

  return (
    <Modal title="Settings" onClose={onClose} accent="#f59e0b">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Audio &amp; Text</p>
        <ToggleRow
          icon={toastsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          label="Floating text"
          sub="Gold earned, potion names, quest rewards"
          on={toastsEnabled}
          onToggle={toggleToasts}
        />

        <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Visual Effects</p>
        <ToggleRow
          icon={<Wind size={16} />}
          label="Dust motes"
          sub="Floating particles — GPU-animated, zero CPU cost"
          on={graphics.motes}
          onToggle={() => tog("motes")}
        />
        <ToggleRow
          icon={<Layers size={16} />}
          label="Atmospheric vignette"
          sub="Dark-edge glow that deepens at night"
          on={graphics.vignette}
          onToggle={() => tog("vignette")}
        />
        <ToggleRow
          icon={<Sun size={16} />}
          label="Day / Night shifts"
          sub="Sunrise, sunset and nighttime colour tints"
          on={graphics.dayNight}
          onToggle={() => tog("dayNight")}
        />
        <ToggleRow
          icon={<Zap size={16} />}
          label="Smooth animations"
          sub="Conveyor belts and ingredient flow (disable to save battery)"
          on={!graphics.throttle_animations}
          onToggle={() => tog("throttle_animations")}
        />

        <p className="pt-1 text-[11px] italic text-slate-600">
          Visual effects are reduced automatically on low-end devices.
        </p>
      </div>
    </Modal>
  );
}
