import { useEffect, useState } from "react";
import { Settings2, SlidersHorizontal, Bell, BellOff } from "lucide-react";
import Workshop from "./components/Workshop";
import CoinCounter from "./components/ui/CoinCounter";
import MapView from "./components/MapView";
import WorkerView from "./components/WorkerView";
import MachineView from "./components/MachineView";
import PotionView from "./components/PotionView";
import IngredientInventoryView from "./components/IngredientInventoryView";
import DevDashboard from "./components/DevDashboard";
import Modal from "./components/ui/Modal";
import FATLayer from "./components/ui/FATLayer";
import Atmosphere from "./components/Atmosphere";
import { useGameStore } from "./store/gameStore";
import { useSettingsStore } from "./store/settingsStore";
import { fmt, fmtDuration } from "./util/format";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory" | "dev" | null;

export default function App() {
  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const applyOffline = useGameStore((s) => s.applyOffline);
  const dismissWelcome = useGameStore((s) => s.dismissWelcome);
  const [panel, setPanel] = useState<Panel>(null);
  const [workerIndexForMap, setWorkerIndexForMap] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { toastsEnabled, toggleToasts } = useSettingsStore();

  useEffect(() => {
    applyOffline();
    // Catch up whenever the tab becomes visible again. Background tabs throttle
    // requestAnimationFrame, so the game loop stalls; applyOffline advances trip
    // and brew timers so workers resume mid-journey instead of snapping home.
    const onVisible = () => {
      if (document.visibilityState === "visible") applyOffline();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [applyOffline]);

  return (
    <div className="relative flex h-full flex-col">
      <Atmosphere />
      {/* HUD — styled as the top of the stone wall */}
      <header
        className="relative z-[2] flex items-center justify-between px-4 py-2.5"
        style={{
          background: "linear-gradient(to bottom, #3d2810 0%, #5a4028 100%)",
          borderBottom: "2px solid #3a2008",
        }}
      >
        <h1 className="text-sm font-bold tracking-wide text-amber-200">🧪 Idle Potion Brewer</h1>
        <div className="flex items-center gap-2">
          <CoinCounter />
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-1.5 text-amber-300/60 hover:bg-amber-950/50 hover:text-amber-200 transition"
            title="Settings"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </header>

      {/* Workshop scene */}
      <main className="relative z-[2] flex-1 overflow-y-auto">
        <Workshop onOpen={(p) => setPanel(p)} />
      </main>

      {/* Hidden dev toggle */}
      <button
        onClick={() => setPanel("dev")}
        className="absolute bottom-2 left-2 z-[2] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100"
        title="Dev Dashboard"
      >
        <Settings2 size={16} />
      </button>

      {/* Panels */}
      {panel === "inventory" && <IngredientInventoryView onClose={() => setPanel(null)} />}
      {panel === "map"    && <MapView    onClose={() => setPanel(null)} workerIndex={workerIndexForMap} />}
      {panel === "worker" && <WorkerView onClose={() => setPanel(null)} onOpenMap={(idx = 0) => { setWorkerIndexForMap(idx); setPanel("map"); }} />}
      {panel === "machine"&& <MachineView onClose={() => setPanel(null)} />}
      {panel === "potion" && <PotionView  onClose={() => setPanel(null)} />}
      {panel === "dev"    && <DevDashboard onClose={() => setPanel(null)} />}

      {settingsOpen && (
        <Modal title="Settings" onClose={() => setSettingsOpen(false)} accent="#f59e0b">
          <button
            onClick={toggleToasts}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
              toastsEnabled
                ? "border-slate-600 bg-slate-800/60 text-slate-200 hover:border-amber-600/40"
                : "border-slate-700 bg-slate-900/60 text-slate-500"
            }`}
          >
            <div className="flex items-center gap-3">
              {toastsEnabled ? <Bell size={16} className="text-amber-400" /> : <BellOff size={16} />}
              <span>Floating text</span>
            </div>
            <div className={`h-5 w-9 rounded-full transition-colors ${toastsEnabled ? "bg-amber-500" : "bg-slate-700"}`}>
              <div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${toastsEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
        </Modal>
      )}

      <FATLayer />

      {welcomeBack && (
        <Modal title="Welcome Back, Brewmaster" onClose={dismissWelcome} accent="#22d3ee">
          <p className="mb-4 text-sm italic text-slate-400">
            You were away for{" "}
            <span className="font-semibold text-cyan-300 not-italic">{fmtDuration(welcomeBack.seconds)}</span>.
            The guild kept busy.
          </p>

          <div className="space-y-2">
            <StatRow
              label="Ingredients gathered"
              value={welcomeBack.gathers.toLocaleString()}
              color="text-green-300"
            />
            {welcomeBack.potionsBrewedCount > 0 && (
              <StatRow
                label="Potions brewed"
                value={welcomeBack.potionsBrewedCount.toLocaleString()}
                color="text-purple-300"
              />
            )}
            {welcomeBack.coinsEarned > 0 && (
              <StatRow
                label="Coins earned"
                value={`🪙 ${welcomeBack.coinsEarned.toLocaleString()}`}
                color="text-yellow-300"
              />
            )}
            {welcomeBack.workerXpEarned > 0 && (
              <StatRow
                label="Worker XP earned"
                value={welcomeBack.workerXpEarned.toLocaleString()}
                color="text-cyan-300"
              />
            )}
            {welcomeBack.machineXpEarned > 0 && (
              <StatRow
                label="Machine XP earned"
                value={welcomeBack.machineXpEarned.toLocaleString()}
                color="text-amber-300"
              />
            )}
          </div>

          <button
            onClick={dismissWelcome}
            className="mt-5 w-full rounded-lg bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500"
          >
            Back to Brewing
          </button>
        </Modal>
      )}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
