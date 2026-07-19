import { useState } from "react";
import Modal from "./ui/Modal";
import LeaderboardBoard from "./leaderboard/LeaderboardBoard";
import AccountPanel from "./leaderboard/AccountPanel";
import PlayerProfile from "./leaderboard/PlayerProfile";
import { useOnlineStore } from "../online/onlineStore";
import { IconTrophy, IconAccount, IconSparkle } from "./ui/icons";

interface Props {
  onClose: () => void;
  /** Force the initial tab (e.g. opened directly from Settings → Account). */
  initialTab?: "board" | "account";
  /** Render body + tab bar only (no Modal shell) — used inside the Guild hub. */
  embedded?: boolean;
}

export default function LeaderboardModal({ onClose, initialTab, embedded = false }: Props) {
  const nickname = useOnlineStore((s) => s.nickname);
  const session = useOnlineStore((s) => s.session);
  // Land newcomers on the account tab so the sign-up path is obvious.
  const [tab, setTab] = useState<"board" | "account">(initialTab ?? (session && nickname ? "board" : "account"));
  // A selected player overlays the board tab with their profile card.
  const [selected, setSelected] = useState<string | null>(null);

  const tabBar = (
    <div className="flex rounded-lg bg-slate-800 p-1">
      <button
        onClick={() => { setTab("board"); setSelected(null); }}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
          tab === "board" ? "bg-amber-700 text-white" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <IconTrophy /> Leaderboard
      </button>
      <button
        onClick={() => { setTab("account"); setSelected(null); }}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
          tab === "account" ? "bg-amber-700 text-white" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        {session && nickname ? <><IconAccount width={16} height={16} /> Account</> : <><IconSparkle /> Join</>}
      </button>
    </div>
  );

  const body = tab === "account" ? (
    <AccountPanel />
  ) : selected ? (
    <PlayerProfile nickname={selected} onBack={() => setSelected(null)} />
  ) : (
    <LeaderboardBoard onSelectPlayer={setSelected} />
  );

  if (embedded) {
    return (
      <>
        <div className="mb-3">{tabBar}</div>
        {body}
      </>
    );
  }

  return (
    <Modal title="Guild Rankings" onClose={onClose} accent="#b45309" subHeader={tabBar}>
      {body}
    </Modal>
  );
}
