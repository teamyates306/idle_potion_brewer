import { useEffect, useState } from "react";
import { Settings2, SlidersHorizontal, ScrollText, ArrowUpCircle, Trophy, BarChart2 } from "lucide-react";
import Workshop from "./components/Workshop";
import QuestView from "./components/QuestView";
import UpgradesView from "./components/UpgradesView";
import AchievementsModal from "./components/AchievementsModal";
import TutorialOverlay from "./components/TutorialOverlay";
import AchievementToasts from "./components/ui/AchievementToasts";
import BalanceReportView from "./BalanceReportView";
import ContentPlanView from "./ContentPlanView";
import CoinCounter from "./components/ui/CoinCounter";
import MapView from "./components/MapView";
import WorkerView from "./components/WorkerView";
import MachineView from "./components/MachineView";
import PotionView, { SupplyChainDashboard } from "./components/PotionView";
import IngredientInventoryView from "./components/IngredientInventoryView";
import DevDashboard from "./components/DevDashboard";
import Modal from "./components/ui/Modal";
import FATLayer from "./components/ui/FATLayer";
import Atmosphere from "./components/Atmosphere";
import SettingsModal from "./components/SettingsModal";
import { useGameStore } from "./store/gameStore";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { fmt, fmtDuration } from "./util/format";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory" | "quests" | "upgrades" | "achievements" | "dev" | "supply" | null;

export default function App() {
  // Standalone analytics route: the economy A/B balance report. Checked before
  // any hooks so it renders as a self-contained page (pathname is constant for
  // the lifetime of the load, so the early return is hook-order safe).
  if (typeof window !== "undefined" && window.location.pathname === "/balance-report") {
    return <BalanceReportView />;
  }
  // Standalone content & art planning surface (placeholder text/graphics tracker).
  if (typeof window !== "undefined" && window.location.pathname === "/content-plan") {
    return <ContentPlanView />;
  }

  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const applyOffline = useGameStore((s) => s.applyOffline);
  const refreshQuests = useGameStore((s) => s.refreshQuests);
  const reconcileAchievements = useGameStore((s) => s.reconcileAchievements);
  const questsUnlocked = useGameStore((s) => s.questsUnlocked);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const hasAbacus = unlocked_globals.includes("merchants_abacus");
  const dismissWelcome = useGameStore((s) => s.dismissWelcome);
  const [panel, setPanel] = useState<Panel>(null);
  const [machineTabId, setMachineTabId] = useState(1);
  const [workerIndexForMap, setWorkerIndexForMap] = useState(0);
  // When the map is opened via "Assign to Location" from a worker, lock it to
  // that single worker; opening the map from the home screen shows all workers.
  const [mapLockedWorker, setMapLockedWorker] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const throttleAnims = useGameStore((s) => s.graphics.throttle_animations);
  usePerformanceMonitor();

  useEffect(() => {
    applyOffline();
    refreshQuests();
    reconcileAchievements(); // silently grandfather already-met achievements (badge only)
    // Catch up whenever the tab becomes visible again. Background tabs throttle
    // requestAnimationFrame, so the game loop stalls; applyOffline advances trip
    // and brew timers so workers resume mid-journey instead of snapping home.
    const onVisible = () => {
      if (document.visibilityState === "visible") { applyOffline(); refreshQuests(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [applyOffline, refreshQuests, reconcileAchievements]);

  return (
    <div className={`relative flex h-full flex-col${throttleAnims ? " anim-throttle" : ""}`}>
      <Atmosphere />
      {/* HUD — styled as the top of the stone wall */}
      <header
        className="relative z-[4] flex items-center justify-between px-4 py-2.5"
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
      <main className="relative z-[2] flex-1 overflow-hidden">
        <Workshop onOpen={(p, machineId?) => { if (p === "map") setMapLockedWorker(null); if (machineId) setMachineTabId(machineId); setPanel(p); }} />
      </main>

      {/* Left-edge button stack */}
      <div className="absolute left-2 top-1/2 z-[4] flex -translate-y-1/2 flex-col items-center gap-2">
        {questsUnlocked && (
          <button
            onClick={() => setPanel("quests")}
            className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
            title="Quest Board"
          >
            <ScrollText size={18} className="text-amber-700" />
            <span>Quests</span>
          </button>
        )}
        <button
          onClick={() => setPanel("upgrades")}
          className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
          title="Global Upgrades"
        >
          <ArrowUpCircle size={18} className="text-amber-700" />
          <span>Upgrades</span>
        </button>
        <button
          onClick={() => setPanel("achievements")}
          className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
          title="Achievements"
        >
          <Trophy size={18} className="text-amber-700" />
          <span>Achievements</span>
        </button>
        {hasAbacus && (
          <button
            onClick={() => setPanel("supply")}
            className="flex flex-col items-center gap-1 rounded-xl border border-emerald-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
            title="Supply Chain"
          >
            <BarChart2 size={18} className="text-emerald-700" />
            <span>Supply</span>
          </button>
        )}
      </div>

      {/* Hidden dev toggle */}
      <button
        onClick={() => setPanel("dev")}
        className="absolute bottom-2 left-2 z-[4] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100"
        title="Dev Dashboard"
      >
        <Settings2 size={16} />
      </button>

      {/* Panels */}
      {panel === "inventory" && <IngredientInventoryView onClose={() => setPanel(null)} />}
      {panel === "map"    && <MapView    onClose={() => setPanel(null)} workerIndex={workerIndexForMap} lockedWorkerIndex={mapLockedWorker} />}
      {panel === "worker" && <WorkerView onClose={() => setPanel(null)} onOpenMap={(idx = 0) => { setWorkerIndexForMap(idx); setMapLockedWorker(idx); setPanel("map"); }} />}
      {panel === "machine"&& <MachineView onClose={() => setPanel(null)} initialMachineId={machineTabId} />}
      {panel === "potion" && <PotionView  onClose={() => setPanel(null)} />}
      {panel === "supply" && (
        <Modal title="Supply Chain" onClose={() => setPanel(null)} accent="#22c55e">
          <SupplyChainDashboard />
        </Modal>
      )}
      {panel === "quests"   && <QuestView    onClose={() => setPanel(null)} />}
      {panel === "upgrades" && <UpgradesView onClose={() => setPanel(null)} />}
      {panel === "achievements" && <AchievementsModal onClose={() => setPanel(null)} />}
      {panel === "dev"    && <DevDashboard onClose={() => setPanel(null)} />}

      {/* Onboarding + achievement surfacing */}
      <TutorialOverlay />
      <AchievementToasts />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

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
