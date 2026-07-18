import { useState } from "react";
import { ExternalLink, LogOut, Mail, RotateCcw, Settings2, ShieldAlert, Swords, Trash2, UploadCloud, X } from "lucide-react";
import { onlineAvailable } from "../../online/supabaseClient";
import { useOnlineStore } from "../../online/onlineStore";
import { computeStats } from "../../online/stats";
import { fmt } from "../../util/format";
import { IconCoin, IconFlask, IconSparkle, IconWorker, IconTrophy, IconWizardHat, type IconProps } from "../ui/icons";

/** Sign-in / nickname / privacy controls — shared by the in-game modal and
 *  the standalone /leaderboard page. */
export default function AccountPanel() {
  const session = useOnlineStore((s) => s.session);
  const nickname = useOnlineStore((s) => s.nickname);
  const busy = useOnlineStore((s) => s.busy);
  const lastSyncAt = useOnlineStore((s) => s.lastSyncAt);
  const syncError = useOnlineStore((s) => s.syncError);
  const rivals = useOnlineStore((s) => s.rivals);
  const { signInWithEmail, signOut, claimNickname, syncNow, deleteAccount, removeRival, restartGame } = useOnlineStore.getState();

  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!onlineAvailable) {
    return (
      <p className="rounded-lg bg-slate-800/50 px-3 py-4 text-center text-sm text-slate-400">
        Online play isn't configured in this build.
      </p>
    );
  }

  // ---- Signed out: email → magic link -----------------------------------
  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Join the guild registry to appear on the leaderboard and carry your
          workshop across devices. No password — we email you a sign-in link.
        </p>
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <ShieldAlert size={12} className="mr-1 inline text-amber-700" />
          <span className="font-semibold text-slate-400">Your data:</span> playing
          online stores your email address (sign-in only, never shown), your
          chosen nickname (public), your gameplay statistics (public on the
          leaderboard) and a snapshot of your save game (private, for
          cross-device play). Nothing else. You can delete all of it at any
          time with "Delete my online data" on this panel.
        </div>
        {linkSent ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-emerald-800/40 bg-emerald-100/40 px-3 py-2 text-sm text-emerald-800">
            <Mail size={14} className="mt-0.5 shrink-0" /> Check your inbox — a sign-in link is on its way to <span className="font-semibold">{email}</span>.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const err = await signInWithEmail(email.trim());
              if (err) setError(err);
              else setLinkSent(true);
            }}
            className="flex gap-2"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              <Mail size={14} /> Send link
            </button>
          </form>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <RestartSection online={false} />
      </div>
    );
  }

  // ---- Signed in, no nickname yet: one-time claim ------------------------
  if (!nickname) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Signed in as <span className="font-semibold text-slate-300">{session.user.email}</span>.
          Choose your guild name — <span className="font-semibold text-amber-800">this is permanent</span> and
          is what everyone sees on the leaderboard.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const err = await claimNickname(nickInput);
            if (err) setError(err);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            required
            minLength={3}
            maxLength={20}
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            placeholder="e.g. MossWitch"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            Claim
          </button>
        </form>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <button onClick={() => void signOut()} className="text-xs text-slate-500 underline hover:text-slate-400">
          Sign out
        </button>
        <RestartSection online={false} />
      </div>
    );
  }

  // ---- Fully set up ------------------------------------------------------
  const stats = computeStats();
  const snapshot: Array<[(p: IconProps) => JSX.Element, string, string]> = [
    [IconCoin, "Coins", fmt(stats.coins)],
    [IconCoin, "Earned all-time", fmt(stats.lifetime_coins)],
    [IconFlask, "Potions brewed", fmt(stats.total_brews)],
    [IconSparkle, "Discovered", fmt(stats.potions_discovered)],
    [IconWorker, "Workers", fmt(stats.workers)],
    [IconTrophy, "Achievements", fmt(stats.achievements)],
  ];

  return (
    <div className="space-y-3">
      {/* Identity */}
      <div className="rounded-xl border border-amber-800/30 bg-slate-800/40 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-lg font-bold text-amber-900"><IconWizardHat /> {nickname}</p>
            <p className="truncate text-xs text-slate-500">{session.user.email}</p>
          </div>
          <a
            href={`/user/${encodeURIComponent(nickname)}`}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-800/40 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-amber-800 hover:text-amber-700"
            title="Your public profile page"
          >
            <ExternalLink size={12} /> Public profile
          </a>
        </div>
      </div>

      {/* Current stats snapshot (local, live) */}
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">Your record (as of now)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {snapshot.map(([Icon, label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
              <span className="mr-2 flex items-center gap-1 truncate text-[11px] text-slate-400"><Icon /> {label}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-200">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sync status */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-500">
        <span>
          {syncError
            ? <span className="text-rose-700">Last sync failed: {syncError}</span>
            : lastSyncAt
            ? `Last check-in ${new Date(lastSyncAt).toLocaleTimeString()}`
            : "Syncs every 5 minutes of play."}
        </span>
        <button
          onClick={() => void syncNow()}
          className="flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-2 py-1 font-semibold text-amber-800 hover:text-amber-700"
        >
          <UploadCloud size={12} /> Sync now
        </button>
      </div>

      {/* Rivals */}
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700">
          <Swords size={10} /> Rivals ({(rivals ?? []).length}) — private to you
        </p>
        {(rivals ?? []).length === 0 ? (
          <p className="rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-500">
            No rivals yet. Look a brewmaster up on the leaderboard and declare a rivalry.
          </p>
        ) : (
          <div className="space-y-1">
            {(rivals ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-1 truncate text-slate-200"><IconWizardHat /> {r.nickname}</span>
                <button
                  onClick={() => void removeRival(r.id)}
                  className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-700"
                  title="End rivalry"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings footer */}
      <div className="border-t border-slate-700 pt-2">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-300"
        >
          <Settings2 size={13} /> Account settings
        </button>
        {settingsOpen && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => void signOut()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-200"
              >
                <LogOut size={14} /> Sign out
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-300/60 bg-rose-100/40 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100/70"
              >
                <Trash2 size={14} /> Delete my online data
              </button>
            </div>
            <button
              onClick={() => setConfirmRestart(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-950/35"
            >
              <RotateCcw size={14} /> Restart my game
            </button>
          </div>
        )}
      </div>

      {confirmRestart && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-sm">
          <p className="mb-2 text-amber-900">
            This wipes your entire workshop — coins, workers, machines, recipes,
            everything — back to Day 1, exactly like a hard reset. It also removes
            your current entry (and nickname) from the leaderboard; you'll pick a
            new nickname and start fresh on the board too. You stay signed in.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setError(null);
                const err = await restartGame();
                if (err) setError(err);
                setConfirmRestart(false);
              }}
              disabled={busy}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              Yes, restart everything
            </button>
            <button
              onClick={() => setConfirmRestart(false)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="rounded-lg border border-rose-300/60 bg-rose-100/40 px-3 py-3 text-sm">
          <p className="mb-2 text-rose-800">
            This permanently deletes your account, nickname, leaderboard entry
            and cloud save. Your local playthrough on this device is untouched.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setError(null);
                const err = await deleteAccount();
                if (err) setError(err);
                setConfirmDelete(false);
              }}
              disabled={busy}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              Yes, delete everything
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** Restart control usable in any auth state. Offline players get a purely
 *  local reset; `online` adds the leaderboard-entry wipe to the copy. */
function RestartSection({ online }: { online: boolean }) {
  const busy = useOnlineStore((s) => s.busy);
  const { restartGame } = useOnlineStore.getState();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm) {
    return (
      <div className="border-t border-slate-700 pt-2">
        <button
          onClick={() => setConfirm(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-700"
        >
          <RotateCcw size={13} /> Restart my game
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-sm">
      <p className="mb-2 text-amber-900">
        This wipes your workshop back to Day 1 — coins, workers, machines,
        recipes, everything.{online && " It also removes your current leaderboard entry and nickname; you stay signed in and pick a new one."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setError(null);
            const err = await restartGame();
            if (err) setError(err);
            setConfirm(false);
          }}
          disabled={busy}
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Yes, restart
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
