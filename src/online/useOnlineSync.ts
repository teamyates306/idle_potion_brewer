import { useEffect } from "react";
import { useOnlineStore } from "./onlineStore";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Mount once in App: initialises auth and pushes stats + save to the cloud
 *  every 5 minutes of visible play (plus one shortly after signing in). */
export function useOnlineSync() {
  const init = useOnlineStore((s) => s.init);
  const session = useOnlineStore((s) => s.session);
  const nickname = useOnlineStore((s) => s.nickname);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (!session || !nickname) return;
    // First sync soon after (re)gaining a synced identity, then every 5 min.
    const kickoff = setTimeout(() => void useOnlineStore.getState().syncNow(), 10_000);
    const id = setInterval(() => {
      if (!document.hidden) void useOnlineStore.getState().syncNow();
    }, SYNC_INTERVAL_MS);
    return () => { clearTimeout(kickoff); clearInterval(id); };
  }, [session, nickname]);
}
