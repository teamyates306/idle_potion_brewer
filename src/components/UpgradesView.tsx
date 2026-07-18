import { useState } from "react";
import Modal from "./ui/Modal";
import { useGameStore, playerClickPower, playerClickPowerCost, GLOBAL_UNLOCKS } from "../store/gameStore";
import { fmt } from "../util/format";
import { ICONS, IconCoin, IconCheck, IconSparkle } from "./ui/icons";

export default function UpgradesView({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const coins = useGameStore((s) => s.coins);
  const level = useGameStore((s) => s.player_click_power_level);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const buyPlayerClickPower = useGameStore((s) => s.buyPlayerClickPower);
  const buyGlobalUnlock = useGameStore((s) => s.buyGlobalUnlock);

  const currentPower = playerClickPower(level);
  const nextPower = playerClickPower(level + 1);
  const cost = playerClickPowerCost(level);
  const affordable = coins >= cost;

  const body = (
    <>
      {/* ── Section 1: Player Click Power ── */}
      <section className="mb-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Player Click Power
        </h3>
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-200">Click Power</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Each cauldron click shaves time off the current brew.
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Current: <span className="font-bold text-violet-800">-{currentPower.toFixed(2)}s</span>
                {" "}→ Next: <span className="font-bold text-green-700">-{nextPower.toFixed(2)}s</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">Level {level}</p>
            </div>
          </div>
          <ClickPowerBtn cost={cost} affordable={affordable} onBuy={buyPlayerClickPower} />
        </div>
      </section>

      {/* ── Section 2: Permanent Unlocks ── */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Permanent Unlocks
        </h3>
        <div className="space-y-3">
          {GLOBAL_UNLOCKS.map((unlock) => {
            const owned = unlocked_globals.includes(unlock.id);
            const canAfford = coins >= unlock.cost;
            const UnlockIcon = ICONS[unlock.icon];
            return (
              <div
                key={unlock.id}
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4"
              >
                <div className="mb-3 flex items-start gap-3">
                  <span className="text-2xl">{UnlockIcon && <UnlockIcon />}</span>
                  <div>
                    <p className="font-semibold text-slate-200">{unlock.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{unlock.description}</p>
                  </div>
                </div>
                {owned ? (
                  <div className="flex items-center gap-2 rounded-lg bg-green-900/30 px-3 py-2">
                    <span className="flex items-center gap-1 text-sm text-green-400"><IconCheck /> Purchased</span>
                  </div>
                ) : (
                  <button
                    disabled={!canAfford}
                    onClick={() => buyGlobalUnlock(unlock.id)}
                    className={`flex w-full items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                      canAfford
                        ? "border-violet-500/60 bg-violet-600/20 text-violet-200 hover:bg-violet-600/30"
                        : "border-slate-700 bg-slate-800/40 text-slate-500"
                    }`}
                  >
                    <IconCoin /> {fmt(unlock.cost)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );

  if (embedded) return body;
  return (
    <Modal title="Global Upgrades" onClose={onClose} accent="#7d6a9c">
      {body}
    </Modal>
  );
}

function ClickPowerBtn({
  cost,
  affordable,
  onBuy,
}: {
  cost: number;
  affordable: boolean;
  onBuy: () => void;
}) {
  const [spending, setSpending] = useState(false);

  const handle = () => {
    if (!affordable || spending) return;
    setSpending(true);
    window.setTimeout(() => {
      onBuy();
      setSpending(false);
    }, 320);
  };

  return (
    <button
      disabled={!affordable || spending}
      onClick={handle}
      className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
        spending
          ? "border-violet-400/40 bg-violet-500/10 text-violet-800/70"
          : affordable
          ? "border-violet-500/60 bg-violet-600/20 text-violet-200 hover:bg-violet-600/30"
          : "border-slate-700 bg-slate-800/40 text-slate-500"
      }`}
    >
      {spending ? <span className="flex items-center justify-center gap-1"><IconSparkle /> Upgrading…</span> : <span className="flex items-center justify-center gap-1"><IconCoin /> {fmt(cost)}</span>}
    </button>
  );
}
