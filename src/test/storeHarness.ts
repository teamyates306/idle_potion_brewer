// UI-test harness: snapshot the freshly-initialised gameStore state and restore
// it between tests, so component tests can freely mutate the store.
import { useGameStore } from "../store/gameStore";
import type { GameState } from "../store/gameStore";

const initialState = { ...useGameStore.getState() };

/** Restore the pristine store (actions included) — call in beforeEach/afterEach. */
export function resetGameStore(): void {
  useGameStore.setState(initialState, true);
}

/** Patch the game store for a test scenario. */
export function patchGameStore(patch: Partial<GameState>): void {
  useGameStore.setState(patch);
}

export { useGameStore };
