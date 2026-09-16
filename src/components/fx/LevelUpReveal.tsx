import WorkerArt from "../art/WorkerArt";
import MachineArt from "../art/MachineArt";
import type { WorkerSpecialization } from "../../types";
import RevealShell from "./RevealShell";

export const LEVEL_UP_REVEAL_MS = 2600;

const SPEC_LABEL: Record<WorkerSpecialization, string> = {
  none: "Worker", standard: "Worker", explorer: "Explorer",
  caravan: "Caravan", pounder: "Pounder", manic: "Manic",
};

export type LevelUpSubject =
  | { kind: "worker"; name: string; specialization: WorkerSpecialization; hue: number }
  | { kind: "machine"; name: string; hue: number };

/**
 * The "level up" moment for a worker OR a brewing machine — same shell as a
 * potion discovery / quest reward (see RevealShell), shorter-lived
 * (LEVEL_UP_REVEAL_MS) since it's the most frequent of the four. Teal for a
 * worker, amber for a cauldron, so the two are distinguishable at a glance
 * even mid-queue.
 */
export default function LevelUpReveal({ subject, level, onDone }: { subject: LevelUpSubject; level: number; onDone: () => void }) {
  const accent = subject.kind === "worker" ? "#5eead4" : "#fbbf24";
  const roleLabel = subject.kind === "worker" ? SPEC_LABEL[subject.specialization] : "Cauldron";

  return (
    <RevealShell
      durationMs={LEVEL_UP_REVEAL_MS}
      onDone={onDone}
      ringColor={accent}
      kicker="Level up!"
      title={
        <span className="mt-1 max-w-[86vw] text-center text-lg font-bold leading-tight text-amber-100" style={{ fontFamily: "'Silkscreen', monospace", textShadow: `0 0 18px ${accent}, 0 2px 6px rgba(0,0,0,0.95)` }}>
          {subject.name}
        </span>
      }
      subtitle={
        <span className="mt-1.5 text-sm font-semibold text-amber-200/80" style={{ fontFamily: "'Silkscreen', monospace" }}>
          {roleLabel} · Level {level}
        </span>
      }
      icon={
        <div style={{ width: 96, height: 96, filter: `drop-shadow(0 0 10px ${accent}88)` }}>
          {subject.kind === "worker"
            ? <WorkerArt size={96} specialization={subject.specialization} active hueShift={subject.hue} />
            : <MachineArt size={96} brewing={false} progress={1} hue={subject.hue} />}
        </div>
      }
    />
  );
}
