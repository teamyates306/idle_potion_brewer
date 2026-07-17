import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import PlayerProfile from "./components/leaderboard/PlayerProfile";
import { useOnlineStore } from "./online/onlineStore";

/** Standalone public profile at /user/<nickname>. */
export default function UserProfilePage({ nickname }: { nickname: string }) {
  const init = useOnlineStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <div className="min-h-dvh bg-slate-900 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-lg">
        <a
          href="/leaderboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-700"
        >
          <ArrowLeft size={16} /> Guild Rankings
        </a>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-md">
          <PlayerProfile nickname={nickname} fullPage />
        </div>
      </div>
    </div>
  );
}
