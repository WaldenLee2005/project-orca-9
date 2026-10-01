import AsyncStorage from "@react-native-async-storage/async-storage";

export const TRAINING_SCHEMA_VERSION = "6";
export const TRAINING_SCHEMA_KEY = "orca9.trainingSchemaVersion";

// One-time, user-requested prelaunch reset. Never clear profile or authentication keys.
const TRAINING_KEYS = [
  "orca9.workoutSessions",
  "orca9.restDays",
  "orca9.trainingPrograms.v1",
  "orca9.programLibrary.v2",
  "orca9.programLibrary.v3"
];

type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem" | "multiRemove">;

export function createTrainingStorageInitializer(storage: Storage) {
  let ready: Promise<void> | null = null;
  return function ensureReady(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        const version = await storage.getItem(TRAINING_SCHEMA_KEY);
        if (version === TRAINING_SCHEMA_VERSION) return;
        if (version !== null && Number(version) > Number(TRAINING_SCHEMA_VERSION)) throw new Error("This training data needs a newer version of Orca.");
        await storage.multiRemove(TRAINING_KEYS);
        // Mark complete only after cleanup succeeds. All repository writes wait for this.
        await storage.setItem(TRAINING_SCHEMA_KEY, TRAINING_SCHEMA_VERSION);
      })().catch((error) => { ready = null; throw error; });
    }
    return ready;
  };
}

export const ensureWebTrainingStorage = createTrainingStorageInitializer(AsyncStorage);
