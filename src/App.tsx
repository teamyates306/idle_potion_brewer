import { useEffect, useState } from "react";
import { Settings, Settings2, ScrollText, Trophy, Sparkles, HelpCircle, Landmark, Eye, EyeOff } from "lucide-react";
import HelpModal from "./components/HelpModal";
import GaxDashboard from "./components/GaxDashboard";
import TickerTape from "./components/ui/TickerTape";
import GameClock from "./components/ui/GameClock";
import { attrLabel } from "./engine/gax";
import Workshop, { MACHINE_HUE } from "./components/Workshop";
import { HUE_SHIFTS } from "./components/art/WorkerArt";
import { tintedSpriteName } from "./util/hueRotate";
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
import { useGameStore } from "./store/gameStore";
import { useSettingsStore } from "./store/settingsStore";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { fmt, fmtDuration } from "./util/format";

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

// Pre-tinted sheets (scripts/pretintSprites.ts) — every hue the game can
// actually draw, so no worker or cauldron decodes its sheet on first paint.
const TINTED_SPRITES = [
  ...["worker", "worker-manic", "worker-explorer", "worker-caravan", "worker-pounder"].flatMap((name) =>
    HUE_SHIFTS.filter((h) => h !== 0).map((h) => "/sprites/tinted/" + tintedSpriteName(name + ".png", h))),
  ...MACHINE_HUE.filter((h) => h !== 0).map((h) => "/sprites/tinted/" + tintedSpriteName("machine.png", h)),
];

// Load AND decode: onload only means the bytes arrived; the first draw would
// still pay for decoding, which is exactly the hitch the loading screen is
// meant to absorb. A missing sprite resolves anyway so it can't hang the gate.
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = () => { if (typeof img.decode === "function") img.decode().then(done, done); else done(); };
    img.onerror = done;
    img.src = src;
  });
}

/** Web font actually loaded (display=swap would otherwise reflow every label
 *  a moment after reveal). Bounded so a blocked font CDN can't hang the gate. */
function fontsReady(timeoutMs: number): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const load = Promise.all([
    document.fonts.load("400 12px Silkscreen"),
    document.fonts.load("700 12px Silkscreen"),
    document.fonts.ready,
  ]).then(() => undefined, () => undefined);
  return Promise.race([load, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/** Resolve once the main thread has been quiet for `needed` consecutive
 *  probes: a 16 ms timer that fires more than `maxLagMs` late means
 *  something (React commit, layout, a measure/recentre timer, an image
 *  decode callback) was hogging the thread. This is deliberately NOT a
 *  frame-rate check — display refresh is throttled/variable per device and
 *  says nothing about whether OUR warm-up work has finished. Ends with two
 *  animation frames so the settled state has actually been painted.
 *  Bounded by `timeoutMs` so a genuinely slow device still gets in. */
function mainThreadQuiet(needed: number, maxLagMs: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let good = 0;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(deadline); resolve(); };
    const deadline = setTimeout(finish, timeoutMs);
    const probe = () => {
      const scheduled = performance.now();
      setTimeout(() => {
        if (done) return;
        const lag = performance.now() - scheduled - 16;
        good = lag <= maxLagMs ? good + 1 : 0;
        if (good >= needed) requestAnimationFrame(() => requestAnimationFrame(finish));
        else probe();
      }, 16);
    };
    probe();
  });
}

// Warm-up budget: the overlay never lifts before MIN (long enough for the
// scene's own post-mount recentre timers at 150/500/1200 ms to have fired
// behind it), and never later than MAX.
const LOADING_MIN_MS = 1300;
const LOADING_MAX_MS = 7000;
const LOADING_FADE_MS = 400;

// Dev-only chrome (Dev Dashboard toggle) renders only when the app is
// served from localhost — never on the hosted live build.
const IS_LOCALHOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);

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

  // Loading screen as a WARM-UP, not just a download gate. The scene mounts
  // immediately underneath the overlay, so its expensive first frames (SVG
  // wall raster, the potion pile's filtered bottles, layout + recentre
  // timers, image decodes, the font swap) all happen out of sight. The
  // overlay lifts only when: every sprite is decoded, the web font is in,
  // and the main thread has gone quiet (no more mount/layout/decode work)
  // for a run of probes — bounded by LOADING_MAX_MS so a slow device is
  // never locked out.
  const [loading, setLoading] = useState<"warming" | "fading" | "done">("warming");
  useEffect(() => {
    // Defensive reset: a page navigated to us (e.g. "Back to the workshop"
    // from the leaderboard) can arrive with a stray scroll/pan position —
    // most commonly iOS Safari carrying over a pinch-zoom from a focused
    // input on the previous page. The workshop is a fixed single-viewport
    // app, so it should always start pinned at the origin.
    window.scrollTo(0, 0);
    applyDayNightVars();
    let cancelled = false;
    const t0 = performance.now();
    const assets = Promise.all([...CORE_SPRITES, ...TINTED_SPRITES].map(preloadImage));
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, LOADING_MIN_MS));
    Promise.all([assets, fontsReady(3000), minDelay])
      .then(() => mainThreadQuiet(12, 30, Math.max(0, LOADING_MAX_MS - (performance.now() - t0))))
      .then(() => {
        if (cancelled) return;
        setLoading("fading");
        setTimeout(() => { if (!cancelled) setLoading("done"); }, LOADING_FADE_MS);
      });
    return () => { cancelled = true; };
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

  return (
    <>
    {loading !== "done" && <LoadingScreen fading={loading === "fading"} fadeMs={LOADING_FADE_MS} />}
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
              className="rounded-full p-1.5 text-amber-300/60 hover:bg-amber-950/50 hover:text-amber-200 transition lg:p-2 lg:[&_svg]:h-5 lg:[&_svg]:w-5"
              title="How to Play"
            >
              <HelpCircle size={16} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-full p-1.5 text-amber-300/60 hover:bg-amber-950/50 hover:text-amber-200 transition lg:p-2 lg:[&_svg]:h-5 lg:[&_svg]:w-5"
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
        <div className={`absolute inset-x-0 z-[4] flex justify-center gap-2 lg:gap-3 ${gaxUnlocked ? "bottom-9 lg:bottom-11" : "bottom-3 lg:bottom-6"}`}>
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
      {!cleanView && IS_LOCALHOST && (
        <button
          onClick={() => setPanel("dev")}
          className={`absolute left-2 z-[4] rounded-full p-2 text-stone-500 opacity-40 hover:opacity-100 ${gaxUnlocked ? "bottom-8" : "bottom-2"}`}
          title="Dev Dashboard"
        >
          <Settings2 size={16} />
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
    </>
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
      className="relative flex w-[72px] flex-col items-center gap-1 rounded-xl border border-amber-800/50 bg-[#f4e9d0] px-1 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-amber-900 shadow-md backdrop-blur-sm transition hover:bg-[#efe1c2] active:scale-95 lg:w-auto lg:min-w-[9rem] lg:flex-row lg:justify-center lg:gap-2.5 lg:rounded-2xl lg:px-5 lg:py-3.5 lg:text-xs lg:[&_svg]:h-6 lg:[&_svg]:w-6"
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-amber-950 lg:-right-1.5 lg:-top-1.5 lg:h-5 lg:w-5 lg:text-[10px]">
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
