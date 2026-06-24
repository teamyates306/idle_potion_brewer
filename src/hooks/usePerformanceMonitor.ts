import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";

/**
 * Measures actual rendering FPS via requestAnimationFrame.
 *
 * Throttle logic:
 *   – 5 consecutive seconds at < 30 fps  →  downgradeGraphics() level 1 (motes off)
 *   – 10 more consecutive seconds at < 30 fps  →  level 2 (vignette + dayNight off)
 *
 * FPS recovers above 30 → low-fps counter resets (no auto-upgrade; player controls that).
 */
export function usePerformanceMonitor() {
  const downgradeGraphics = useGameStore((s) => s.downgradeGraphics);

  useEffect(() => {
    let frameCount    = 0;
    let lastMark      = performance.now();
    let lowFPSSecs    = 0;
    let downgradeLevel = 0;
    let rafId: number;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      frameCount++;

      const elapsed = now - lastMark;
      if (elapsed < 1000) return;

      const fps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastMark   = now;

      if (fps < 30) {
        lowFPSSecs++;

        if (downgradeLevel === 0 && lowFPSSecs >= 5) {
          downgradeLevel = 1;
          lowFPSSecs     = 0;   // reset — now watch for second threshold
          downgradeGraphics();
        } else if (downgradeLevel === 1 && lowFPSSecs >= 10) {
          downgradeLevel = 2;
          downgradeGraphics();
        }
      } else {
        lowFPSSecs = 0;
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [downgradeGraphics]);
}
