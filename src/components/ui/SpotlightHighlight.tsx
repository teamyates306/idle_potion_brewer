import { useEffect, useState } from "react";
import { subscribeSpotlight } from "../../util/spotlight";

// Mounted once near the app root. Reuses the tutorial's `.tut-target` glow CSS
// (see index.css) to point at arbitrary elements outside the tutorial flow,
// e.g. a hint's "Go there" button. Retries on an interval so it still finds
// the target after the panel it lives in finishes mounting.
export default function SpotlightHighlight() {
  const [job, setJob] = useState<{ selector: string; expiresAt: number } | null>(null);

  useEffect(() => {
    return subscribeSpotlight((selector, durationMs) => {
      setJob({ selector, expiresAt: Date.now() + durationMs });
    });
  }, []);

  useEffect(() => {
    if (!job) return;
    const apply = () => {
      document.querySelectorAll(".spotlight-target").forEach((el) => el.classList.remove("spotlight-target", "tut-target"));
      if (Date.now() >= job.expiresAt) {
        setJob(null);
        return;
      }
      document.querySelectorAll(job.selector).forEach((el) => el.classList.add("spotlight-target", "tut-target"));
    };
    apply();
    const id = window.setInterval(apply, 150);
    return () => {
      window.clearInterval(id);
      document.querySelectorAll(".spotlight-target").forEach((el) => el.classList.remove("spotlight-target", "tut-target"));
    };
  }, [job]);

  return null;
}
