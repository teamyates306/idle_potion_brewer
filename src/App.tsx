import { useEffect, useState } from "react";
import { Settings, Settings2, ScrollText, Trophy, Sparkles, HelpCircle, Landmark, Eye, EyeOff, Angry } from "lucide-react";
import HelpModal from "./components/HelpModal";
import GaxDashboard from "./components/GaxDashboard";
import TickerTape from "./components/ui/TickerTape";
import GameClock from "./components/ui/GameClock";
import { attrLabel } from "./engine/gax";
import Workshop from "./components/Workshop";
import QuestView from "./components/QuestView";
import TutorialOverlay from "./components/TutorialOverlay";
import AchievementToasts from "./components/ui/AchievementToasts";
import BalanceReportView from "./BalanceReportView";
import ContentPlanView from "./ContentPlanView";
import MapEditorView from "./mapEditor/MapEditorView";
import PerformanceTestsView, { recoverFromInterruptedPerfTest } from "./PerformanceTestsView";
import LeaderboardPage from "./LeaderboardPage";
import UserProfilePage from "./UserProfilePage";
import LeaderboardModal from "./components/LeaderboardModal";
import CloudRestoreModal from "./components/CloudRestoreModal";
import { useOnlineSync } from "./online/useOnlineSync";
import CoinCounter from "./components/ui/CoinCounter";
import MapView from "./components/MapView";
import WorkerView from "./components/WorkerView";
import MachineView from "./components/MachineView";
import PotionView from "./components/PotionView";
import { GuildPanel, ProgressPanel } from "./components/HubPanels";
import { IconCoin, IconChartUp } from "./components/ui/icons";
import IngredientInventoryView from "./components/IngredientInventoryView";
import DevDashboard from "./components/DevDashboard";
import HintBanner from "./components/ui/HintBanner";
import SpotlightHighlight from "./components/ui/SpotlightHighlight";
import { spotlight } from "./util/spotlight";
import Modal from "./components/ui/Modal";
import FATLayer from "./components/ui/FATLayer";
import Atmosphere, { applyDayNightVars } from "./components/Atmosphere";
import LoadingScreen from "./components/LoadingScreen";
import SettingsModal from "./components/SettingsModal";
import QuestTantrumOverlay, { type TantrumTrigger } from "./components/QuestTantrumOverlay";
import { useGameStore } from "./store/gameStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTantrumStore } from "./store/tantrumStore";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { fmt, fmtDuration } from "./util/format";
import { spawnFAT } from "./util/fat";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory" | "quests" | "guild" | "progress" | "dev" | "help" | "gax" | "leaderboard" | null;

// Core sprites visible the instant the workshop scene mounts — preloaded so
// they're already decoded by the time the loading screen hands off, instead
// of popping in piecemeal (bricks, then windows, then a walker mid-stride…).
const CORE_SPRITES = [
  "/sprites/background.png", "/sprites/foreground.png",
  "/sprites/window.png", "/sprites/door.png",
  "/sprites/wall-tile.png", "/sprites/floor-tile.png", "/sprites/lamp.png",
  "/sprites/machine.png",
  "/sprites/worker.png", "/sprites/worker-manic.png",
  "/sprites/worker-explorer.png", "/sprites/worker-caravan.png", "/sprites/worker-pounder.png",
  // Every potion-type bottle sprite (POTION_TYPE_DATA in potionVisuals.ts) —
  // only "Tonic" (potion-bottle.svg) was preloaded before the potion pile
  // could show several piles' worth of mixed types at once; the other 9
  // types were left to lazy-fetch the first time that type appeared,
  // showing a broken-image flash under any dev-server hiccup.
  "/sprites/potion-bottle.svg", "/sprites/potion-elixir.svg", "/sprites/potion-brew.svg",
  "/sprites/potion-philter.svg", "/sprites/potion-draught.svg", "/sprites/potion-decoction.svg",
  "/sprites/potion-concoction.svg", "/sprites/potion-extract.svg", "/sprites/potion-tincture.svg",
  "/sprites/potion-infusion.svg",
  // Surplus-stash props (surplusTuningStore.ts) and every trough width variant
  // (Workshop.tsx picks one of the four based on current machine count).
  "/sprites/surplus_sprites/sack_open.svg", "/sprites/surplus_sprites/sack_closed.svg",
  "/sprites/surplus_sprites/barell_open.svg", "/sprites/surplus_sprites/barell_closed.svg",
  "/sprites/trough-160.png", "/sprites/trough-240.png", "/sprites/trough-320.png", "/sprites/trough-400.png",
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
  // Self-healing safety net: if a /performance-tests load test got interrupted
  // before it could restore the player's real save (tab closed/crashed
  // mid-run), fix that up before anything else renders — see
  // PerformanceTestsView.tsx for how the backup is made.
  if (typeof window !== "undefined") recoverFromInterruptedPerfTest();

  // Standalone analytics route: the economy A/B balance report. Checked before
  // any hooks so it renders as a self-contained page (pathname is constant for
  // the lifetime of the load, so the early return is hook-order safe).
  if (typeof window !== "undefined" && window.location.pathname === "/balance-report") {
    return <BalanceReportView />;
  }
  // Load/perf test lab: stress-tests worker/machine counts and samples FPS.
  if (typeof window !== "undefined" && window.location.pathname === "/performance-tests") {
    return <PerformanceTestsView />;
  }
  // Standalone content & art planning surface (placeholder text/graphics tracker).
  if (typeof window !== "undefined" && window.location.pathname === "/content-plan") {
    return <ContentPlanView />;
  }
  // Hand-drawn map authoring surface (paint sprites, edit copy, export JSON).
  if (typeof window !== "undefined" && window.location.pathname === "/map-editor") {
    return <MapEditorView />;
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
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  // Uncollected-achievement count surfaces on the Guild dock slot.
  const claimableAchievements = useGameStore(
    (s) => s.unlocked_achievements.filter((id) => !s.collected_achievements.includes(id)).length
  );
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
  const cleanView = useSettingsStore((s) => s.cleanViewEnabled);
  const toggleCleanView = useSettingsStore((s) => s.toggleCleanView);
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

  // Quest-giver tantrum: checked exactly once per login, once the screen is
  // actually clear for the player to see (loading done, and no welcome-back
  // catch-up modal still covering it) — not on a timer, so it can never fire
  // mid-session while the player is looking at something else.
  const [tantrumTrigger, setTantrumTrigger] = useState<TantrumTrigger | null>(null);
  const [tantrumResult, setTantrumResult] = useState<TantrumTrigger | null>(null);
  const [hasCheckedTantrum, setHasCheckedTantrum] = useState(false);
  const setTantrumActive = useTantrumStore((s) => s.setActive);
  const runTantrumCheck = () => {
    const result = useGameStore.getState().checkQuestTantrum();
    if (result) { setTantrumActive(true); setTantrumTrigger(result); }
    return result;
  };
  useEffect(() => {
    if (hasCheckedTantrum || !ready || welcomeBack) return;
    setHasCheckedTantrum(true);
    runTantrumCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, welcomeBack, hasCheckedTantrum]);

  // Dev/testing hook — "Trigger Tantrum" button backdates the first active
  // quest to ~1s from tripping the 24h window, then re-runs the same check
  // a moment later, exactly as it would fire naturally on a real login.
  const handleForceTantrum = () => {
    if (!useGameStore.getState().forceQuestTantrumSoon()) {
      // Note: pushToast()/ToastContainer was deprecated in favour of the FAT
      // (floating text) system — spawnFAT is the live feedback path now.
      spawnFAT({
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.4,
        text: "No active quest to expire — accept one first.",
        color: "#fde68a",
        arcX: 0,
        size: "md",
        duration: 2200,
      });
      return;
    }
    window.setTimeout(runTantrumCheck, 1100);
  };

  if (!ready) return <LoadingScreen />;

  return (
    <div className={`relative flex h-full flex-col${throttleAnims ? " anim-throttle" : ""}`}>
      <Atmosphere />

      {/* HUD — floats above the scene so Workshop atmosphere covers the full viewport */}
      {!cleanView && (
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
      )}

      {/* Workshop scene — fills full height so wall + atmosphere reach the top edge */}
      <main className="relative z-[2] h-full overflow-hidden">
        <Workshop onOpen={(p, machineId?) => { if (p === "map") setMapLockedWorker(null); if (machineId) setMachineTabId(machineId); setPanel(p); }} />
      </main>

      {/* Bottom dock — Guild + Progress hold the centre; Quests and the GAX
          flank them as they unlock. Sits above the ticker tape. */}
      {!cleanView && (
        <div className={`absolute inset-x-0 z-[4] flex justify-center gap-2 ${gaxUnlocked ? "bottom-9" : "bottom-3"}`}>
          {questsUnlocked && (
            <DockButton
              label="Quests"
              icon={<ScrollText size={18} className="text-amber-700" />}
              title="Quest Board"
              onClick={() => setPanel("quests")}
            />
          )}
          <DockButton
            label="Guild"
            icon={<Trophy size={18} className="text-amber-700" />}
            title="Guild Hall — Achievements, Trophies & Rankings"
            onClick={() => setPanel("guild")}
            badge={claimableAchievements > 0 ? claimableAchievements : undefined}
          />
          <DockButton
            label="Progress"
            icon={<Sparkles size={18} className="text-amber-700" />}
            title="Progress — Upgrades & Mastery"
            onClick={() => setPanel("progress")}
            badge={masteryTokens > 0 ? masteryTokens : undefined}
          />
          {gaxUnlocked && (
            <DockButton
              label="GAX"
              icon={<Landmark size={18} className="text-amber-700" />}
              title="Grand Alchemical Exchange"
              onClick={() => setPanel("gax")}
            />
          )}
        </div>
      )}

      {/* Hidden dev toggle — lifted above the ticker tape when the GAX is open */}
      {!cleanView && (
        <button
          onClick={() => setPanel("dev")}
          className={`absolute left-2 z-[4] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100 ${gaxUnlocked ? "bottom-8" : "bottom-2"}`}
          title="Dev Dashboard"
        >
          <Settings2 size={16} />
        </button>
      )}

      {/* Trigger Tantrum — testing hook for the quest-giver tantrum sequence.
          Backdates the first active quest to ~1s from expiring, then lets
          the normal check fire it exactly as it would on a real login.
          z-[45] (above Modal's z-40) so it still works with a panel open. */}
      {!cleanView && (
        <button
          onClick={handleForceTantrum}
          className={`pointer-events-auto absolute left-11 z-[45] flex items-center gap-1 rounded-full border border-rose-800/40 bg-rose-950/30 px-2 py-1 text-[10px] font-semibold text-rose-400 opacity-60 hover:opacity-100 ${gaxUnlocked ? "bottom-8" : "bottom-2"}`}
          title="Force a quest to expire and play the tantrum sequence"
        >
          <Angry size={13} /> Trigger Tantrum
        </button>
      )}

      {/* Clean View toggle — always visible, even with everything else
          hidden, so the player can always get the chrome back. Mirrors the
          dev toggle's placement/style on the opposite corner. */}
      <button
        onClick={toggleCleanView}
        className={`pointer-events-auto absolute right-2 z-[4] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100 ${gaxUnlocked && !cleanView ? "bottom-8" : "bottom-2"}`}
        title={cleanView ? "Show UI" : "Clean View — hide UI"}
      >
        {cleanView ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>

      {/* GAX ticker tape — global marquee, only once the Exchange is unlocked */}
      {!cleanView && <TickerTape onOpen={() => setPanel("gax")} />}

      {/* Panels */}
      {panel === "inventory" && <IngredientInventoryView onClose={() => setPanel(null)} />}
      {panel === "map"    && <MapView    onClose={() => setPanel(null)} workerIndex={workerIndexForMap} lockedWorkerIndex={mapLockedWorker} />}
      {panel === "worker" && <WorkerView onClose={() => setPanel(null)} onOpenMap={(idx = 0) => { setWorkerIndexForMap(idx); setMapLockedWorker(idx); setPanel("map"); }} />}
      {panel === "machine"&& <MachineView onClose={() => setPanel(null)} initialMachineId={machineTabId} />}
      {panel === "potion" && <PotionView  onClose={() => setPanel(null)} />}
      {panel === "quests"   && <QuestView    onClose={() => setPanel(null)} />}
      {panel === "guild"    && <GuildPanel   onClose={() => setPanel(null)} />}
      {panel === "progress" && <ProgressPanel onClose={() => setPanel(null)} />}
      {panel === "help"     && <HelpModal    onClose={() => setPanel(null)} />}
      {panel === "gax"      && <GaxDashboard onClose={() => setPanel(null)} />}
      {panel === "leaderboard" && (
        <LeaderboardModal onClose={() => setPanel(null)} initialTab={leaderboardInitialTab} />
      )}
      {panel === "dev"    && <DevDashboard onClose={() => setPanel(null)} />}

      {/* Onboarding + achievement surfacing — spotlight/hints point at HUD
          and rail-badge elements that clean view hides, so suppress them
          too rather than pointing at nothing. */}
      {!cleanView && <TutorialOverlay />}
      <AchievementToasts />
      {!cleanView && <SpotlightHighlight />}
      {!cleanView && (
        <HintBanner
          onGoto={(goto) => {
            setPanel(goto.panel as Panel);
            if (goto.spotlight) window.setTimeout(() => spotlight(goto.spotlight!), 200);
          }}
        />
      )}

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

      {tantrumTrigger && (
        <QuestTantrumOverlay
          trigger={tantrumTrigger}
          onDone={() => {
            setTantrumActive(false);
            setTantrumResult(tantrumTrigger);
            setTantrumTrigger(null);
          }}
        />
      )}

      {tantrumResult && (
        <Modal title="A Customer Complaint" onClose={() => setTantrumResult(null)} accent="#f43f5e">
          <p className="mb-3 text-sm text-slate-300">
            A full day went by without a single quest fulfilled, and one quest-giver
            finally lost their patience — storming out and throwing a bottle at one
            of your workers on the way. Word travels fast in this town.
          </p>
          <p className="text-sm text-slate-300">
            For the next{" "}
            <span className="font-semibold text-rose-500">{tantrumResult.days} in-game days</span>, potion sale
            prices are down{" "}
            <span className="font-semibold text-rose-500">{tantrumResult.discountPct.toFixed(1)}%</span>.
          </p>
        </Modal>
      )}

      {welcomeBack && (
        <Modal title="Welcome Back, Brewmaster" onClose={dismissWelcome} accent="#22d3ee">
          <p className="mb-3 text-sm italic text-slate-400">
            You were away for{" "}
            <span className="font-semibold text-cyan-800 not-italic">{fmtDuration(welcomeBack.seconds)}</span>.
            A parade of adventurers passed through, helped themselves to whatever
            your shelves had ready, and left before you could even ask their guild name.
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
                <span className="inline-flex items-center gap-1"><IconChartUp /> Market Events</span>
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
                  value={<span className="inline-flex items-center gap-1"><IconCoin /> {welcomeBack.coinsEarned.toLocaleString()}</span>}
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

function DockButton({ label, icon, title, onClick, badge, dataTut }: {
  label: string;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  badge?: number;
  dataTut?: string;
}) {
  return (
    <button
      {...(dataTut ? { "data-tut": dataTut } : {})}
      onClick={onClick}
      title={title}
      className="relative flex w-[72px] flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-1 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#efe1c2] active:scale-95"
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-amber-950">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatRow({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
