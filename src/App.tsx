import { useEffect, useState } from "react";
import { Settings, Settings2, ScrollText, ArrowUpCircle, Trophy, BarChart2, Sparkles, HelpCircle, Landmark, Gem, Crown } from "lucide-react";
import TrophyCaseModal from "./components/TrophyCaseModal";
import HelpModal from "./components/HelpModal";
import GaxDashboard from "./components/GaxDashboard";
import TickerTape from "./components/ui/TickerTape";
import GameClock from "./components/ui/GameClock";
import { attrLabel } from "./engine/gax";
import Workshop from "./components/Workshop";
import QuestView from "./components/QuestView";
import UpgradesView from "./components/UpgradesView";
import AchievementsModal from "./components/AchievementsModal";
import TutorialOverlay from "./components/TutorialOverlay";
import AchievementToasts from "./components/ui/AchievementToasts";
import BalanceReportView from "./BalanceReportView";
import ContentPlanView from "./ContentPlanView";
import LeaderboardPage from "./LeaderboardPage";
import UserProfilePage from "./UserProfilePage";
import LeaderboardModal from "./components/LeaderboardModal";
import CloudRestoreModal from "./components/CloudRestoreModal";
import { useOnlineSync } from "./online/useOnlineSync";
import CoinCounter from "./components/ui/CoinCounter";
import MapView from "./components/MapView";
import WorkerView from "./components/WorkerView";
import MachineView from "./components/MachineView";
import PotionView, { SupplyChainDashboard } from "./components/PotionView";
import IngredientInventoryView from "./components/IngredientInventoryView";
import DevDashboard from "./components/DevDashboard";
import MasteryView from "./components/MasteryView";
import HintBanner from "./components/ui/HintBanner";
import Modal from "./components/ui/Modal";
import FATLayer from "./components/ui/FATLayer";
import Atmosphere, { applyDayNightVars } from "./components/Atmosphere";
import LoadingScreen from "./components/LoadingScreen";
import SettingsModal from "./components/SettingsModal";
import { useGameStore } from "./store/gameStore";
import { masteryLevel } from "./data/masteryTrees";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { fmt, fmtDuration } from "./util/format";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory" | "quests" | "upgrades" | "achievements" | "mastery" | "dev" | "supply" | "help" | "gax" | "trophies" | "leaderboard" | null;

// Core sprites visible the instant the workshop scene mounts — preloaded so
// they're already decoded by the time the loading screen hands off, instead
// of popping in piecemeal (bricks, then windows, then a walker mid-stride…).
const CORE_SPRITES = [
  "/sprites/background.png", "/sprites/foreground.png",
  "/sprites/window.png", "/sprites/door.png",
  "/sprites/wall-tile.png", "/sprites/floor-tile.png", "/sprites/lamp.png",
  "/sprites/machine.png", "/sprites/potion-bottle.png",
  "/sprites/worker.png", "/sprites/worker-manic.png",
  "/sprites/worker-explorer.png", "/sprites/worker-caravan.png", "/sprites/worker-pounder.png",
];

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // a missing sprite shouldn't hang the loading screen
    img.src = src;
  });
}

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
  // Public online leaderboard (also reachable via the in-game Rankings button).
  if (typeof window !== "undefined" && window.location.pathname === "/leaderboard") {
    return <LeaderboardPage />;
  }
  // Public player profile pages: /user/<nickname>
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/user/")) {
    const nick = decodeURIComponent(window.location.pathname.slice("/user/".length));
    return <UserProfilePage nickname={nick} />;
  }

  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const applyOffline = useGameStore((s) => s.applyOffline);
  const refreshQuests = useGameStore((s) => s.refreshQuests);
  const reconcileAchievements = useGameStore((s) => s.reconcileAchievements);
  const questsUnlocked = useGameStore((s) => s.questsUnlocked);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const hasAbacus = unlocked_globals.includes("merchants_abacus");
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const hasMastery =
    masteryTokens > 0 ||
    masteryUnlocks.length > 0 ||
    Object.values(potionMastery).some((e) => masteryLevel(e.xp) >= 10);
  const dismissWelcome = useGameStore((s) => s.dismissWelcome);
  const gaxUnlocked = useGameStore((s) => s.gaxUnlocked);
  const gaxOfflineReport = useGameStore((s) => s.gaxOfflineReport);
  const settleGax = useGameStore((s) => s.settleGax);
  const [welcomeTab, setWelcomeTab] = useState<"summary" | "market">("summary");
  const [panel, setPanel] = useState<Panel>(null);
  // Set only when the leaderboard panel is opened via Settings → Account, so
  // it lands there instead of the default board/join tab.
  const [leaderboardInitialTab, setLeaderboardInitialTab] = useState<"board" | "account" | undefined>(undefined);
  const [machineTabId, setMachineTabId] = useState(1);
  const [workerIndexForMap, setWorkerIndexForMap] = useState(0);
  // When the map is opened via "Assign to Location" from a worker, lock it to
  // that single worker; opening the map from the home screen shows all workers.
  const [mapLockedWorker, setMapLockedWorker] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const throttleAnims = useGameStore((s) => s.graphics.throttle_animations);
  usePerformanceMonitor();
  useOnlineSync();

  // Loading screen: hold the reveal until the workshop's core sprites are
  // decoded and the day/night CSS vars have been computed at least once —
  // otherwise the scene used to paint piecemeal (bricks before windows,
  // walkers mid-stride) and briefly show fallback colours before Atmosphere's
  // own effect corrected them a frame later.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Defensive reset: a page navigated to us (e.g. "Back to the workshop"
    // from the leaderboard) can arrive with a stray scroll/pan position —
    // most commonly iOS Safari carrying over a pinch-zoom from a focused
    // input on the previous page. The workshop is a fixed single-viewport
    // app, so it should always start pinned at the origin.
    window.scrollTo(0, 0);
    applyDayNightVars();
    const assets = Promise.all(CORE_SPRITES.map(preloadImage));
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 500));
    Promise.all([assets, minDelay]).then(() => setReady(true));
  }, []);

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

  // Keep lastSeen fresh and regenerate elapsed-cooldown quests.
  // Only fires when tab is visible — no battery drain in background.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) {
        useGameStore.setState({ lastSeen: Date.now() });
        refreshQuests();
        // Lazy GAX settle — no-ops instantly unless a market hour rolled over.
        settleGax();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [refreshQuests, settleGax]);

  if (!ready) return <LoadingScreen />;

  return (
    <div className={`relative flex h-full flex-col${throttleAnims ? " anim-throttle" : ""}`}>
      <Atmosphere />

      {/* HUD — floats above the scene so Workshop atmosphere covers the full viewport */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between px-3 py-2">
        <GameClock />
        <div className="pointer-events-auto flex items-center gap-2">
          <CoinCounter />
          <button
            onClick={() => setPanel("help")}
            className="rounded-full p-1.5 text-amber-300/60 hover:bg-amber-950/50 hover:text-amber-200 transition"
            title="How to Play"
          >
            <HelpCircle size={16} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-1.5 text-amber-300/60 hover:bg-amber-950/50 hover:text-amber-200 transition"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Workshop scene — fills full height so wall + atmosphere reach the top edge */}
      <main className="relative z-[2] h-full overflow-hidden">
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
        <button
          onClick={() => { setLeaderboardInitialTab(undefined); setPanel("leaderboard"); }}
          className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
          title="Guild Rankings — the online leaderboard"
        >
          <Crown size={18} className="text-amber-700" />
          <span>Rankings</span>
        </button>
        <button
          onClick={() => setPanel("trophies")}
          className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
          title="Trophy Case"
        >
          <Gem size={18} className="text-amber-700" />
          <span>Trophies</span>
        </button>
        {hasMastery && (
          <button
            onClick={() => setPanel("mastery")}
            className="relative flex flex-col items-center gap-1 rounded-xl border border-amber-700/60 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
            title="Mastery"
          >
            <Sparkles size={18} className="text-amber-600" />
            <span>Mastery</span>
            {masteryTokens > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-amber-950">
                {masteryTokens}
              </span>
            )}
          </button>
        )}
        {gaxUnlocked && (
          <button
            onClick={() => setPanel("gax")}
            className="flex flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-2.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#f4e9d0] active:scale-95"
            title="Grand Alchemical Exchange"
          >
            <Landmark size={18} className="text-amber-700" />
            <span>GAX</span>
          </button>
        )}
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

      {/* Hidden dev toggle — lifted above the ticker tape when the GAX is open */}
      <button
        onClick={() => setPanel("dev")}
        className={`absolute left-2 z-[4] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100 ${gaxUnlocked ? "bottom-8" : "bottom-2"}`}
        title="Dev Dashboard"
      >
        <Settings2 size={16} />
      </button>

      {/* GAX ticker tape — global marquee, only once the Exchange is unlocked */}
      <TickerTape onOpen={() => setPanel("gax")} />

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
      {panel === "trophies" && <TrophyCaseModal onClose={() => setPanel(null)} />}
      {panel === "mastery"  && <MasteryView  onClose={() => setPanel(null)} />}
      {panel === "help"     && <HelpModal    onClose={() => setPanel(null)} />}
      {panel === "gax"      && <GaxDashboard onClose={() => setPanel(null)} />}
      {panel === "leaderboard" && (
        <LeaderboardModal onClose={() => setPanel(null)} initialTab={leaderboardInitialTab} />
      )}
      {panel === "dev"    && <DevDashboard onClose={() => setPanel(null)} />}

      {/* Onboarding + achievement surfacing */}
      <TutorialOverlay />
      <AchievementToasts />
      <HintBanner />

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onOpenAccount={() => {
            setSettingsOpen(false);
            setLeaderboardInitialTab("account");
            setPanel("leaderboard");
          }}
        />
      )}

      {/* Cross-device restore choice after a fresh sign-in */}
      <CloudRestoreModal />

      <FATLayer />

      {welcomeBack && (
        <Modal title="Welcome Back, Brewmaster" onClose={dismissWelcome} accent="#22d3ee">
          <p className="mb-3 text-sm italic text-slate-400">
            You were away for{" "}
            <span className="font-semibold text-cyan-800 not-italic">{fmtDuration(welcomeBack.seconds)}</span>.
            The guild kept busy.
          </p>

          {/* Tabs — the Market Events audit only exists once the GAX is open */}
          {gaxOfflineReport && (
            <div className="mb-3 flex rounded-lg bg-slate-800 p-1">
              <button
                onClick={() => setWelcomeTab("summary")}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                  welcomeTab === "summary" ? "bg-cyan-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setWelcomeTab("market")}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                  welcomeTab === "market" ? "bg-cyan-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📈 Market Events
              </button>
            </div>
          )}

          {welcomeTab === "market" && gaxOfflineReport ? (
            <div className="space-y-3">
              <p className="text-[11px] italic leading-relaxed text-slate-500">
                "Per Exchange bylaws, the Guild Auditor hereby summarises all market
                activity conducted in your name while you were, ahem, resting."
              </p>

              {/* Global news */}
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">Global news</p>
                {gaxOfflineReport.activeEvent || gaxOfflineReport.endedEventHeadline ? (
                  <div className="space-y-2">
                    {gaxOfflineReport.activeEvent && (
                      <div className="rounded-lg border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-xs">
                        <span className="text-amber-900">{gaxOfflineReport.activeEvent.headline}</span>
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Currently day {gaxOfflineReport.activeEvent.day} of the wave
                          {gaxOfflineReport.activeEvent.phase === "forecast" && " — prices move tomorrow, there's still time to pivot"}
                          {gaxOfflineReport.activeEvent.phase === "peak" && " — prices are locked at the event rate"}
                          {gaxOfflineReport.activeEvent.phase === "trailing" && " — the wave is breaking, prices easing"}
                        </span>
                      </div>
                    )}
                    {gaxOfflineReport.endedEventHeadline && (
                      <div className="rounded-lg bg-slate-800/50 px-3 py-2 text-xs text-slate-400">
                        While you were away: <span className="text-slate-300">{gaxOfflineReport.endedEventHeadline}</span>
                        <span className="block text-[10px] text-slate-500">…rose, peaked and fully blew over. You missed it entirely.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-500">
                    No anomalies while you were gone. The ticker had to fill airtime with weather.
                  </p>
                )}
              </div>

              {/* Internal audit */}
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">Internal audit</p>
                {gaxOfflineReport.audit.length === 0 ? (
                  <p className="rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-500">
                    Your trickle sales stayed under the market's natural drain — no
                    economies were harmed by your absence.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {gaxOfflineReport.audit.map((row) => (
                      <div key={row.attr} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-xs">
                        <span className="w-20 shrink-0 font-semibold text-slate-200">{attrLabel(row.attr)}</span>
                        <span className="min-w-0 flex-1 text-[11px] text-slate-400">
                          {row.outcome === "flooded" && `Your auto-sales dumped ${row.soldPoints.toLocaleString()} points of supply — the bottom fell out.`}
                          {row.outcome === "replaced" && `A surge of ${row.soldPoints.toLocaleString()} points barged onto the exchange board, evicting a quieter market.`}
                          {row.outcome === "starved" && (row.soldPoints > 0
                            ? `You sold ${row.soldPoints.toLocaleString()} points into a starving market — well played.`
                            : "Utterly neglected. Scarcity did your negotiating for you.")}
                        </span>
                        <span className={`shrink-0 font-bold tabular-nums ${row.multiplier >= 1 ? "text-emerald-700" : "text-rose-600"}`}>
                          ×{row.multiplier.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <StatRow
                label="Ingredients gathered"
                value={welcomeBack.gathers.toLocaleString()}
                color="text-green-800"
              />
              {welcomeBack.potionsBrewedCount > 0 && (
                <StatRow
                  label="Potions brewed"
                  value={welcomeBack.potionsBrewedCount.toLocaleString()}
                  color="text-purple-800"
                />
              )}
              {welcomeBack.coinsEarned > 0 && (
                <StatRow
                  label="Coins earned"
                  value={`🪙 ${welcomeBack.coinsEarned.toLocaleString()}`}
                  color="text-amber-700"
                />
              )}
              {welcomeBack.workerXpEarned > 0 && (
                <StatRow
                  label="Worker XP earned"
                  value={welcomeBack.workerXpEarned.toLocaleString()}
                  color="text-cyan-800"
                />
              )}
              {welcomeBack.machineXpEarned > 0 && (
                <StatRow
                  label="Machine XP earned"
                  value={welcomeBack.machineXpEarned.toLocaleString()}
                  color="text-amber-800"
                />
              )}
            </div>
          )}

          <button
            onClick={dismissWelcome}
            className="mt-5 w-full rounded-lg bg-cyan-700 py-2.5 font-semibold text-white hover:bg-cyan-600"
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
