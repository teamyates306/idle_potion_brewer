import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import LeaderboardBoard from "./components/leaderboard/LeaderboardBoard";
import AccountPanel from "./components/leaderboard/AccountPanel";
import CloudRestoreModal from "./components/CloudRestoreModal";
import { useOnlineStore } from "./online/onlineStore";
import { useOnlineSync } from "./online/useOnlineSync";

/** Standalone public leaderboard at /leaderboard — readable without signing
 *  in; signing in from here works too (magic links land back on this page). */
export default function LeaderboardPage() {
  useOnlineSync();
  const init = useOnlineStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <div className="min-h-dvh bg-slate-900 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-lg">
        <a
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-700"
        >
          <ArrowLeft size={16} /> Back to the workshop
        </a>
        <h1 className="mb-1 text-2xl font-bold text-amber-900">🏆 Guild Rankings</h1>
        <p className="mb-5 text-sm italic text-slate-400">
          The registry of every brewmaster who has signed the guild ledger.
        </p>

        <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-md">
          <LeaderboardBoard
            onSelectPlayer={(nick) => { window.location.href = `/user/${encodeURIComponent(nick)}`; }}
          />
        </div>

        <h2 className="mb-2 text-lg font-semibold text-amber-900">Your account</h2>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-md">
          <AccountPanel />
        </div>
      </div>
      <CloudRestoreModal />
    </div>
  );
}
