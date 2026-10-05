import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "orca9.db";
const DATABASE_VERSION = 9;
const PRELAUNCH_RESET_VERSION = 6;
const DATABASE_OPEN_TIMEOUT_MS = 8000;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = withTimeout(
      openAndMigrateDatabase(),
      DATABASE_OPEN_TIMEOUT_MS,
      `SQLite did not open within ${DATABASE_OPEN_TIMEOUT_MS}ms.`
    ).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

async function openAndMigrateDatabase() {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await initializeDatabase(database);
  return database;
}

export async function initializeDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync("PRAGMA foreign_keys = ON;");

  await database.execAsync("PRAGMA auto_vacuum = INCREMENTAL;");
  await database.withTransactionAsync(async () => {
    const version = (await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version;"))?.user_version ?? 0;
    if (version > DATABASE_VERSION) throw new Error("This training data needs a newer version of Orca.");
    if (version < PRELAUNCH_RESET_VERSION) {
      // User-requested prelaunch reset of training data only, in foreign-key order.
      await database.execAsync(`
        DROP TABLE IF EXISTS set_entries;
        DROP TABLE IF EXISTS workout_exercises;
        DROP TABLE IF EXISTS workout_sessions;
        DROP TABLE IF EXISTS consistency_days;
        DROP TABLE IF EXISTS training_programs;
        DROP TABLE IF EXISTS program_library;
      `);
    }
    await ensureCoreTables(database);
    const setColumns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(set_entries);");
    if (!setColumns.some((column) => column.name === "duration_seconds")) {
      await database.execAsync("ALTER TABLE set_entries ADD COLUMN duration_seconds INTEGER;");
    }
    if (!setColumns.some((column) => column.name === "effort")) await database.execAsync("ALTER TABLE set_entries ADD COLUMN effort TEXT;");
    if (!setColumns.some((column) => column.name === "is_warmup")) await database.execAsync("ALTER TABLE set_entries ADD COLUMN is_warmup INTEGER NOT NULL DEFAULT 0;");
    if (!setColumns.some((column) => column.name === "note")) await database.execAsync("ALTER TABLE set_entries ADD COLUMN note TEXT;");
    const exerciseColumns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(workout_exercises);");
    if (!exerciseColumns.some((column) => column.name === "prescription_json")) await database.execAsync("ALTER TABLE workout_exercises ADD COLUMN prescription_json TEXT;");
    await ensureProfileColumns(database);
    await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

async function ensureCoreTables(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      goal TEXT NOT NULL,
      experience_level TEXT NOT NULL,
      available_equipment TEXT NOT NULL DEFAULT '[]',
      preferred_schedule TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      program_plan_json TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      workout_session_id TEXT NOT NULL,
      exercise_id TEXT,
      custom_exercise_name TEXT,
      exercise_name_snapshot TEXT NOT NULL,
      exercise_order INTEGER NOT NULL,
      program_entry_id TEXT,
      prescription_json TEXT,
      saved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS set_entries (
      id TEXT PRIMARY KEY NOT NULL,
      workout_exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL NOT NULL,
      reps INTEGER NOT NULL,
      duration_seconds INTEGER,
      effort TEXT,
      is_warmup INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS consistency_days (
      date_key TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind = 'rest'),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_library (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at
      ON workout_sessions(started_at);

    CREATE INDEX IF NOT EXISTS idx_workout_sessions_completed_at
      ON workout_sessions(completed_at);

    CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_order
      ON workout_exercises(workout_session_id, exercise_order);

    CREATE INDEX IF NOT EXISTS idx_set_entries_workout_exercise
      ON set_entries(workout_exercise_id, set_number);
  `);
}

async function ensureProfileColumns(database: SQLite.SQLiteDatabase) {
  const columns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(user_profiles);");
  const existingColumnNames = new Set(columns.map((column) => column.name));

  await addColumnIfMissing(database, existingColumnNames, "auth_user_id", "TEXT");
  await addColumnIfMissing(database, existingColumnNames, "email", "TEXT");
  await addColumnIfMissing(database, existingColumnNames, "handle", "TEXT");
  await addColumnIfMissing(database, existingColumnNames, "avatar_url", "TEXT");
  await addColumnIfMissing(database, existingColumnNames, "profile_visibility", "TEXT NOT NULL DEFAULT 'private'");
}

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  existingColumnNames: Set<string>,
  columnName: string,
  columnDefinition: string
) {
  if (!existingColumnNames.has(columnName)) {
    await database.execAsync(`ALTER TABLE user_profiles ADD COLUMN ${columnName} ${columnDefinition};`);
    existingColumnNames.add(columnName);
  }
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function compactLocalDatabase() {
  const database = await getDatabase();
  await database.execAsync("PRAGMA incremental_vacuum(32); PRAGMA optimize;");
}
