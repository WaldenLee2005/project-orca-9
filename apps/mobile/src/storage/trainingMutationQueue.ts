let mutationQueue: Promise<void> = Promise.resolve();

/** Program reconciliation and workout writes share one ordering across both stores. */
export function serializeTrainingMutation<T>(action: () => Promise<T>): Promise<T> {
  const operation = mutationQueue.then(action);
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
