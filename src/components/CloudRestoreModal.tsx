import { useState } from "react";
import Modal from "./ui/Modal";
import { useOnlineStore } from "../online/onlineStore";

/** Shown right after a fresh sign-in when a cloud save exists: keep playing
 *  this device's save, or restore the last checked-in cloud save. */
export default function CloudRestoreModal() {
  const prompt = useOnlineStore((s) => s.restorePrompt);
  const keepLocalSave = useOnlineStore((s) => s.keepLocalSave);
  const loadCloudSave = useOnlineStore((s) => s.loadCloudSave);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!prompt) return null;

  const when = new Date(prompt.savedAt).toLocaleString();

  return (
    <Modal title="Welcome back to the Guild" onClose={keepLocalSave} accent="#b45309">
      <p className="mb-4 text-sm text-slate-400">
        A cloud save from your account was last checked in on{" "}
        <span className="font-semibold text-amber-800">{when}</span>. Which
        workshop do you want to continue?
      </p>
      <div className="space-y-2">
        <button
          onClick={keepLocalSave}
          className="w-full rounded-lg border border-amber-700/50 bg-amber-950/25 px-4 py-3 text-left hover:bg-amber-950/40"
        >
          <p className="text-sm font-semibold text-amber-900">
            Keep this device's playthrough
            <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-amber-700">Recommended</span>
          </p>
          <p className="text-xs text-slate-500">
            Already caught up with everything earned while you were away.
          </p>
        </button>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            const err = await loadCloudSave(); // reloads the page on success
            if (err) { setError(err); setLoading(false); }
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left hover:border-amber-800/50 disabled:opacity-60"
        >
          <p className="text-sm font-semibold text-slate-200">
            {loading ? "Restoring…" : `Pick up from last check-in (${when})`}
          </p>
          <p className="text-xs text-slate-500">
            Load the cloud save. This device's current progress is overwritten.
          </p>
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </Modal>
  );
}
