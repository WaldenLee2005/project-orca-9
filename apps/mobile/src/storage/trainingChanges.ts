const listeners = new Set<() => void>();

export function subscribeToTrainingChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Persistence must never depend on a reminder refresh (or another observer) succeeding.
export function emitTrainingChange(): void {
  for (const listener of [...listeners]) {
    try {
      void Promise.resolve(listener()).catch(() => {});
    } catch {
      // A failed observer must not prevent other observers or a completed save.
    }
  }
}
