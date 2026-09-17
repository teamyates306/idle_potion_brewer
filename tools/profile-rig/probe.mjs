// =============================================================================
// In-page instrumentation, injected before any app code runs.
//
// Everything here must be cheap: it runs inside the page we're measuring, so a
// heavy probe would corrupt its own numbers. The frame hook does a handful of
// arithmetic ops per frame and keeps a bounded array; the state read only
// happens when the rig pulls a sample (every SAMPLE_MS), not per frame.
// =============================================================================

/** Source injected via page.evaluateOnNewDocument — must be self-contained. */
export const PROBE_SOURCE = `(() => {
  const SAVE_KEY = "idle-potion-brewer";
  const MAX_TIMES = 4000;

  let frames = 0, sumFrame = 0, maxFrame = 0, long50 = 0, long100 = 0, long250 = 0;
  let times = [];
  let last = performance.now();
  let started = performance.now();

  // rAF cadence — the honest frame-rate signal. Stops entirely when the tab is
  // hidden, which is itself a result worth recording (the game pauses its loop).
  function onFrame(t) {
    const dt = t - last;
    last = t;
    // Ignore absurd gaps (tab resumed, debugger paused) so one stall doesn't
    // swamp the average; they're still counted as long frames.
    if (dt > 0) {
      frames++;
      if (dt < 5000) { sumFrame += dt; times.push(dt); if (times.length > MAX_TIMES) times.shift(); }
      if (dt > maxFrame) maxFrame = dt;
      if (dt > 50) long50++;
      if (dt > 100) long100++;
      if (dt > 250) long250++;
    }
    requestAnimationFrame(onFrame);
  }
  requestAnimationFrame(onFrame);

  // Main-thread responsiveness independent of rAF: how late a 100ms timer runs.
  // Survives rAF throttling, so it still says something while the tab is hidden.
  let lagSum = 0, lagMax = 0, lagCount = 0;
  let lagPrev = performance.now();
  setInterval(() => {
    const now = performance.now();
    const lag = Math.max(0, now - lagPrev - 100);
    lagPrev = now;
    lagSum += lag; lagCount++;
    if (lag > lagMax) lagMax = lag;
  }, 100);

  function pct(arr, p) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { saveBytes: 0 };
      const st = (JSON.parse(raw) || {}).state || {};
      const potionInv = st.potionInv || {};
      let potionsHeld = 0;
      for (const k in potionInv) potionsHeld += potionInv[k] || 0;
      const ingredientInv = st.ingredientInv || {};
      let ingredientsHeld = 0;
      for (const k in ingredientInv) ingredientsHeld += ingredientInv[k] || 0;
      return {
        saveBytes: raw.length,
        coins: Math.floor(st.coins || 0),
        lifetimeCoins: Math.floor(st.lifetime_coins_earned || 0),
        workers: (st.workers || []).length,
        machines: (st.machines || []).length,
        machinesRunning: (st.machines || []).filter((m) => m && m.running).length,
        workersAssigned: (st.workers || []).filter((w) => w && (w.assigned_location || w.assigned_machine_id != null || w.assigned_settlement)).length,
        discoveredPotions: (st.discoveredPotions || []).length,
        discoveredIngredients: (st.discovered || []).length,
        potionsHeld,
        ingredientsHeld,
        potionStacks: Object.keys(potionInv).length,
        totalBrews: st.total_brews || 0,
        questsCompleted: st.quests_completed_count || 0,
        unlockedLocations: (st.unlockedLocations || []).length,
        unlockedRegions: (st.unlockedRegions || []).length,
        gaxUnlocked: !!st.gaxUnlocked,
        masteryTokens: st.masteryTokens || 0,
        graphicsQuality: (st.graphics || {}).quality,
      };
    } catch (e) {
      return { saveBytes: -1, saveError: String(e && e.message || e) };
    }
  }

  function readScene() {
    let running = 0, infinite = 0;
    try {
      const anims = document.getAnimations ? document.getAnimations() : [];
      running = anims.length;
      for (const a of anims) {
        const tim = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        if (tim && tim.iterations === Infinity) infinite++;
      }
    } catch (e) { /* getAnimations unsupported */ }
    return {
      domNodes: document.querySelectorAll("*").length,
      animationsRunning: running,
      animationsInfinite: infinite,
      canvases: document.querySelectorAll("canvas").length,
      svgs: document.querySelectorAll("svg").length,
      images: document.querySelectorAll("img").length,
      modalOpen: !!document.querySelector(".fixed.inset-0.z-40, [role='dialog']"),
      revealShowing: !!document.querySelector(".reveal-dim"),
      floatingTexts: document.querySelectorAll("[style*='fat-float']").length,
    };
  }

  // Pulled by the rig once per sample; resets the frame counters so each sample
  // describes only the interval since the previous one.
  window.__rigSample = function () {
    const now = performance.now();
    const windowMs = now - started;
    const out = {
      windowMs,
      frames,
      fps: windowMs > 0 ? (frames * 1000) / windowMs : 0,
      meanFrameMs: frames > 0 ? sumFrame / frames : 0,
      p95FrameMs: pct(times, 95),
      p99FrameMs: pct(times, 99),
      maxFrameMs: maxFrame,
      longFrames50: long50,
      longFrames100: long100,
      longFrames250: long250,
      meanTimerLagMs: lagCount > 0 ? lagSum / lagCount : 0,
      maxTimerLagMs: lagMax,
      hidden: document.hidden,
      ...readScene(),
      ...readSave(),
    };
    frames = 0; sumFrame = 0; maxFrame = 0; long50 = 0; long100 = 0; long250 = 0;
    times = [];
    lagSum = 0; lagMax = 0; lagCount = 0;
    started = now;
    return out;
  };

  // Console/page errors surfaced to the rig — a 12h run that silently started
  // throwing every frame would otherwise look like a performance mystery.
  window.__rigErrors = [];
  window.addEventListener("error", (e) => {
    window.__rigErrors.push({ t: Date.now(), msg: String(e.message).slice(0, 300) });
    if (window.__rigErrors.length > 200) window.__rigErrors.shift();
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__rigErrors.push({ t: Date.now(), msg: "unhandledrejection: " + String(e.reason).slice(0, 300) });
    if (window.__rigErrors.length > 200) window.__rigErrors.shift();
  });

  // Visibility override, used by the "hidden" phase. Chrome's own background
  // throttling is disabled via launch flags (so an occluded window can't
  // corrupt an unattended run), so we drive the app's OWN visibility handling
  // directly — which is what the game loop actually checks.
  window.__rigSetHidden = function (hidden) {
    try {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
      return true;
    } catch (e) { return false; }
  };
})();`;
