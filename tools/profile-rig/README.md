# Profiling rig

Plays the **real hosted game** in a real Chrome for hours, recording what it was
doing alongside what that cost. Built to answer one question a short profile
can't: *does a long session degrade, and where?*

```bash
# the full session
node tools/profile-rig/run.mjs --hours=12

# a quick check that everything still works (~6 min)
node tools/profile-rig/run.mjs --minutes=6 --cycle=3 --sample=5

# then
node tools/profile-rig/analyse.mjs tools/profile-rig/runs/<run-id>
```

## Why three metric sources

No single source sees the whole picture, and the interesting failures hide in
the gaps between them.

| Source | What it sees | Why it's here |
|---|---|---|
| CDP `Performance.getMetrics` | Renderer **main thread**: script, layout, style recalc, heap, DOM nodes | "Is our JavaScript expensive?" |
| In-page probe (`probe.mjs`) | Real rAF cadence, long frames, timer lag, running animations, **live game state** from localStorage | "Does it feel smooth, and how deep into the playthrough are we?" |
| OS per-process CPU (`sysmetrics.mjs`) | Chrome's **GPU process** and renderer process CPU/memory | CDP cannot see the GPU process, and that's where compositing lands — the path that makes phones hot |

Every sample is tagged with the phase that was running, so cost is always
attributable to an activity rather than averaged into mush.

## What it does — the cycle

The session repeats a fixed cycle so the same activity can be compared at hour 1
and hour 12. That comparison is the entire point of a long run.

| Phase | Share | What it does |
|---|---:|---|
| `idle` | 46% | No input at all — the battery-drain baseline |
| `tap` | 14% | Cauldron click bursts (~6/s) |
| `manage` | 12% | Sells, buys brewers, hires, assigns workers, sets recipes |
| `panels` | 14% | Opens and scrolls every panel — Workers, Stash, Brewing, Market, Quests, Guild, Progress, GAX, Map |
| `hidden` | 9% | Tells the app the tab is hidden |
| `stress` | 5% | Pans the scene, then holds a modal open over a live scene |

Input is delivered as **real mouse clicks** at element coordinates, not
synthesised DOM events — it exercises the same hit-testing a player does, and
the map's location nodes ignore synthetic clicks entirely.

Before profiling starts, a `bootstrap` step gets the game actually producing
(recipe set, cauldron started, a worker sent gathering). Without it the rig
profiles a static, unplayed scene and tells you nothing.

## Output

`tools/profile-rig/runs/<id>/`

- `samples.jsonl` — one row per sample, tagged with phase and live game state
- `events.jsonl` — phase boundaries, what each play action achieved, page errors
- `manifest.json` — config and machine details
- `report.md` — written by `analyse.mjs`

Everything is appended as it happens, so a run that dies at hour 9 still
analyses fine.

## Options

| Flag | Default | Notes |
|---|---|---|
| `--hours` / `--minutes` | 12 min | Total run length |
| `--cycle` | 30 | Minutes per cycle |
| `--sample` | 10 | Seconds between samples |
| `--sysEvery` | 3 | Take an OS CPU sample every N samples (it's the expensive one) |
| `--cpuThrottle` | 1 | CDP CPU throttle; **4 ≈ a mid-range phone** and surfaces choke points a desktop hides |
| `--viewport` | desktop | `desktop` or `mobile` (390×844 @3x) |
| `--port` | 9222 | Debugging port; use a distinct one to run two rigs at once |
| `--url` | the Vercel deploy | Point at a local `npm run preview` to profile a branch |
| `--chrome` | auto-detected | Explicit browser path |

## Things worth knowing

- **Run it headful and leave the window visible.** Headless has no real
  compositor, so GPU figures would be meaningless. The launch flags disable
  occlusion/background throttling so an unattended overnight run measures the
  game rather than Chrome's power saving.
- **Chrome is driven over a debugging port, not puppeteer's pipe.** On this
  machine the `chrome.exe` we spawn hands off to another process and exits
  within ~15s, which silently killed a pipe-based session two minutes into
  every run. The port survives the handoff, and the rig reconnects if the
  connection drops mid-session.
- **The `hidden` phase measures the app, not the browser.** It overrides
  `document.hidden` and fires `visibilitychange`, so it tests whether *our*
  loops stop. Chrome still composites the visible window, so don't read its
  GPU figure as "background cost".
- **Each run starts from a fresh browser profile**, so the playthrough always
  begins at a new game and runs are comparable.
