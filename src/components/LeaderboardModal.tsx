import { useState } from "react";
import Modal from "./ui/Modal";
import LeaderboardBoard from "./leaderboard/LeaderboardBoard";
import AccountPanel from "./leaderboard/AccountPanel";
import PlayerProfile from "./leaderboard/PlayerProfile";
import { useOnlineStore } from "../online/onlineStore";

interface Props {
  onClose: () => void;
  /** Force the initial tab (e.g. opened directly from Settings → Account). */
  initialTab?: "board" | "account";
}

export default function LeaderboardModal({ onClose, initialTab }: Props) {
  const nickname = useOnlineStore((s) => s.nickname);
  const session = useOnlineStore((s) => s.session);
  // Land newcomers on the account tab so the sign-up path is obvious.
  const [tab, setTab] = useState<"board" | "account">(initialTab ?? (session && nickname ? "board" : "account"));
  // A selected player overlays the board tab with their profile card.
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Modal
      title="Guild Rankings"
      onClose={onClose}
      accent="#b45309"
      subHeader={
        <div className="flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => { setTab("board"); setSelected(null); }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              tab === "board" ? "bg-amber-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🏆 Leaderboard
          </button>
          <button
            onClick={() => { setTab("account"); setSelected(null); }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              tab === "account" ? "bg-amber-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {session && nickname ? "🧙 Account" : "✨ Join"}
          </button>
        </div>
      }
    >
      {tab === "account" ? (
        <AccountPanel />
      ) : selected ? (
        <PlayerProfile nickname={selected} onBack={() => setSelected(null)} />
      ) : (
        <LeaderboardBoard onSelectPlayer={setSelected} />
      )}
    </Modal>
  );
}
