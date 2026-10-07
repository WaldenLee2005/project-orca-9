import { derivePersonalRecordEvents, type PersonalRecordEvent, type PRSharingWindow, type PRVisibility } from "./prPublishingModel";
import type { SocialPersonalRecordPoint } from "../../storage/workoutsRepository";

export type PRSharingPreferences = { enabled: boolean; visibility: PRVisibility; pendingCount: number; lastError: string | null };
type AccountState = {
  enabled: boolean;
  visibility: PRVisibility;
  windows: PRSharingWindow[];
  pending: PersonalRecordEvent[];
  settled: string[];
  lastError: string | null;
};
type Owner = { userId: string | null; observedAt: string };
const OWNER_KEY = "orca9.prPublisherOwner.v1";
const keyFor = (userId: string) => `orca9.prSharing.v1:${encodeURIComponent(userId)}`;
const emptyState = (): AccountState => ({ enabled: false, visibility: "friends", windows: [], pending: [], settled: [], lastError: null });
const visibilityValid = (value: unknown): value is PRVisibility => value === "private" || value === "friends" || value === "public";

export function createPRPublishingService(dependencies: {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  getCurrentUserId(): Promise<string | null>;
  getHistory(): Promise<SocialPersonalRecordPoint[]>;
  publish(userId: string, event: PersonalRecordEvent): Promise<void>;
  now(): number;
}) {
  let queue: Promise<void> = Promise.resolve();
  let observedUserId: string | null | undefined;
  const drains = new Map<string, Promise<void>>();
  // Retain authentication boundaries even when a disk write fails. Subsequent operations
  // retry those boundaries in order before deriving any publication candidates.
  const transitions: Owner[] = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* Observers never affect saved state. */ } } };
  const serialize = <T>(action: () => Promise<T>): Promise<T> => {
    const operation = queue.then(action);
    queue = operation.then(() => undefined, () => undefined);
    return operation;
  };
  async function readAccount(userId: string): Promise<AccountState> {
    const raw = await dependencies.storage.getItem(keyFor(userId));
    if (raw === null) return emptyState();
    try {
      const state: unknown = JSON.parse(raw);
      if (!validAccount(state)) throw new Error();
      return state;
    } catch { throw new Error("Your PR sharing settings could not be read. Existing data was preserved."); }
  }
  async function saveAccount(userId: string, state: AccountState) {
    await dependencies.storage.setItem(keyFor(userId), JSON.stringify(state));
    notify();
  }
  async function readOwner(): Promise<Owner | null> {
    const raw = await dependencies.storage.getItem(OWNER_KEY);
    if (raw === null) return null;
    try {
      const owner = JSON.parse(raw);
      if ((owner.userId !== null && typeof owner.userId !== "string") || !validDate(owner.observedAt)) throw new Error();
      return owner;
    } catch { throw new Error("Your PR sharing account state could not be read. Existing data was preserved."); }
  }
  async function flushTransitions() {
    while (transitions.length) {
      const next = transitions[0];
      const owner = await readOwner();
      if (owner?.userId && owner.userId !== next.userId) {
        const state = await readAccount(owner.userId);
        state.windows = state.windows.map((window) => window.to === null ? { ...window, to: next.observedAt } : window);
        await saveAccount(owner.userId, state);
      }
      if (next.userId) {
        const state = await readAccount(next.userId);
        if (state.enabled && !state.windows.some((window) => window.to === null)) {
          state.windows.push({ from: next.observedAt, to: null });
          await saveAccount(next.userId, state);
        }
      }
      await dependencies.storage.setItem(OWNER_KEY, JSON.stringify(next));
      transitions.shift();
    }
  }
  function recordAuth(userId: string | null, at = new Date(dependencies.now()).toISOString()) {
    if (observedUserId !== userId) {
      observedUserId = userId;
      transitions.push({ userId, observedAt: at });
    }
  }
  async function currentAccount(expectedUserId?: string): Promise<string | null> {
    const userId = await dependencies.getCurrentUserId();
    recordAuth(userId);
    await flushTransitions();
    if (expectedUserId && userId !== expectedUserId) throw new Error("Sign in to this account to change PR sharing.");
    return userId;
  }
  async function assertCurrent(userId: string) {
    const actual = await dependencies.getCurrentUserId();
    recordAuth(actual);
    if (actual !== userId || observedUserId !== userId || transitions.length) throw new Error("Your account changed. PR publishing will retry for the original account.");
  }
  async function storeError(userId: string, error: unknown) {
    const state = await readAccount(userId);
    if (!state.enabled) return;
    state.lastError = error instanceof Error ? error.message : "PR publishing will retry when you reconnect.";
    await saveAccount(userId, state);
  }
  async function drain(userId: string) {
    try {
      for (;;) {
        const event = await serialize(async () => {
          await flushTransitions();
          const state = await readAccount(userId);
          if (!state.enabled || !state.pending.length) return null;
          await assertCurrent(userId);
          return state.pending[0];
        });
        if (!event) return;
        // Cloud calls never hold the local state queue. Opt-out, audience changes,
        // suppression and preference reads can complete while a request is in flight.
        await dependencies.publish(userId, event);
        await serialize(async () => {
          const state = await readAccount(userId);
          state.pending = state.pending.filter((pending) => pending.eventId !== event.eventId);
          state.settled = [...new Set([...state.settled, event.eventId])];
          state.lastError = null;
          await saveAccount(userId, state);
        });
      }
    } catch (error) {
      await serialize(() => storeError(userId, error));
      throw error;
    }
  }
  return {
    observeAuth(userId: string | null) {
      recordAuth(userId);
      return serialize(flushTransitions);
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getPreferences(userId: string): Promise<PRSharingPreferences> {
      return serialize(async () => {
        await currentAccount(userId);
        const state = await readAccount(userId);
        return { enabled: state.enabled, visibility: state.visibility, pendingCount: state.pending.length, lastError: state.lastError };
      });
    },
    setPreferences(userId: string, input: { enabled: boolean; visibility: PRVisibility }): Promise<void> {
      return serialize(async () => {
        if (typeof input.enabled !== "boolean" || !visibilityValid(input.visibility)) throw new Error("Choose valid PR sharing settings.");
        await currentAccount(userId);
        const state = await readAccount(userId);
        const at = new Date(dependencies.now()).toISOString();
        if (input.enabled !== state.enabled) {
          state.windows = state.windows.map((window) => window.to === null ? { ...window, to: at } : window);
          if (input.enabled) state.windows.push({ from: at, to: null });
          // Disabling cancels all outstanding intentions. Re-enabling establishes a fresh
          // baseline and never republishes an older cancelled/deleted/completed event.
          if (!input.enabled) {
            state.settled = [...new Set([...state.settled, ...state.pending.map((event) => event.eventId)])];
            state.pending = [];
            state.windows = [];
          }
        }
        state.enabled = input.enabled;
        state.visibility = input.visibility;
        state.pending = state.pending.map((event) => ({ ...event, visibility: input.visibility }));
        state.lastError = null;
        await assertCurrent(userId);
        await saveAccount(userId, state);
      });
    },
    suppress(userId: string, eventId: string): Promise<void> {
      return serialize(async () => {
        await currentAccount(userId);
        const state = await readAccount(userId);
        state.pending = state.pending.filter((event) => event.eventId !== eventId);
        state.settled = [...new Set([...state.settled, eventId])];
        await saveAccount(userId, state);
      });
    },
    async retry(): Promise<void> {
      const userId = await serialize(async () => {
        const userId = await currentAccount();
        if (!userId) return null;
        const state = await readAccount(userId);
        if (!state.enabled) return null;
        try {
          const history = await dependencies.getHistory();
          await assertCurrent(userId);
          const seen = new Set([...state.settled, ...state.pending.map((event) => event.eventId)]);
          const events = derivePersonalRecordEvents(history, state.windows, state.visibility, dependencies.now());
          state.pending.push(...events.filter((event) => !seen.has(event.eventId)));
          // Persist candidates before starting any network request. A crash before this
          // write is recoverable by derivation; a crash after it retries the same event ID.
          state.lastError = null;
          await saveAccount(userId, state);
          return userId;
        } catch (error) {
          await storeError(userId, error);
          throw error;
        }
      });
      if (!userId) return;
      const existing = drains.get(userId);
      if (existing) return existing;
      const operation = drain(userId);
      drains.set(userId, operation);
      try { await operation; } finally { if (drains.get(userId) === operation) drains.delete(userId); }
    }
  };
}

function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function validAccount(value: unknown): value is AccountState {
  if (!value || typeof value !== "object") return false;
  const state = value as AccountState;
  return typeof state.enabled === "boolean" && visibilityValid(state.visibility)
    && Array.isArray(state.windows) && state.windows.every((window) => validDate(window.from) && (window.to === null || validDate(window.to)))
    && Array.isArray(state.settled) && state.settled.every((id) => typeof id === "string")
    && (state.lastError === null || typeof state.lastError === "string")
    && Array.isArray(state.pending) && state.pending.every((event) => typeof event.eventId === "string"
      && typeof event.id === "string" && typeof event.liftKey === "string" && typeof event.exerciseName === "string"
      && validDate(event.startedAt) && validDate(event.completedAt) && visibilityValid(event.visibility)
      && Number.isFinite(event.weight) && event.weight >= 0 && event.weight <= 10000
      && Number.isInteger(event.reps) && event.reps > 0 && event.reps <= 100
      && (event.previousWeight === null || Number.isFinite(event.previousWeight)));
}
