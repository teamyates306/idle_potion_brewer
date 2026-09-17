// =============================================================================
// What the rig DOES, so every metric can be attributed to an activity.
//
// The session is a repeating cycle of labelled phases. Each is a kind of play
// (or non-play) with a distinct performance signature, so the analyser can
// compare like with like — both across phases within a cycle ("is tapping more
// expensive than idling?") and across cycles over 12h ("does idling get more
// expensive once the save is big?"). That second question is the whole point of
// a long run, and it only works because the phases repeat unchanged.
//
// Input is delivered as REAL mouse clicks at the element's coordinates, not
// synthesised DOM events: it exercises the same hit-testing and pointer path a
// player does, and the map's location nodes ignore synthetic clicks anyway.
//
// Every action is best-effort and records what it managed to do. A 12h run must
// not die because one button wasn't there yet.
// =============================================================================

export const SEL = {
  cauldron: '[data-tut="cauldron"]',
  brewerCog: '[data-tut="brewer"]',
  workersBadge: '[data-tut="workers"]',
  brewingBadge: '[data-tut="brewing"]',
  marketBadge: '[data-tut="market"]',
  settings: 'button[title="Settings"]',
  map: 'button[title="Open the Map"]',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Locate an element and return its centre in viewport coordinates.
 * `spec` is either a CSS selector or {text} / {titleRe} matched over buttons.
 */
async function locate(page, spec) {
  return page.evaluate((s) => {
    // "Rendered and not hidden" — deliberately NOT "inside the viewport",
    // because panel controls (Sell Everything, upgrade rows) sit below the
    // fold of a scrollable list. Anything off-screen is scrolled into view
    // before its coordinates are taken.
    const visible = (el) => {
      if (!el || el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inViewport = (el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    };
    let el = null;
    if (typeof s === "string") {
      el = [...document.querySelectorAll(s)].find(visible) || null;
    } else if (s.text) {
      const re = new RegExp(s.text, "i");
      el = [...document.querySelectorAll("button, [role='button']")].find(
        (b) => visible(b) && !b.disabled && re.test((b.textContent || "").trim()),
      ) || null;
    } else if (s.title) {
      const re = new RegExp(s.title, "i");
      el = [...document.querySelectorAll("button, [role='button']")].find(
        (b) => visible(b) && !b.disabled && re.test(b.title || ""),
      ) || null;
    } else if (s.closeBtn) {
      // Modal close buttons are an icon with no text at all, which is why a
      // text matcher never found them — and why a single stuck modal used to
      // block every later click in the run.
      el = [...document.querySelectorAll("button")].find(
        (b) => visible(b) && b.querySelector("svg") &&
          /lucide-x\b|lucide-X\b/.test(b.querySelector("svg").getAttribute("class") || ""),
      ) || null;
    } else if (s.mapNode) {
      // A map location node: the circular button inside the wrapper that
      // carries the location's label.
      const re = new RegExp(s.mapNode, "i");
      const wrap = [...document.querySelectorAll("div.absolute")].find(
        (d) => visible(d) && re.test((d.textContent || "").trim()) && d.querySelector("button.rounded-full"),
      );
      el = wrap ? wrap.querySelector("button.rounded-full") : null;
    }
    if (!el) return null;
    if (!inViewport(el)) {
      el.scrollIntoView({ block: "center", inline: "center" });
    }
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    // Still off-screen after scrolling (fixed ancestors, odd layout): clicking
    // those coordinates would hit whatever is actually there, so refuse.
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
    return { x, y };
  }, spec);
}

/**
 * Real mouse click on whatever `spec` resolves to. Returns true if it hit.
 *
 * Reveal-aware: a discovery / level-up / quest popup covers the whole screen
 * and eats the click, and at a hundred-plus brews an hour one lands in the
 * middle of a multi-step flow constantly. Dismiss it and retry, exactly as a
 * player would — without this, every sequence longer than a couple of clicks
 * (selling, hiring, assigning) silently failed part-way through.
 */
export async function click(page, spec, settle = 350) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const blocked = await page.evaluate(() => !!document.querySelector(".reveal-dim")).catch(() => false);
    if (blocked) {
      await page.mouse.click(400, 300).catch(() => {});
      await sleep(250);
    }
    const at = await locate(page, spec).catch(() => null);
    if (!at) {
      if (attempt === 0) { await sleep(250); continue; }
      return false;
    }
    try {
      await page.mouse.click(at.x, at.y);
    } catch { return false; }
    if (settle) await sleep(settle);
    return true;
  }
  return false;
}

/**
 * Clear anything covering the scene, and confirm it actually went.
 *
 * This matters more than it sounds: a modal backdrop is `fixed inset-0` at
 * z-40, well above the rail badges at z-5, so ONE modal left open silently
 * swallows every subsequent click for the rest of the run. That is exactly
 * what happened before — selling, hiring and assigning all reported "clicked"
 * while the click was landing on a stale backdrop.
 */
export async function closeOverlays(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await page.evaluate(() => {
      const reveal = !!document.querySelector(".reveal-dim");
      // Any full-screen fixed layer that takes pointer events is in the way.
      // NB: never test a fixed-position element with offsetParent — it is
      // always null for `position: fixed`, so an earlier version of this check
      // skipped every overlay it was written to catch and cheerfully reported
      // "nothing blocking" while a modal backdrop ate the whole run's clicks.
      const blocker = [...document.querySelectorAll("div.fixed.inset-0")].find((d) => {
        const cs = getComputedStyle(d);
        if (cs.pointerEvents === "none" || cs.display === "none" || cs.visibility === "hidden") return false;
        const r = d.getBoundingClientRect();
        if (r.width < innerWidth * 0.5 || r.height < innerHeight * 0.5) return false;
        return (parseInt(cs.zIndex, 10) || 0) >= 20;
      });
      return { reveal, blocked: !!blocker };
    }).catch(() => ({ reveal: false, blocked: false }));

    if (!state.reveal && !state.blocked) return true;

    if (state.reveal) {
      // Reveals are dismissed by tapping anywhere on them.
      await page.mouse.click(400, 300).catch(() => {});
      await sleep(250);
      continue;
    }
    // Prefer the modal's own close control, then a backdrop click (Modal.tsx
    // closes on backdrop click; the panel itself stops propagation), then Esc.
    if (await click(page, { closeBtn: true }, 300)) continue;
    const vp = await page.evaluate(() => [innerWidth, innerHeight]).catch(() => [1280, 800]);
    await page.mouse.click(8, Math.round(vp[1] / 2)).catch(() => {});
    await sleep(250);
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(200);
  }
  return false;
}

/** Read the live save so the rig can make sensible decisions. */
export async function readState(page) {
  return page.evaluate(() => {
    try {
      const st = (JSON.parse(localStorage.getItem("idle-potion-brewer")) || {}).state || {};
      const machines = st.machines || [];
      const workers = st.workers || [];
      return {
        coins: Math.floor(st.coins || 0),
        workers: workers.length,
        machines: machines.length,
        totalBrews: st.total_brews || 0,
        discovered: (st.discoveredPotions || []).length,
        potionStacks: Object.keys(st.potionInv || {}).length,
        idleWorkers: workers.filter((w) => w && !w.assigned_location && w.assigned_machine_id == null && !w.assigned_settlement).length,
        machinesNoRecipe: machines.filter((m) => m && !(m.recipe_slots || []).some(Boolean)).length,
        machinesStopped: machines.filter((m) => m && !m.running).length,
        ingredients: Object.values(st.ingredientInv || {}).reduce((a, b) => a + (b || 0), 0),
      };
    } catch { return null; }
  }).catch(() => null);
}

// ---- Composite game flows (each verified against the live build) -------------

/** Give a cauldron a recipe and start it: slot → ingredient → "Set to Brew". */
async function ensureBrewing(page, tally) {
  const st = await readState(page);
  if (!st || (st.machinesNoRecipe === 0 && st.machinesStopped === 0)) return;

  if (!(await click(page, SEL.brewingBadge, 700))) return;

  if (st.machinesNoRecipe > 0) {
    // The five recipe slots are the square buttons in the panel.
    if (await click(page, "button.aspect-square", 600)) {
      // The picker lists owned ingredients as "Name×N" — take the first.
      if (await click(page, { text: "×\\s*\\d+" }, 600)) tally.recipesSet++;
    }
  }
  if (await click(page, { text: "^Set to Brew$" }, 600)) tally.started++;
  await closeOverlays(page);
}

/** Spend coins the way a player would: more brewers, more hands. */
async function spendCoins(page, tally) {
  if (await click(page, SEL.brewingBadge, 700)) {
    if (await click(page, { title: "^Buy Brewer" }, 700)) tally.machinesBought++;
    await closeOverlays(page);
  }
  if (await click(page, SEL.workersBadge, 700)) {
    if (await click(page, { text: "^Hire Worker" }, 700)) tally.hired++;
    await closeOverlays(page);
  }
}

/**
 * Put an idle worker to work. Gatherers first — without ingredients every
 * cauldron stalls and the run profiles a dead scene — then auto-clickers.
 */
async function assignIdleWorker(page, tally, preferBrewer) {
  const st = await readState(page);
  if (!st || st.idleWorkers === 0) return;

  if (!(await click(page, SEL.workersBadge, 700))) return;
  if (!(await click(page, { text: "Lvl \\d" }, 700))) { await closeOverlays(page); return; }

  if (preferBrewer) {
    if (await click(page, { text: "^Brewer$" }, 700)) {
      if (await click(page, { text: "The Bubbler|Brewer \\d" }, 600)) tally.assignedBrewer++;
    }
  } else if (await click(page, { text: "^Location$" }, 900)) {
    // Map opens locked to this worker: tap the node, then confirm in the modal.
    if (await click(page, { mapNode: "Damp Hollow" }, 900)) {
      if (await click(page, { text: "^Assign .* to " }, 700)) tally.assignedLocation++;
      else if (await click(page, { text: "^Send$" }, 700)) tally.assignedLocation++;
    }
  }
  await closeOverlays(page);
}

/** Cash in the pile so the potion inventory (and the save) stays realistic. */
async function sellAll(page, tally) {
  const st = await readState(page);
  if (st && st.potionStacks === 0) return; // nothing to sell yet
  if (!(await click(page, SEL.marketBadge, 900))) return;
  // The Market has tabs ("Sell" / "Discovered") and the sell control only
  // exists under Sell, below the potion list — so select the tab, scroll the
  // list, then click. Missing the tab step is why earlier runs never sold a
  // thing and the economy flat-lined at the starting 100 coins.
  await click(page, { text: "^Sell$" }, 400);
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 150);
    if (sc) sc.scrollTop = sc.scrollHeight;
  }).catch(() => {});
  await sleep(300);
  if (await click(page, { text: "Sell Everything" }, 800)) tally.sold++;
  await closeOverlays(page);
}

// ---- Phases -----------------------------------------------------------------

async function phaseIdle(page, ms) {
  await closeOverlays(page);
  await sleep(ms);
  return { note: "no input — the battery-drain baseline" };
}

async function phaseTap(page, ms, opts) {
  const perSecond = opts?.tapsPerSecond ?? 6;
  const end = Date.now() + ms;
  let taps = 0;
  const at = await locate(page, SEL.cauldron).catch(() => null);
  if (!at) { await sleep(ms); return { taps: 0, note: "cauldron not on screen" }; }
  while (Date.now() < end) {
    await page.mouse.click(at.x, at.y).catch(() => {});
    taps++;
    // A discovery reveal will swallow taps until it's dismissed.
    if (taps % 30 === 0) await closeOverlays(page);
    await sleep(Math.max(10, 1000 / perSecond));
  }
  return { taps };
}

async function phasePanels(page, ms) {
  const panels = [
    ["workers", SEL.workersBadge], ["stash", { text: "^Stash$" }], ["brewing", SEL.brewingBadge],
    ["market", SEL.marketBadge], ["quests", { text: "^Quests$" }], ["guild", { text: "^Guild$" }],
    ["progress", { text: "^Progress$" }], ["gax", { text: "^GAX$" }], ["map", SEL.map],
  ];
  const dwell = Math.max(1200, Math.floor(ms / panels.length));
  const opened = [];
  for (const [name, spec] of panels) {
    await closeOverlays(page);
    if (await click(page, spec, 500)) {
      opened.push(name);
      await sleep(Math.floor(dwell * 0.5));
      // Scroll the panel — long lists are where a big save gets expensive.
      await page.evaluate(() => {
        const sc = [...document.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200);
        if (sc) sc.scrollTop = sc.scrollHeight;
      }).catch(() => {});
      await sleep(Math.floor(dwell * 0.4));
    }
    await closeOverlays(page);
  }
  return { opened, openedCount: opened.length };
}

async function phaseManage(page, ms) {
  const tally = { recipesSet: 0, started: 0, machinesBought: 0, hired: 0, assignedLocation: 0, assignedBrewer: 0, sold: 0 };
  const before = await readState(page);
  await closeOverlays(page);

  await sellAll(page, tally);
  await ensureBrewing(page, tally);
  await spendCoins(page, tally);
  // Keep roughly two gatherers per cauldron fed before adding auto-clickers.
  const s = await readState(page);
  const preferBrewer = !!s && s.workers > s.machines * 2;
  await assignIdleWorker(page, tally, preferBrewer);
  await ensureBrewing(page, tally);

  const after = await readState(page);
  const spent = ms - 0;
  const left = spent - 0;
  if (left > 0) await sleep(Math.max(0, Math.min(left, ms)));
  return { ...tally, before, after };
}

async function phaseStress(page, ms) {
  // Pan the scene, then sit with a modal open over a live scene — the
  // combination that historically cost the most.
  await closeOverlays(page);
  await page.evaluate(() => {
    const sc = document.querySelector(".cursor-grab, .cursor-grabbing");
    if (!sc) return;
    let x = 0;
    const id = setInterval(() => { x += 40; sc.scrollLeft = 200 + 180 * Math.sin(x / 120); }, 33);
    setTimeout(() => clearInterval(id), 6000);
  }).catch(() => {});
  await sleep(6500);
  await click(page, SEL.brewerCog, 500);
  await sleep(Math.max(1000, ms - 8000));
  await closeOverlays(page);
  return { note: "scene panned, then a modal held open over a live scene" };
}

async function phaseHidden(page, ms) {
  await closeOverlays(page);
  await page.evaluate(() => window.__rigSetHidden && window.__rigSetHidden(true)).catch(() => {});
  await sleep(ms);
  await page.evaluate(() => window.__rigSetHidden && window.__rigSetHidden(false)).catch(() => {});
  await sleep(500);
  return { note: "document.hidden forced — measures the APP's own response, not Chrome throttling" };
}

/** Runs once at the start: get the game actually producing before profiling. */
export async function bootstrap(page) {
  const tally = { recipesSet: 0, started: 0, machinesBought: 0, hired: 0, assignedLocation: 0, assignedBrewer: 0, sold: 0 };
  // The save is written on a throttle, so a freshly-loaded profile has nothing
  // in localStorage for the first couple of seconds. Acting on that empty read
  // makes bootstrap think there's nothing to do and skip the whole setup.
  for (let i = 0; i < 20; i++) {
    const s = await readState(page);
    if (s && s.machines > 0) break;
    await sleep(500);
  }
  await closeOverlays(page);
  await ensureBrewing(page, tally);
  await assignIdleWorker(page, tally, false);
  await ensureBrewing(page, tally);
  return { ...tally, state: await readState(page) };
}

export const ACTIONS = {
  idle: phaseIdle,
  tap: phaseTap,
  panels: phasePanels,
  manage: phaseManage,
  stress: phaseStress,
  hidden: phaseHidden,
};

/** One cycle of the session. Weights are fractions, so the same shape works
 *  for a 5-minute smoke test and a 12-hour run. */
export const CYCLE = [
  { phase: "idle",   weight: 0.26, label: "Idle — scene running, no input" },
  { phase: "tap",    weight: 0.14, label: "Active tapping — click-to-brew burst" },
  { phase: "manage", weight: 0.12, label: "Managing — sell, buy, hire, assign" },
  { phase: "panels", weight: 0.14, label: "Browsing panels — every screen opened and scrolled" },
  { phase: "idle",   weight: 0.20, label: "Idle (second stretch)" },
  { phase: "hidden", weight: 0.09, label: "Backgrounded — app told the tab is hidden" },
  { phase: "stress", weight: 0.05, label: "Stress — panning, modal over live scene" },
];

export function buildSchedule(totalMs, cycleMs) {
  const cycles = Math.max(1, Math.round(totalMs / cycleMs));
  const out = [];
  for (let c = 0; c < cycles; c++) {
    for (const step of CYCLE) out.push({ ...step, cycle: c + 1, durationMs: Math.round(cycleMs * step.weight) });
  }
  return out;
}
