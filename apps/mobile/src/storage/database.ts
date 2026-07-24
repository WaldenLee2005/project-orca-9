import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "orca9.db";
const DATABASE_VERSION = 2;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openAndMigrateDatabase();
  }

  return databasePromise;
}

async function openAndMigrateDatabase() {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await database.execAsync("PRAGMA foreign_keys = ON;");

  const versionRow = await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await database.execAsync("PRAGMA auto_vacuum = INCREMENTAL;");

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

  if (currentVersion < 2) {
    await addColumnIfMissing(database, "user_profiles", "auth_user_id", "TEXT");
    await addColumnIfMissing(database, "user_profiles", "email", "TEXT");
    await addColumnIfMissing(database, "user_profiles", "handle", "TEXT");
    await addColumnIfMissing(database, "user_profiles", "avatar_url", "TEXT");
    await addColumnIfMissing(database, "user_profiles", "profile_visibility", "TEXT NOT NULL DEFAULT 'private'");
  }

  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);

  return database;
}

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  }
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function compactLocalDatabase() {
  const database = await getDatabase();
  await database.execAsync("PRAGMA incremental_vacuum(32); PRAGMA optimize;");
}
