import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "orca9.db";
const DATABASE_VERSION = 2;
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

  await database.execAsync("PRAGMA foreign_keys = ON;");

  await database.execAsync("PRAGMA auto_vacuum = INCREMENTAL;");
  await ensureCoreTables(database);

  await ensureProfileColumns(database);

  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);

  return database;
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
      program_day_id TEXT,
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
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
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
