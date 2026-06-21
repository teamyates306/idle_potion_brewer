import { useEffect, useState } from "react";
import { Coins, Settings2 } from "lucide-react";
import Workshop from "./components/Workshop";
import MapView from "./components/MapView";
import WorkerView from "./components/WorkerView";
import MachineView from "./components/MachineView";
import PotionView from "./components/PotionView";
import IngredientInventoryView from "./components/IngredientInventoryView";
import DevDashboard from "./components/DevDashboard";
import Modal from "./components/ui/Modal";
import ToastContainer from "./components/ui/ToastContainer";
import Atmosphere from "./components/Atmosphere";
import { useGameStore } from "./store/gameStore";
import { fmt, fmtDuration } from "./util/format";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory" | "dev" | null;

export default function App() {
  const coins = useGameStore((s) => s.coins);
  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const applyOffline = useGameStore((s) => s.applyOffline);
  const dismissWelcome = useGameStore((s) => s.dismissWelcome);
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    applyOffline();
  }, [applyOffline]);

  return (
    <div className="relative flex h-full flex-col">
      <Atmosphere />
      {/* HUD — styled as the top of the stone wall */}
      <header
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: "linear-gradient(to bottom, #3d2810 0%, #5a4028 100%)",
          borderBottom: "2px solid #3a2008",
        }}
      >
        <h1 className="text-sm font-bold tracking-wide text-amber-200">🧪 Idle Potion Brewer</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-amber-950/70 px-3 py-1.5 text-sm font-semibold text-amber-300">
          <Coins size={16} /> {fmt(coins)}
        </div>
      </header>

      {/* Workshop scene */}
      <main className="flex-1 overflow-y-auto">
        <Workshop onOpen={(p) => setPanel(p)} />
      </main>

      {/* Hidden dev toggle */}
      <button
        onClick={() => setPanel("dev")}
        className="absolute bottom-2 left-2 rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100"
        title="Dev Dashboard"
      >
        <Settings2 size={16} />
      </button>

      {/* Panels */}
      {panel === "inventory" && <IngredientInventoryView onClose={() => setPanel(null)} />}
      {panel === "map"    && <MapView    onClose={() => setPanel(null)} />}
      {panel === "worker" && <WorkerView onClose={() => setPanel(null)} onOpenMap={() => setPanel("map")} />}
      {panel === "machine"&& <MachineView onClose={() => setPanel(null)} />}
      {panel === "potion" && <PotionView  onClose={() => setPanel(null)} />}
      {panel === "dev"    && <DevDashboard onClose={() => setPanel(null)} />}

      <ToastContainer />

      {welcomeBack && (
        <Modal title="Welcome Back, Brewmaster" onClose={dismissWelcome} accent="#22d3ee">
          <p className="text-sm text-slate-300">
            You were away for <span className="font-semibold text-cyan-300">{fmtDuration(welcomeBack.seconds)}</span>.
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Your worker hauled back about{" "}
            <span className="font-semibold text-cyan-300">{welcomeBack.gathers}</span> ingredients while you were gone.
          </p>
          <button
            onClick={dismissWelcome}
            className="mt-4 w-full rounded-lg bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500"
          >
            Back to Brewing
          </button>
        </Modal>
      )}
    </div>
  );
}
